import { exportElementToPdf } from '../../../lib/pdfExport';
import { formatCurrency, formatDateLocalized } from '../../../lib/finance';
import type { AppLanguage } from '../../../types/loan';
import type { BusinessProfile } from '../../onboarding/types';
import type {
  DocumentHeldRecord,
  InstallmentPaymentMethod,
  InstallmentPaymentRecord,
  InstallmentPlan,
} from '../types';

function escapeHtml(val: string | number | undefined | null): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function localizeMethod(method: InstallmentPaymentMethod, isKm: boolean): string {
  if (method === 'khqr_aba') return 'KHQR / ABA';
  if (method === 'bank_transfer') return isKm ? 'ផ្ទេរតាមធនាគារ' : 'Bank Transfer';
  return isKm ? 'សាច់ប្រាក់' : 'Cash';
}

function localizeStatus(status: string, isKm: boolean): string {
  switch (status) {
    case 'paid':
      return isKm ? 'បានបង់' : 'Paid';
    case 'partial':
      return isKm ? 'បង់ខ្លះ' : 'Partial';
    case 'overdue':
      return isKm ? 'យឺតកំណត់' : 'Overdue';
    case 'completed':
      return isKm ? 'បានបញ្ចប់' : 'Completed';
    case 'transferred':
      return isKm ? 'បានផ្ទេរកម្មសិទ្ធិរួច' : 'Transferred';
    case 'released':
      return isKm ? 'បានដោះលែងទ្រព្យបញ្ចាំ' : 'Released';
    case 'repossessed':
      return isKm ? 'បានដកហូតវិញ' : 'Repossessed';
    case 'returned':
      return isKm ? 'បានប្រគល់សងវិញ' : 'Returned';
    case 'written_off':
      return isKm ? 'បានលុបចោលជាបំណុលសូន្យ' : 'Written Off';
    default:
      return isKm ? 'រង់ចាំបង់' : 'Upcoming';
  }
}

