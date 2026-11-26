import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { canExport, canExportContracts } from './entitlements';
import { formatCurrency, formatDateLocalized } from './finance';
import { getCurrentDerivedLicenseState } from './licenseStorage';
import { buildXlsxBlob, triggerBlobDownload } from './xlsxWriter';
import type {
  AppLanguage,
  Borrower,
  CurrencyCode,
  InterestType,
  Loan,
  LoanSchedule,
  Payment,
  PortalShare,
} from '../types/loan';

function localizeInterestMethod(interestType: InterestType | undefined, isKm: boolean): string {
  if (interestType === 'reducing') {
    return isKm ? 'ការប្រាក់ថយតាមដើម (Reducing)' : 'Reducing Balance';
  }
  if (interestType === 'interest_only') {
    return isKm ? 'បង់តែការប្រាក់ (ដើមចុងគ្រា)' : 'Interest-Only (Balloon)';
  }
  return isKm ? 'ការប្រាក់ថេរ (Flat)' : 'Flat Rate';
}

function escapeHtml(val: string | number | undefined | null): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const GOOGLE_FONTS_CSS_URL =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Kantumruy+Pro:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';

let embeddedFontCssPromise: Promise<string> | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read blob'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

async function getEmbeddedFontCss(): Promise<string> {
  if (embeddedFontCssPromise) {
    return embeddedFontCssPromise;
  }

  embeddedFontCssPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3000);
      const res = await fetch(GOOGLE_FONTS_CSS_URL, {
        mode: 'cors',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!res.ok) return '';

      let cssText = await res.text();
      const urlMatches = Array.from(cssText.matchAll(/url\((['"]?)(https:\/\/[^)'"]+)\1\)/g));
      const uniqueUrls = Array.from(new Set(urlMatches.map((m) => m[2])));

      const replacements = await Promise.all(
        uniqueUrls.map(async (fontUrl) => {
          try {
            const fontRes = await fetch(fontUrl, { mode: 'cors' });
            if (!fontRes.ok) return null;
            const blob = await fontRes.blob();
            const dataUrl = await blobToDataUrl(blob);
            return [fontUrl, dataUrl] as const;
          } catch {
            return null;
          }
        })
      );

      for (const pair of replacements) {
        if (pair) {
          cssText = cssText.split(pair[0]).join(pair[1]);
        }
      }

      if (!cssText) {
        embeddedFontCssPromise = null;
      }
      return cssText;
    } catch {
      embeddedFontCssPromise = null;
      return '';
    }
  })();

  return embeddedFontCssPromise;
}

async function prepareImagesForCapture(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (img) => {
      const rawSrc = img.getAttribute('src') || '';
      if (!rawSrc) {
        img.style.display = 'none';
        return;
      }

      if (!rawSrc.startsWith('data:')) {
        try {
          const absoluteUrl = rawSrc.startsWith('http')
            ? rawSrc
            : new URL(rawSrc, window.location.origin).toString();
          const res = await fetch(absoluteUrl);
          if (res.ok) {
            const blob = await res.blob();
            const dataUrl = await blobToDataUrl(blob);
            img.src = dataUrl;
          }
        } catch {
          // Leave existing src or fallback below if decode fails
        }
      }

      if (!img.complete) {
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          window.setTimeout(done, 1500);
        });
      }

      if (img.naturalWidth === 0) {
        img.style.display = 'none';
      }
    })
  );
}

async function waitForLayoutAndFonts(): Promise<void> {
  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 800)),
    ]);
  }
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

export async function renderElementToPng(element: HTMLElement): Promise<string> {
  await prepareImagesForCapture(element);
  await waitForLayoutAndFonts();

  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(element.scrollWidth || rect.width));
  const height = Math.max(1, Math.ceil(element.scrollHeight || rect.height));
  const fontCss = await getEmbeddedFontCss();

  try {
    return await toPng(element, {
      pixelRatio: 2,
      backgroundColor: '#FFFFFF',
      width,
      height,
      cacheBust: false,
      ...(fontCss ? { fontEmbedCSS: fontCss } : { skipFonts: true }),
    });
  } catch {
    return await toPng(element, {
      pixelRatio: 2,
      backgroundColor: '#FFFFFF',
      width,
      height,
      cacheBust: false,
      skipFonts: true,
    });
  }
}

