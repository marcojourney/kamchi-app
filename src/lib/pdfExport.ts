import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { formatCurrency, formatDateLocalized } from './finance';
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

function escapeXml(val: string | number): string {
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildWorksheetXml(name: string, rows: Array<Record<string, string | number>>): string {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ['Empty'];
  const headerCells = headers
    .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('');
  const dataRows = rows
    .map((row) => {
      const cells = headers
        .map((h) => {
          const val = row[h] ?? '';
          const type = typeof val === 'number' && Number.isFinite(val) ? 'Number' : 'String';
          return `<Cell><Data ss:Type="${type}">${escapeXml(val)}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  return `<Worksheet ss:Name="${escapeXml(name)}"><Table><Row>${headerCells}</Row>${dataRows}</Table></Worksheet>`;
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
        reject(new Error('Failed to read font blob'));
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
      const res = await fetch(GOOGLE_FONTS_CSS_URL, { mode: 'cors' });
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

export async function renderElementToPng(element: HTMLElement): Promise<string> {
  const fontCss = await getEmbeddedFontCss();
  return toPng(element, {
    pixelRatio: 2,
    backgroundColor: '#FFFFFF',
    ...(fontCss ? { fontEmbedCSS: fontCss } : { skipFonts: true }),
  });
}

export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await renderElementToPng(element);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to render PDF image'));
    img.src = dataUrl;
  });

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

  pdf.save(filename);
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
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.background = '#FFFFFF';
  container.style.color = '#0F172A';
  container.style.padding = '40px';
  container.style.fontFamily =
    lang === 'km'
      ? '"Kantumruy Pro", "Plus Jakarta Sans", sans-serif'
      : '"Plus Jakarta Sans", "Kantumruy Pro", sans-serif';
  container.style.lineHeight = lang === 'km' ? '1.75' : '1.5';

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

  document.body.appendChild(container);
  try {
    await exportElementToPdf(container, `contract-${loan.id}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
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
  const isKm = lang === 'km';
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.background = '#FFFFFF';
  container.style.color = '#0F172A';
  container.style.padding = '36px';
  container.style.fontFamily = isKm
    ? '"Kantumruy Pro", "Plus Jakarta Sans", sans-serif'
    : '"Plus Jakarta Sans", "Kantumruy Pro", sans-serif';
  container.style.lineHeight = isKm ? '1.75' : '1.5';

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

  document.body.appendChild(container);
  try {
    await exportElementToPdf(container, `kamchi-schedule-${input.loanId}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

export function exportLoanScheduleExcel(input: CustomerScheduleExportInput): void {
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

  const scheduleRows: Array<Record<string, string | number>> = input.rows.map((r) => {
    const base: Record<string, string | number> = {
      Installment: r.installmentNumber,
      DueDate: r.dueDate,
    };
    if (typeof r.principalDue === 'number') base.PrincipalDue = r.principalDue;
    if (typeof r.interestDue === 'number') base.InterestDue = r.interestDue;
    base.TotalDue = r.totalDue;
    base.PaidAmount = r.paidAmount;
    base.Remaining = Math.max(0, r.totalDue - r.paidAmount);
    base.Status = r.status;
    if (r.paidAt) base.PaidDate = r.paidAt;
    return base;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 ${buildWorksheetXml('Schedule', scheduleRows)}
 ${buildWorksheetXml('Summary', summaryRows)}
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kamchi-schedule-${input.loanId}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportLoansAndPaymentsToExcel(params: {
  loans: Loan[];
  payments: Payment[];
  borrowers: Borrower[];
}) {
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 ${buildWorksheetXml('Loans', loanRows)}
 ${buildWorksheetXml('Payments', paymentRows)}
 ${buildWorksheetXml('Borrowers', borrowerRows)}
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kamchi-report-${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