async function renderOffscreenPdf(
  buildContent: (container: HTMLDivElement) => void,
  filename: string,
  lang: AppLanguage
): Promise<void> {
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

function buildShopHeaderHtml(
  businessProfile: BusinessProfile,
  title: string,
  subtitle: string,
  rightLines: string[]
): string {
  const safeLogoUrl =
    businessProfile.logo && businessProfile.logo.startsWith('data:image/')
      ? businessProfile.logo
      : '/assets/aistudio/image_01667597.png';
  const shopName = businessProfile.name || 'KamChi';
  const contactLine = [
    businessProfile.phone,
    businessProfile.telegram,
    businessProfile.address,
    businessProfile.province,
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <div style="border-bottom:2px solid #0D9488;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
      <div>
        <img src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(shopName)}" style="max-height:50px;width:auto;max-width:170px;object-fit:contain;display:block;margin-bottom:8px;" />
        <h1 style="margin:0;font-size:20px;font-weight:700;color:#0F172A;">${escapeHtml(title)}</h1>
        <p style="margin:3px 0 0;font-size:12px;color:#475569;">${escapeHtml(subtitle)}</p>
      </div>
      <div style="text-align:right;font-size:11.5px;color:#475569;max-width:300px;">
        <div style="font-weight:700;color:#0F172A;font-size:13px;">${escapeHtml(shopName)}</div>
        ${contactLine ? `<div style="margin-top:2px;">${escapeHtml(contactLine)}</div>` : ''}
        ${rightLines.map((line) => `<div style="margin-top:2px;">${escapeHtml(line)}</div>`).join('')}
      </div>
    </div>
  `;
}

export async function exportInstallmentPlanPdf(params: {
  plan: InstallmentPlan;
  businessProfile: BusinessProfile;
  lang: AppLanguage;
  useKhmerNumerals?: boolean;
}): Promise<void> {
  const { plan, businessProfile, lang, useKhmerNumerals = false } = params;
  const isKm = lang === 'km';
  const fmt = (val: number) => formatCurrency(val, plan.currency, lang, useKhmerNumerals);
  const fmtDate = (iso: string) => formatDateLocalized(iso, lang, useKhmerNumerals);

  const isInstallmentSale = plan.agreementType !== 'purchase_financing';
  const agreementWording = isInstallmentSale
    ? isKm
      ? 'លក់រំសោះ កម្មសិទ្ធិផ្ទេរនៅពេលទូទាត់ប្រាក់រួចរាល់'
      : 'sold on installment, ownership transfers on full payment'
    : isKm
      ? 'ទំនិញត្រូវបានទុកជាទ្រព្យបញ្ចាំរហូតទាល់តែសងរួច'
      : 'item held as collateral until repaid';

  const lawyerNote = isKm
    ? '(សម្រាប់ការកត់ត្រាតែប៉ុណ្ណោះ មិនមែនជាប័ណ្ណកម្មសិទ្ធិផ្លូវច្បាប់ទេ។ លក្ខខណ្ឌផ្លូវច្បាប់ត្រូវពិនិត្យដោយមេធាវីកម្ពុជាដែលមានលក្ខណៈសម្បត្តិគ្រប់គ្រាន់។)'
    : '(Record only, not legal title. Legal terms must be reviewed by a qualified Cambodian lawyer.)';

  const scheduleRowsHtml = plan.schedules
    .map(
      (s) => `
      <tr>
        <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-family:monospace;">#${s.installmentNumber}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-family:monospace;">${escapeHtml(fmtDate(s.dueDate))}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;font-weight:600;">${escapeHtml(fmt(s.amountDue))}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;">${escapeHtml(fmt(s.amountPaid))}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;">${escapeHtml(localizeStatus(s.status, isKm))}</td>
      </tr>
    `
    )
    .join('');

  const safeFileSlug = (plan.invoiceId || plan.id).replace(/[^a-zA-Z0-9_-]/g, '-');

  await renderOffscreenPdf(
    (container) => {
      const headerHtml = buildShopHeaderHtml(
        businessProfile,
        isKm ? 'តារាង និងកិច្ចសន្យាបង់រំលស់' : 'INSTALLMENT SCHEDULE & AGREEMENT',
        plan.invoiceId
          ? `${isKm ? 'លេខវិក្កយបត្រ' : 'Invoice'}: #${plan.invoiceId} · ${plan.id}`
          : `${isKm ? 'លេខសម្គាល់' : 'Plan ID'}: ${plan.id}`,
        [
          `${isKm ? 'ថ្ងៃចាប់ផ្តើម' : 'Start Date'}: ${fmtDate(plan.startDate)}`,
          `${isKm ? 'ស្ថានភាព' : 'Status'}: ${localizeStatus(plan.status, isKm)}`,
        ]
      );

      container.innerHTML = `
        ${headerHtml}

        <div style="background:#F0FDFA;border:1px solid #CCFBF1;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:11.5px;color:#0F766E;">
          <strong>${isKm ? 'កម្មសិទ្ធិយោងតាមកិច្ចសន្យា' : 'Ownership per contract'}:</strong> ${escapeHtml(agreementWording)}
          <div style="font-size:10.5px;color:#047857;margin-top:2px;font-style:italic;">${escapeHtml(lawyerNote)}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;font-size:12.5px;">
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px;">
            <div style="font-weight:700;margin-bottom:4px;color:#0F172A;">${isKm ? 'ព័ត៌មានអតិថិជន' : 'Customer Details'}</div>
            <div style="font-weight:600;">${escapeHtml(plan.customerName)}</div>
            ${plan.customerPhone ? `<div style="color:#475569;font-family:monospace;margin-top:2px;">${escapeHtml(plan.customerPhone)}</div>` : ''}
          </div>
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px;">
            <div style="font-weight:700;margin-bottom:4px;color:#0F172A;">${isKm ? 'ព័ត៌មានទំនិញ' : 'Item Details'}</div>
            <div style="font-weight:600;">${escapeHtml(plan.itemName)}</div>
            <div style="color:#475569;margin-top:2px;">
              ${escapeHtml(String(plan.installmentCount))} ${isKm ? 'ដំណាក់កាល' : 'installments'} (${escapeHtml(plan.frequency === 'weekly' ? (isKm ? 'ប្រចាំសប្តាហ៍' : 'Weekly') : isKm ? 'ប្រចាំខែ' : 'Monthly')})
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px;font-size:11.5px;">
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:10px;background:#F8FAFC;">
            <div style="color:#64748B;">${isKm ? 'តម្លៃទំនិញ' : 'Item Price'}</div>
            <div style="font-weight:700;font-family:monospace;margin-top:3px;">${escapeHtml(fmt(plan.totalPrice))}</div>
          </div>
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:10px;background:#F8FAFC;">
            <div style="color:#64748B;">${isKm ? 'ប្រាក់កក់' : 'Down Payment'}</div>
            <div style="font-weight:700;font-family:monospace;margin-top:3px;">${escapeHtml(fmt(plan.downPayment))}</div>
          </div>
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:10px;background:#F8FAFC;">
            <div style="color:#64748B;">${isKm ? 'ត្រូវបង់រំលស់' : 'Total Financed'}</div>
            <div style="font-weight:700;font-family:monospace;margin-top:3px;">${escapeHtml(fmt(plan.totalInstallmentsPayable))}</div>
          </div>
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:10px;background:#ECFDF5;">
            <div style="color:#047857;">${isKm ? 'បានបង់រួច' : 'Paid So Far'}</div>
            <div style="font-weight:700;font-family:monospace;color:#047857;margin-top:3px;">${escapeHtml(fmt(plan.paidAmount))}</div>
          </div>
          <div style="border:1px solid #CCFBF1;border-radius:8px;padding:10px;background:#F0FDFA;">
            <div style="color:#0F766E;">${isKm ? 'នៅសល់' : 'Remaining'}</div>
            <div style="font-weight:700;font-family:monospace;color:#0F766E;margin-top:3px;">${escapeHtml(fmt(plan.remainingBalance))}</div>
          </div>
        </div>

        ${
          plan.notes
            ? `<div style="border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;"><strong>${isKm ? 'កំណត់ចំណាំ' : 'Notes'}:</strong> ${escapeHtml(plan.notes)}</div>`
            : ''
        }

        <table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:26px;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">#</th>
              <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">${isKm ? 'ថ្ងៃត្រូវបង់' : 'Due Date'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ទឹកប្រាក់ត្រូវបង់' : 'Amount Due'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'បានបង់' : 'Paid'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ស្ថានភាព' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>${scheduleRowsHtml}</tbody>
        </table>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:12px;margin-top:20px;">
          <div>
            <div style="height:56px;border-bottom:1px solid #94A3B8;margin-bottom:6px;"></div>
            <div style="font-weight:600;">${isKm ? 'ហត្ថលេខាអ្នកលក់ / ហាង' : 'Seller Signature'}</div>
            <div style="color:#475569;">${escapeHtml(businessProfile.name || 'KamChi')}${businessProfile.ownerName ? ` · ${escapeHtml(businessProfile.ownerName)}` : ''}</div>
          </div>
          <div>
            <div style="height:56px;border-bottom:1px solid #94A3B8;margin-bottom:6px;"></div>
            <div style="font-weight:600;">${isKm ? 'ហត្ថលេខាអតិថិជន' : 'Customer Signature'}</div>
            <div style="color:#475569;">${escapeHtml(plan.customerName)}</div>
          </div>
        </div>
      `;
    },
    `installment-${safeFileSlug}.pdf`,
    lang
  );
}