export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await renderElementToPng(element);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to render PDF image'));
    img.src = dataUrl;
  });

  if (img.width === 0 || img.height === 0) {
    throw new Error('Rendered PDF image is empty');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const usableWidth = pageWidth - margin * 2;
  const imgHeight = (img.height * usableWidth) / img.width;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(dataUrl, 'PNG', margin, position, usableWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(dataUrl, 'PNG', margin, position, usableWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  const pdfBlob = pdf.output('blob');
  triggerBlobDownload(pdfBlob, filename);
}

async function renderOffscreenHtmlToPdf(
  buildContent: (container: HTMLDivElement) => void,
  filename: string,
  lang: AppLanguage
): Promise<void> {
  // Mount inside an invisible fixed host at (0,0) so container itself stays at (0,0) with opacity 1 for SVG foreignObject
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '0';
  host.style.top = '0';
  host.style.width = '794px';
  host.style.opacity = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-9999';
  host.style.overflow = 'visible';

  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = '794px';
  container.style.background = '#FFFFFF';
  container.style.color = '#0F172A';
  container.style.padding = '36px 40px';
  container.style.boxSizing = 'border-box';
  container.style.fontFamily =
    lang === 'km'
      ? '"Kantumruy Pro", "Plus Jakarta Sans", sans-serif'
      : '"Plus Jakarta Sans", "Kantumruy Pro", sans-serif';
  container.style.lineHeight = lang === 'km' ? '1.75' : '1.5';

  buildContent(container);
  host.appendChild(container);
  document.body.appendChild(host);

  try {
    await exportElementToPdf(container, filename);
  } finally {
    document.body.removeChild(host);
  }
}

export async function exportLoanContractPdf(params: {
  loan: Loan;
  borrower?: Borrower;
  schedules: LoanSchedule[];
  lenderName: string;
  lenderPhone?: string;
  lenderLogoDataUrl?: string;
  lang: AppLanguage;
  useKhmerNumerals?: boolean;
}): Promise<void> {
  const {
    loan,
    borrower,
    schedules,
    lenderName,
    lenderPhone,
    lenderLogoDataUrl,
    lang,
    useKhmerNumerals = false,
  } = params;

  if (!canExportContracts(getCurrentDerivedLicenseState())) {
    throw new Error('Business license required for contract export');
  }

  const isKm = lang === 'km';
  const rowsHtml = schedules
    .slice(0, 60)
    .map(
      (s) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">#${s.installmentNumber}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">${escapeHtml(formatDateLocalized(s.dueDate, lang, useKhmerNumerals))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:right;">${escapeHtml(formatCurrency(s.principalDue, loan.currency, lang, useKhmerNumerals))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:right;">${escapeHtml(formatCurrency(s.interestDue, loan.currency, lang, useKhmerNumerals))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(s.totalDue, loan.currency, lang, useKhmerNumerals))}</td>
      </tr>
    `
    )
    .join('');

  const safeLogoUrl =
    lenderLogoDataUrl && lenderLogoDataUrl.startsWith('data:image/')
      ? lenderLogoDataUrl
      : '/assets/aistudio/image_01667597.png';

  const safeSigUrl =
    loan.signatureDataUrl && loan.signatureDataUrl.startsWith('data:image/')
      ? loan.signatureDataUrl
      : '';
  const sigBlock = safeSigUrl
    ? `<img src="${escapeHtml(safeSigUrl)}" style="height:64px;border-bottom:1px solid #94A3B8;display:block;margin-bottom:6px;" />`
    : `<div style="height:64px;border-bottom:1px solid #94A3B8;margin-bottom:6px;"></div>`;

  await renderOffscreenHtmlToPdf(
    (container) => {
      container.innerHTML = `
        <div style="border-bottom:2px solid #0D9488;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
          <div>
            <img src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(lenderName)}" style="max-height:52px;width:auto;max-width:180px;object-fit:contain;display:block;margin-bottom:8px;" />
            <h1 style="margin:0;font-size:22px;font-weight:700;">${isKm ? 'កិច្ចសន្យាខ្ចីប្រាក់' : 'PERSONAL LOAN AGREEMENT'}</h1>
            <p style="margin:4px 0 0;font-size:12px;color:#475569;">${isKm ? 'លេខកិច្ចសន្យា' : 'Contract ID'}: ${escapeHtml(loan.id)}</p>
          </div>
          <div style="text-align:right;font-size:12px;color:#475569;">
            <div style="font-weight:700;color:#0F172A;font-size:13px;">${escapeHtml(lenderName)}</div>
            ${lenderPhone ? `<div style="font-family:monospace;">${escapeHtml(lenderPhone)}</div>` : ''}
            <div style="margin-top:4px;">${isKm ? 'កាលបរិច្ឆេទ' : 'Start Date'}: ${escapeHtml(formatDateLocalized(loan.startDate, lang, useKhmerNumerals))}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;font-size:13px;">
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px;">
            <div style="font-weight:700;margin-bottom:6px;">${isKm ? 'ភាគីម្ចាស់ប្រាក់ (អ្នកឱ្យខ្ចី)' : 'Lender'}</div>
            <div>${escapeHtml(lenderName)}</div>
            ${lenderPhone ? `<div style="color:#475569;font-family:monospace;margin-top:2px;">${escapeHtml(lenderPhone)}</div>` : ''}
          </div>
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px;">
            <div style="font-weight:700;margin-bottom:6px;">${isKm ? 'ភាគីអ្នកខ្ចីប្រាក់' : 'Borrower'}</div>
            <div>${escapeHtml(borrower?.name || loan.borrowerName)}</div>
            ${borrower?.phone ? `<div style="color:#475569;">${escapeHtml(borrower.phone)}</div>` : ''}
            ${borrower?.nationalIdNumber ? `<div style="color:#475569;">ID: ${escapeHtml(borrower.nationalIdNumber)}</div>` : ''}
            ${borrower?.address ? `<div style="color:#475569;">${escapeHtml(borrower.address)}</div>` : ''}
          </div>
        </div>

        <div style="border:1px solid #E2E8F0;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div><strong>${isKm ? 'ប្រាក់ដើម' : 'Principal'}:</strong> ${escapeHtml(formatCurrency(loan.principal, loan.currency, lang, useKhmerNumerals))}</div>
            <div><strong>${isKm ? 'វិធីគណនាការប្រាក់' : 'Interest Method'}:</strong> ${escapeHtml(loan.interestRate)}% · ${escapeHtml(localizeInterestMethod(loan.interestType, isKm))}</div>
            <div><strong>${isKm ? 'ចំនួនវគ្គ' : 'Installments'}:</strong> ${escapeHtml(loan.termCount)} (${escapeHtml(loan.frequency)})</div>
            <div><strong>${isKm ? 'ប្រាក់ត្រូវសងសរុប' : 'Total Payable'}:</strong> ${escapeHtml(formatCurrency(loan.totalPayable, loan.currency, lang, useKhmerNumerals))}</div>
            ${loan.collateralText ? `<div style="grid-column:span 2;"><strong>${isKm ? 'វត្ថុបញ្ចាំ' : 'Collateral'}:</strong> ${escapeHtml(loan.collateralText)}</div>` : ''}
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:28px;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">#</th>
              <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">${isKm ? 'ថ្ងៃត្រូវសង' : 'Due Date'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ប្រាក់ដើម' : 'Principal'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ការប្រាក់' : 'Interest'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'សរុប' : 'Total'}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:12px;margin-top:24px;">
          <div>
            <div style="height:64px;border-bottom:1px solid #94A3B8;margin-bottom:6px;"></div>
            <div style="font-weight:600;">${isKm ? 'ហត្ថលេខាអ្នកឱ្យខ្ចី' : 'Lender Signature'}</div>
            <div style="color:#475569;">${escapeHtml(lenderName)}${lenderPhone ? ` · ${escapeHtml(lenderPhone)}` : ''}</div>
          </div>
          <div>
            ${sigBlock}
            <div style="font-weight:600;">${isKm ? 'ហត្ថលេខាអ្នកខ្ចី' : 'Borrower Signature'}</div>
            <div style="color:#475569;">${escapeHtml(borrower?.name || loan.borrowerName)}</div>
          </div>
        </div>
      `;
    },
    `contract-${loan.id}.pdf`,
    lang
  );
}

export interface CustomerScheduleExportInput {
  loanId: string;
  customerName: string;
  customerPhone?: string;
  lenderName: string;
  lenderPhone?: string;
  lenderLogoDataUrl?: string;
  currency: CurrencyCode;
  principal: number;
  interestType?: InterestType;
  totalPayable: number;
  outstandingBalance: number;
  startDate?: string;
  interestRate?: number;
  status: string;
  isBorrowerPortal?: boolean;
  rows: Array<{
    installmentNumber: number;
    dueDate: string;
    principalDue?: number;
    interestDue?: number;
    totalDue: number;
    paidAmount: number;
    status: string;
    paidAt?: string;
  }>;
}

export function buildCustomerScheduleInputFromLoan(
  loan: Loan,
  schedules: LoanSchedule[],
  lenderName: string,
  borrower?: Borrower,
  lenderPhone?: string,
  lenderLogoDataUrl?: string
): CustomerScheduleExportInput {
  return {
    loanId: loan.id,
    customerName: borrower?.name || loan.borrowerName,
    customerPhone: borrower?.phone,
    lenderName,
    lenderPhone,
    lenderLogoDataUrl,
    currency: loan.currency,
    principal: loan.principal,
    interestType: loan.interestType,
    totalPayable: loan.totalPayable,
    outstandingBalance: loan.outstandingBalance,
    startDate: loan.startDate,
    interestRate: loan.interestRate,
    status: loan.status,
    rows: schedules.map((s) => ({
      installmentNumber: s.installmentNumber,
      dueDate: s.dueDate,
      principalDue: s.principalDue,
      interestDue: s.interestDue,
      totalDue: s.totalDue,
      paidAmount: s.principalPaid + s.interestPaid,
      status: s.status,
      paidAt: s.paidAt,
    })),
  };
}

export function buildCustomerScheduleInputFromPortal(
  portal: PortalShare
): CustomerScheduleExportInput {
  return {
    loanId: portal.loanId,
    customerName: portal.borrowerFirstName,
    lenderName: portal.lenderName,
    lenderPhone: portal.lenderPhone,
    lenderLogoDataUrl: portal.lenderLogoDataUrl,
    currency: portal.currency,
    principal: portal.principal,
    interestType: portal.interestType,
    interestRate: portal.interestRate,
    totalPayable: portal.totalPayable,
    outstandingBalance: portal.outstandingBalance,
    status: portal.status,
    isBorrowerPortal: true,
    rows: portal.schedules.map((s) => ({
      installmentNumber: s.installmentNumber,
      dueDate: s.dueDate,
      principalDue: s.principalDue,
      interestDue: s.interestDue,
      totalDue: s.totalDue,
      paidAmount: s.paidAmount,
      status: s.status,
    })),
  };
}

function localizeInstallmentStatus(status: string, isKm: boolean): string {
  if (!isKm) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
  if (status === 'paid') return 'បានបង់';
  if (status === 'partial') return 'បង់ខ្លះ';
  if (status === 'overdue') return 'យឺតយ៉ាវ';
  return 'ត្រូវសង';
}

export async function exportLoanSchedulePdf(
  input: CustomerScheduleExportInput,
  lang: AppLanguage,
  useKhmerNumerals = false
): Promise<void> {
  if (!input.isBorrowerPortal && !canExport(getCurrentDerivedLicenseState())) {
    throw new Error('Pro license required to export schedules');
  }
  const isKm = lang === 'km';
  const hasSplitCols = input.rows.some(
    (r) => typeof r.principalDue === 'number' && typeof r.interestDue === 'number'
  );

  const safeScheduleLogoUrl =
    input.lenderLogoDataUrl && input.lenderLogoDataUrl.startsWith('data:image/')
      ? input.lenderLogoDataUrl
      : '/assets/aistudio/image_01667597.png';

  const rowsHtml = input.rows
    .map((r) => {
      const statusColor =
        r.status === 'paid' ? '#16A34A' : r.status === 'overdue' ? '#DC2626' : '#D97706';
      return `
        <tr>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-family:monospace;">#${r.installmentNumber}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-family:monospace;">${escapeHtml(formatDateLocalized(r.dueDate, lang, useKhmerNumerals))}</td>
          ${
            hasSplitCols
              ? `<td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(r.principalDue ?? 0, input.currency, lang, useKhmerNumerals))}</td>
                 <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(r.interestDue ?? 0, input.currency, lang, useKhmerNumerals))}</td>`
              : ''
          }
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;font-family:monospace;">${escapeHtml(formatCurrency(r.totalDue, input.currency, lang, useKhmerNumerals))}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(r.paidAmount, input.currency, lang, useKhmerNumerals))}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;color:${statusColor};">${escapeHtml(localizeInstallmentStatus(r.status, isKm))}</td>
        </tr>
      `;
    })
    .join('');

  await renderOffscreenHtmlToPdf(
    (container) => {
      container.innerHTML = `
        <div style="border-bottom:2px solid #0D9488;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
          <div>
            <img src="${escapeHtml(safeScheduleLogoUrl)}" alt="${escapeHtml(input.lenderName)}" style="max-height:52px;width:auto;max-width:180px;object-fit:contain;display:block;margin-bottom:6px;" />
            <h1 style="margin:2px 0 0;font-size:20px;font-weight:700;">${isKm ? 'កាលវិភាគសងប្រាក់សម្រាប់អតិថិជន' : 'CUSTOMER REPAYMENT SCHEDULE'}</h1>
          </div>
          <div style="text-align:right;font-size:11px;color:#475569;">
            <div style="font-weight:700;color:#0F172A;font-size:12px;">${escapeHtml(input.lenderName)}</div>
            ${input.lenderPhone ? `<div style="font-family:monospace;">${escapeHtml(input.lenderPhone)}</div>` : ''}
            <div style="margin-top:3px;">${isKm ? 'លេខកម្ចី' : 'Loan ID'}: ${escapeHtml(input.loanId)}</div>
            ${input.startDate ? `<div>${isKm ? 'ថ្ងៃចាប់ផ្តើម' : 'Start Date'}: ${escapeHtml(formatDateLocalized(input.startDate, lang, useKhmerNumerals))}</div>` : ''}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;font-size:12px;">
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px;">
            <div style="color:#64748B;margin-bottom:4px;">${isKm ? 'អតិថិជន (អ្នកខ្ចី)' : 'Customer'}</div>
            <div style="font-size:14px;font-weight:700;">${escapeHtml(input.customerName)}</div>
            ${input.customerPhone ? `<div style="color:#475569;font-family:monospace;">${escapeHtml(input.customerPhone)}</div>` : ''}
            <div style="color:#64748B;margin-top:4px;">${isKm ? 'ម្ចាស់កម្ចី' : 'Lender'}: ${escapeHtml(input.lenderName)}${input.lenderPhone ? ` (${escapeHtml(input.lenderPhone)})` : ''}</div>
          </div>
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="color:#64748B;">${isKm ? 'ប្រាក់ដើម' : 'Principal'}</span>
              <strong style="font-family:monospace;">${escapeHtml(formatCurrency(input.principal, input.currency, lang, useKhmerNumerals))}</strong>
            </div>
            ${
              input.interestType
                ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#64748B;">${isKm ? 'វិធីគណនាការប្រាក់' : 'Interest Method'}</span>
                    <strong>${escapeHtml(localizeInterestMethod(input.interestType, isKm))}${typeof input.interestRate === 'number' ? ` (${escapeHtml(input.interestRate)}%)` : ''}</strong>
                  </div>`
                : ''
            }
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="color:#64748B;">${isKm ? 'ប្រាក់ត្រូវសងសរុប' : 'Total Payable'}</span>
              <strong style="font-family:monospace;">${escapeHtml(formatCurrency(input.totalPayable, input.currency, lang, useKhmerNumerals))}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#64748B;">${isKm ? 'សមតុល្យនៅសល់' : 'Remaining Balance'}</span>
              <strong style="font-family:monospace;color:#0D9488;">${escapeHtml(formatCurrency(input.outstandingBalance, input.currency, lang, useKhmerNumerals))}</strong>
            </div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">#</th>
              <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">${isKm ? 'ថ្ងៃត្រូវសង' : 'Due Date'}</th>
              ${
                hasSplitCols
                  ? `<th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ប្រាក់ដើម' : 'Principal'}</th>
                     <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ការប្រាក់' : 'Interest'}</th>`
                  : ''
              }
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ត្រូវបង់' : 'Total Due'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'បានបង់' : 'Paid'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ស្ថានភាព' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    },
    `kamchi-schedule-${input.loanId}.pdf`,
    lang
  );
}

export async function exportPnlReportPdf(params: {
  lenderName: string;
  lenderPhone?: string;
  lenderLogoDataUrl?: string;
  reportDate: string;
  currency: CurrencyCode;
  interestEarned: number;
  penaltiesEarned: number;
  principalRecovered: number;
  writtenOffLoss: number;
  netProfit: number;
  cashOnHand: number;
  capitalLentOut: number;
  loans: Loan[];
  lang: AppLanguage;
  useKhmerNumerals?: boolean;
}): Promise<void> {
  const {
    lenderName,
    lenderPhone,
    lenderLogoDataUrl,
    reportDate,
    currency,
    interestEarned,
    penaltiesEarned,
    principalRecovered,
    writtenOffLoss,
    netProfit,
    cashOnHand,
    capitalLentOut,
    loans,
    lang,
    useKhmerNumerals = false,
  } = params;

  if (!canExport(getCurrentDerivedLicenseState())) {
    throw new Error('Pro license required to export P&L report');
  }

  const isKm = lang === 'km';
  const safeLogoUrl =
    lenderLogoDataUrl && lenderLogoDataUrl.startsWith('data:image/')
      ? lenderLogoDataUrl
      : '/assets/aistudio/image_01667597.png';

  const activeLoans = loans.filter((l) => l.status === 'active');
  const loanSummaryRows = loans
    .slice(0, 40)
    .map(
      (l) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;">${escapeHtml(l.borrowerName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-family:monospace;">${escapeHtml(l.currency)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(l.principal, l.currency, lang, useKhmerNumerals))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(l.outstandingBalance, l.currency, lang, useKhmerNumerals))}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;text-align:right;">${escapeHtml(l.status)}</td>
      </tr>
    `
    )
    .join('');

  await renderOffscreenHtmlToPdf(
    (container) => {
      container.innerHTML = `
        <div style="border-bottom:2px solid #0D9488;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
          <div>
            <img src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(lenderName)}" style="max-height:48px;width:auto;max-width:160px;object-fit:contain;display:block;margin-bottom:6px;" />
            <h1 style="margin:0;font-size:20px;font-weight:700;">${isKm ? 'របាយការណ៍ចំណេញ និងខាត' : 'PROFIT & LOSS PORTFOLIO REPORT'} (${escapeHtml(currency)})</h1>
          </div>
          <div style="text-align:right;font-size:11px;color:#475569;">
            <div style="font-weight:700;color:#0F172A;font-size:12px;">${escapeHtml(lenderName)}</div>
            ${lenderPhone ? `<div style="font-family:monospace;">${escapeHtml(lenderPhone)}</div>` : ''}
            <div>${isKm ? 'កាលបរិច្ឆេទ' : 'Report Date'}: ${escapeHtml(formatDateLocalized(reportDate, lang, useKhmerNumerals))}</div>
          </div>
        </div>

        <div style="border:1px solid #E2E8F0;border-radius:10px;padding:16px;margin-bottom:18px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
            <span style="color:#475569;">${isKm ? 'ការប្រាក់ និងថ្លៃសេវាទទួលបាន' : 'Interest & Fees Earned'}</span>
            <strong style="font-family:monospace;color:#059669;">${escapeHtml(formatCurrency(interestEarned, currency, lang, useKhmerNumerals))}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
            <span style="color:#475569;">${isKm ? 'ប្រាក់ពិន័យទទួលបាន' : 'Penalties Collected'}</span>
            <strong style="font-family:monospace;color:#059669;">${escapeHtml(formatCurrency(penaltiesEarned, currency, lang, useKhmerNumerals))}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
            <span style="color:#475569;">${isKm ? 'ប្រាក់ដើមប្រមូលបានវិញ' : 'Principal Recovered'}</span>
            <strong style="font-family:monospace;">${escapeHtml(formatCurrency(principalRecovered, currency, lang, useKhmerNumerals))}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
            <span style="color:#475569;">${isKm ? 'បំណុលកាត់ចោល' : 'Written Off'}</span>
            <strong style="font-family:monospace;color:#DC2626;">-${escapeHtml(formatCurrency(writtenOffLoss, currency, lang, useKhmerNumerals))}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;padding:10px 0 2px;font-size:15px;font-weight:700;">
            <span>${isKm ? 'ប្រាក់ចំណេញសុទ្ធ' : 'Net Lending Profit'}</span>
            <span style="font-family:monospace;color:#0D9488;">${escapeHtml(formatCurrency(netProfit, currency, lang, useKhmerNumerals))}</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;font-size:12px;">
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px;">
            <div style="color:#64748B;">${isKm ? 'សាច់ប្រាក់ក្នុងដៃ' : 'Cash on Hand'}</div>
            <div style="font-size:14px;font-weight:700;font-family:monospace;margin-top:2px;">${escapeHtml(formatCurrency(cashOnHand, currency, lang, useKhmerNumerals))}</div>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px;">
            <div style="color:#64748B;">${isKm ? 'ដើមទុនកំពុងបញ្ចេញ' : 'Capital Lent Out'}</div>
            <div style="font-size:14px;font-weight:700;font-family:monospace;margin-top:2px;">${escapeHtml(formatCurrency(capitalLentOut, currency, lang, useKhmerNumerals))}</div>
          </div>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px;">
            <div style="color:#64748B;">${isKm ? 'កម្ចីកំពុងដំណើរការ / សរុប' : 'Active / Total Loans'}</div>
            <div style="font-size:14px;font-weight:700;font-family:monospace;margin-top:2px;">${activeLoans.length} / ${loans.length}</div>
          </div>
        </div>

        ${
          loans.length > 0
            ? `<table style="width:100%;border-collapse:collapse;font-size:11px;">
                <thead>
                  <tr style="background:#F8FAFC;">
                    <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">${isKm ? 'អ្នកខ្ចី' : 'Borrower'}</th>
                    <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">${isKm ? 'រូបិយប័ណ្ណ' : 'Currency'}</th>
                    <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ប្រាក់ដើម' : 'Principal'}</th>
                    <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'នៅសល់' : 'Outstanding'}</th>
                    <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ស្ថានភាព' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>${loanSummaryRows}</tbody>
              </table>`
            : ''
        }
      `;
    },
    `kamchi-pnl-${reportDate}.pdf`,
    lang
  );
}

export function exportLoanScheduleExcel(input: CustomerScheduleExportInput): void {
  if (!input.isBorrowerPortal && !canExport(getCurrentDerivedLicenseState())) {
    throw new Error('Pro license required to export schedule Excel');
  }
  const summaryRows: Array<Record<string, string | number>> = [
    {
      LoanID: input.loanId,
      Customer: input.customerName,
      Phone: input.customerPhone || '',
      Lender: input.lenderName,
      Currency: input.currency,
      Principal: input.principal,
      InterestMethod: input.interestType ? localizeInterestMethod(input.interestType, false) : '',
      InterestRatePct: typeof input.interestRate === 'number' ? input.interestRate : '',
      TotalPayable: input.totalPayable,
      OutstandingBalance: input.outstandingBalance,
      Status: input.status,
      StartDate: input.startDate || '',
    },
  ];

  const scheduleRows: Array<Record<string, string | number>> = input.rows.map((r) => ({
    Installment: r.installmentNumber,
    DueDate: r.dueDate,
    PrincipalDue: r.principalDue ?? 0,
    InterestDue: r.interestDue ?? 0,
    TotalDue: r.totalDue,
    PaidAmount: r.paidAmount,
    Remaining: Math.max(0, Math.round((r.totalDue - r.paidAmount) * 100) / 100),
    Status: r.status,
    PaidDate: r.paidAt || '',
  }));

  const blob = buildXlsxBlob([
    {
      name: 'Schedule',
      rows: scheduleRows,
      defaultHeaders: [
        'Installment',
        'DueDate',
        'PrincipalDue',
        'InterestDue',
        'TotalDue',
        'PaidAmount',
        'Remaining',
        'Status',
        'PaidDate',
      ],
    },
    {
      name: 'Summary',
      rows: summaryRows,
      defaultHeaders: [
        'LoanID',
        'Customer',
        'Phone',
        'Lender',
        'Currency',
        'Principal',
        'InterestMethod',
        'InterestRatePct',
        'TotalPayable',
        'OutstandingBalance',
        'Status',
        'StartDate',
      ],
    },
  ]);

  triggerBlobDownload(blob, `kamchi-schedule-${input.loanId}.xlsx`);
}

export function exportLoansAndPaymentsToExcel(params: {
  loans: Loan[];
  payments: Payment[];
  borrowers: Borrower[];
}) {
  if (!canExport(getCurrentDerivedLicenseState())) {
    throw new Error('Pro license required to export Excel report');
  }
  const loanRows = params.loans.map((l) => ({
    LoanID: l.id,
    Borrower: l.borrowerName,
    Currency: l.currency,
    Principal: l.principal,
    InterestRatePct: l.interestRate,
    InterestType: l.interestType,
    Terms: l.termCount,
    Frequency: l.frequency,
    StartDate: l.startDate,
    TotalPayable: l.totalPayable,
    PaidPrincipal: l.paidPrincipal ?? 0,
    PaidInterest: l.paidInterest ?? 0,
    PaidPenalty: l.paidPenalty ?? 0,
    Outstanding: l.outstandingBalance,
    Status: l.status,
  }));

  const paymentRows = params.payments.map((p) => ({
    PaymentID: p.id,
    Date: p.paymentDate,
    Borrower: p.borrowerName,
    LoanID: p.loanId,
    Currency: p.currency,
    Amount: p.amount,
    Principal: p.principalPortion,
    Interest: p.interestPortion,
    Penalty: p.penaltyPortion,
    Method: p.method,
    Reference: p.referenceNo || '',
    CollectedBy: p.collectedBy || '',
  }));

  const borrowerRows = params.borrowers.map((b) => ({
    BorrowerID: b.id,
    Name: b.name,
    Phone: b.phone,
    Address: b.address || '',
    NationalID: b.nationalIdNumber || '',
    Guarantor: b.guarantorName || '',
    RiskScore: b.riskScore ?? 85,
  }));

  const blob = buildXlsxBlob([
    {
      name: 'Loans',
      rows: loanRows,
      defaultHeaders: [
        'LoanID',
        'Borrower',
        'Currency',
        'Principal',
        'InterestRatePct',
        'InterestType',
        'Terms',
        'Frequency',
        'StartDate',
        'TotalPayable',
        'PaidPrincipal',
        'PaidInterest',
        'PaidPenalty',
        'Outstanding',
        'Status',
      ],
    },
    {
      name: 'Payments',
      rows: paymentRows,
      defaultHeaders: [
        'PaymentID',
        'Date',
        'Borrower',
        'LoanID',
        'Currency',
        'Amount',
        'Principal',
        'Interest',
        'Penalty',
        'Method',
        'Reference',
        'CollectedBy',
      ],
    },
    {
      name: 'Borrowers',
      rows: borrowerRows,
      defaultHeaders: [
        'BorrowerID',
        'Name',
        'Phone',
        'Address',
        'NationalID',
        'Guarantor',
        'RiskScore',
      ],
    },
  ]);

  triggerBlobDownload(blob, `kamchi-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