export async function exportInstallmentClearancePdf(params: {
  plan: InstallmentPlan;
  businessProfile: BusinessProfile;
  lang: AppLanguage;
  useKhmerNumerals?: boolean;
}): Promise<void> {
  const { plan, businessProfile, lang, useKhmerNumerals = false } = params;
  const isKm = lang === 'km';
  const fmtDate = (iso: string) => formatDateLocalized(iso, lang, useKhmerNumerals);
  const isInstallmentSale = plan.agreementType !== 'purchase_financing';

  const certTitle = isInstallmentSale
    ? isKm ? 'លិខិតបញ្ជាក់ការរួចរាល់ និងផ្ទេរកម្មសិទ្ធិ' : 'OWNERSHIP CLEARANCE & TRANSFER CERTIFICATE'
    : isKm ? 'លិខិតបញ្ជាក់ការដោះលែងទ្រព្យបញ្ចាំ' : 'COLLATERAL RELEASE CERTIFICATE';

  const certText = isInstallmentSale
    ? isKm
      ? `សូមបញ្ជាក់ថា អតិថិជន ${plan.customerName} បានទូទាត់ប្រាក់ទំនិញ "${plan.itemName}" (វិក្កយបត្រ #${plan.invoiceId || plan.id}) រួចរាល់ជាស្ថាពរ។ ហាងបានផ្ទេរកម្មសិទ្ធិស្របតាមកិច្ចសន្យាជូនអតិថិជន។`
      : `This is to certify that customer ${plan.customerName} has fully paid for "${plan.itemName}" (Invoice #${plan.invoiceId || plan.id}). Ownership is now fully transferred per contract.`
    : isKm
      ? `សូមបញ្ជាក់ថា អតិថិជន ${plan.customerName} បានសងប្រាក់កម្ចីទំនិញ "${plan.itemName}" (វិក្កយបត្រ #${plan.invoiceId || plan.id}) រួចរាល់។ ហាងបានដោះលែងទ្រព្យបញ្ចាំជូនអតិថិជនវិញ។`
      : `This is to certify that customer ${plan.customerName} has fully repaid loan for "${plan.itemName}" (Invoice #${plan.invoiceId || plan.id}). Collateral is now released.`

  const lawyerNote = isKm
    ? '(សម្រាប់ការកត់ត្រាតែប៉ុណ្ណោះ មិនមែនជាប័ណ្ណកម្មសិទ្ធិផ្លូវច្បាប់ទេ។ លក្ខខណ្ឌផ្លូវច្បាប់ត្រូវពិនិត្យដោយមេធាវីកម្ពុជាដែលមានលក្ខណៈសម្បត្តិគ្រប់គ្រាន់។)'
    : '(Record only, not legal title. Legal terms must be reviewed by a qualified Cambodian lawyer.)';

  const safeFileSlug = (plan.invoiceId || plan.id).replace(/[^a-zA-Z0-9_-]/g, '-');

  await renderOffscreenPdf(
    (container) => {
      const headerHtml = buildShopHeaderHtml(
        businessProfile,
        certTitle,
        `${isKm ? 'លេខសម្គាល់គម្រោង' : 'Plan ID'}: ${plan.id}`,
        [`${isKm ? 'កាលបរិច្ឆេទ' : 'Date'}: ${fmtDate(new Date().toISOString().slice(0, 10))}`]
      );

      container.innerHTML = `
        ${headerHtml}
        <div style="background:#F0FDFA;border:1px solid #CCFBF1;border-radius:10px;padding:20px;margin-bottom:24px;font-size:13.5px;color:#0F172A;line-height:1.8;">
          ${escapeHtml(certText)}
          <div style="font-size:11px;color:#047857;margin-top:12px;font-style:italic;">${escapeHtml(lawyerNote)}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;font-size:12px;">
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px;">
            <div style="font-weight:700;color:#64748B;margin-bottom:4px;">${isKm ? 'អតិថិជន' : 'Customer'}</div>
            <div style="font-weight:600;font-size:13px;">${escapeHtml(plan.customerName)}</div>
            ${plan.customerPhone ? `<div style="font-family:monospace;color:#475569;margin-top:2px;">${escapeHtml(plan.customerPhone)}</div>` : ''}
          </div>
          <div style="border:1px solid #E2E8F0;border-radius:8px;padding:12px;">
            <div style="font-weight:700;color:#64748B;margin-bottom:4px;">${isKm ? 'មុខទំនិញ' : 'Item / Collateral'}</div>
            <div style="font-weight:600;font-size:13px;">${escapeHtml(plan.itemName)}</div>
            <div style="font-family:monospace;color:#475569;margin-top:2px;">${formatCurrency(plan.totalPrice, plan.currency, lang, useKhmerNumerals)}</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:12px;margin-top:30px;">
          <div>
            <div style="height:60px;border-bottom:1px solid #94A3B8;margin-bottom:6px;"></div>
            <div style="font-weight:600;">${isKm ? 'ហត្ថលេខាអ្នកលក់ / ហាង' : 'Authorized Signature'}</div>
            <div style="color:#475569;">${escapeHtml(businessProfile.name || 'KamChi')}</div>
          </div>
          <div>
            <div style="height:60px;border-bottom:1px solid #94A3B8;margin-bottom:6px;"></div>
            <div style="font-weight:600;">${isKm ? 'ហត្ថលេខាអតិថិជន' : 'Customer Acknowledgment'}</div>
            <div style="color:#475569;">${escapeHtml(plan.customerName)}</div>
          </div>
        </div>
      `;
    },
    `clearance-${safeFileSlug}.pdf`,
    lang
  );
}

export async function exportDocumentReceiptPdf(params: {
  plan: InstallmentPlan;
  document: DocumentHeldRecord;
  businessProfile: BusinessProfile;
  lang: AppLanguage;
  useKhmerNumerals?: boolean;
}): Promise<void> {
  const { plan, document: doc, businessProfile, lang, useKhmerNumerals = false } = params;
  const isKm = lang === 'km';
  const fmtDate = (iso: string) => formatDateLocalized(iso, lang, useKhmerNumerals);

  await renderOffscreenPdf(
    (container) => {
      const headerHtml = buildShopHeaderHtml(
        businessProfile,
        isKm ? 'បង្កាន់ដៃទទួលរក្សាទុកឯកសារ' : 'DOCUMENT HOLDING RECEIPT',
        `${isKm ? 'អតិថិជន' : 'Customer'}: ${plan.customerName}`,
        [`${isKm ? 'ថ្ងៃទទួល' : 'Received'}: ${fmtDate(doc.dateReceived)}`]
      );

      container.innerHTML = `
        ${headerHtml}
        <div style="border:1px solid #E2E8F0;border-radius:10px;padding:16px;margin-bottom:20px;background:#F8FAFC;font-size:13px;">
          <div style="font-weight:700;color:#0F172A;margin-bottom:6px;">${escapeHtml(doc.description)}</div>
          <div style="color:#475569;margin-bottom:4px;"><strong>${isKm ? 'ស្ថានភាពឯកសារ' : 'Condition'}:</strong> ${escapeHtml(doc.condition)}</div>
          <div style="color:#475569;"><strong>${isKm ? 'ថ្ងៃទទួល' : 'Date Received'}:</strong> ${escapeHtml(fmtDate(doc.dateReceived))}</div>
          ${doc.returnDate ? `<div style="color:#047857;margin-top:4px;"><strong>${isKm ? 'ថ្ងៃប្រគល់សងវិញ' : 'Returned Date'}:</strong> ${escapeHtml(fmtDate(doc.returnDate))}</div>` : ''}
        </div>

        <div style="font-size:12px;color:#475569;margin-bottom:30px;">
          ${isKm ? 'ឯកសារនេះត្រូវបានរក្សាទុកដោយសុវត្ថិភាពនៅហាង ហើយនឹងត្រូវប្រគល់ជូនអតិថិជនវិញនៅពេលគម្រោងបង់រំលស់ត្រូវបានបញ្ចប់ស្របតាមកិច្ចសន្យា។' : 'This document is securely held by the store and will be returned to the customer upon full fulfillment of the installment plan.'}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:12px;margin-top:20px;">
          <div>
            <div style="height:56px;border-bottom:1px solid #94A3B8;margin-bottom:6px;"></div>
            <div style="font-weight:600;">${isKm ? 'ហត្ថលេខាអ្នកទទួល / ហាង' : 'Lender / Store Signature'}</div>
            <div style="color:#475569;">${escapeHtml(businessProfile.name || 'KamChi')}</div>
          </div>
          <div>
            <div style="height:56px;border-bottom:1px solid #94A3B8;margin-bottom:6px;"></div>
            <div style="font-weight:600;">${isKm ? 'ហត្ថលេខាអតិថិជន' : 'Customer Signature'}</div>
            <div style="color:#475569;">${escapeHtml(plan.customerName)}</div>
          </div>
        </div>
      `;
    },
    `document-receipt-${doc.id}.pdf`,
    lang
  );
}

export async function exportInstallmentListPdf(params: {
  plans: InstallmentPlan[];
  businessProfile: BusinessProfile;
  lang: AppLanguage;
  todayIso: string;
  useKhmerNumerals?: boolean;
}): Promise<void> {
  const { plans, businessProfile, lang, todayIso, useKhmerNumerals = false } = params;
  const isKm = lang === 'km';
  const fmtDate = (iso: string) => formatDateLocalized(iso, lang, useKhmerNumerals);

  const rowsHtml = plans
    .slice(0, 80)
    .map((p) => {
      const paidCount = p.schedules.filter((s) => s.status === 'paid').length;
      return `
        <tr>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;font-weight:600;">${escapeHtml(p.itemName)}${p.invoiceId ? `<div style="font-size:10px;color:#64748B;font-family:monospace;">#${escapeHtml(p.invoiceId)}</div>` : ''}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;">${escapeHtml(p.customerName)}${p.customerPhone ? `<div style="font-size:10px;color:#64748B;font-family:monospace;">${escapeHtml(p.customerPhone)}</div>` : ''}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:center;font-family:monospace;">${paidCount}/${p.installmentCount}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;">${escapeHtml(formatCurrency(p.totalPrice, p.currency, lang, useKhmerNumerals))}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-family:monospace;font-weight:700;">${escapeHtml(formatCurrency(p.remainingBalance, p.currency, lang, useKhmerNumerals))}</td>
          <td style="padding:7px 8px;border-bottom:1px solid #E2E8F0;text-align:right;">${escapeHtml(localizeStatus(p.status, isKm))}</td>
        </tr>
      `;
    })
    .join('');

  await renderOffscreenPdf(
    (container) => {
      const headerHtml = buildShopHeaderHtml(
        businessProfile,
        isKm ? 'របាយការណ៍ការលក់បង់រំលស់' : 'INSTALLMENT SALES REPORT',
        `${isKm ? 'ចំនួនគម្រោងសរុប' : 'Total Plans'}: ${plans.length}`,
        [`${isKm ? 'ថ្ងៃបោះពុម្ព' : 'Generated'}: ${fmtDate(todayIso)}`]
      );

      container.innerHTML = `
        ${headerHtml}
        <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead>
            <tr style="background:#F8FAFC;">
              <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">${isKm ? 'មុខទំនិញ' : 'Item'}</th>
              <th style="padding:8px;text-align:left;border-bottom:1px solid #CBD5E1;">${isKm ? 'អតិថិជន' : 'Customer'}</th>
              <th style="padding:8px;text-align:center;border-bottom:1px solid #CBD5E1;">${isKm ? 'វគ្គ' : 'Paid'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'តម្លៃសរុប' : 'Total Price'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'នៅសល់' : 'Remaining'}</th>
              <th style="padding:8px;text-align:right;border-bottom:1px solid #CBD5E1;">${isKm ? 'ស្ថានភាព' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    },
    `installments-report-${todayIso}.pdf`,
    lang
  );
}

export async function exportInstallmentReceiptPdf(params: {
  plan: InstallmentPlan;
  payment: InstallmentPaymentRecord;
  businessProfile: BusinessProfile;
  lang: AppLanguage;
  useKhmerNumerals?: boolean;
}): Promise<void> {
  const { plan, payment, businessProfile, lang, useKhmerNumerals = false } = params;
  const isKm = lang === 'km';
  const fmt = (val: number) => formatCurrency(val, plan.currency, lang, useKhmerNumerals);
  const fmtDate = (iso: string) => formatDateLocalized(iso, lang, useKhmerNumerals);

  await renderOffscreenPdf(
    (container) => {
      const headerHtml = buildShopHeaderHtml(
        businessProfile,
        isKm ? 'បង្កាន់ដៃទទួលប្រាក់បង់រំលស់' : 'INSTALLMENT PAYMENT RECEIPT',
        `${isKm ? 'លេខបង្កាន់ដៃ' : 'Receipt'}: ${payment.id.toUpperCase()}`,
        [`${isKm ? 'កាលបរិច្ឆេទ' : 'Date'}: ${fmtDate(payment.paymentDate)}`]
      );

      container.innerHTML = `
        ${headerHtml}
        <div style="border:1px solid #E2E8F0;border-radius:10px;padding:18px;margin-bottom:20px;background:#F8FAFC;">
          <div style="font-size:12px;color:#64748B;">${isKm ? 'ចំនួនទឹកប្រាក់បានបង់' : 'Amount Paid'}</div>
          <div style="font-size:28px;font-weight:700;font-family:monospace;color:#0F766E;margin-top:4px;">${escapeHtml(fmt(payment.amount))}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px;">
          <tr>
            <td style="padding:8px 0;color:#64748B;border-bottom:1px solid #E2E8F0;">${isKm ? 'អតិថិជន' : 'Customer'}</td>
            <td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #E2E8F0;">${escapeHtml(plan.customerName)}${plan.customerPhone ? ` · ${escapeHtml(plan.customerPhone)}` : ''}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748B;border-bottom:1px solid #E2E8F0;">${isKm ? 'មុខទំនិញ' : 'Item'}</td>
            <td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #E2E8F0;">${escapeHtml(plan.itemName)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748B;border-bottom:1px solid #E2E8F0;">${isKm ? 'វិធីបង់ប្រាក់' : 'Payment Method'}</td>
            <td style="padding:8px 0;text-align:right;border-bottom:1px solid #E2E8F0;">${escapeHtml(localizeMethod(payment.method, isKm))}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748B;border-bottom:1px solid #E2E8F0;">${isKm ? 'សមតុល្យនៅសល់' : 'Remaining Balance'}</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;font-family:monospace;border-bottom:1px solid #E2E8F0;">${escapeHtml(fmt(plan.remainingBalance))}</td>
          </tr>
        </table>
      `;
    },
    `installment-receipt-${payment.id}.pdf`,
    lang
  );
}
