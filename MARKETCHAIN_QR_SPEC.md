# MarketChain → KamChi Installment QR Specification

This specification defines the QR code payload and rendering standard for the **MarketChain** app so **KamChi** can scan receipts/invoices and pre-fill a **New Installment** plan offline.

---

## 1. Payload Format

Encode a **plain UTF-8 JSON object string** directly inside the QR code.

- Do **not** wrap the JSON in a URL, deep link, or Base64 string.
- Do **not** include the `KC1` prefix (reserved exclusively for KamChi license keys).
- Minified JSON (`JSON.stringify(payload)`) is recommended to keep QR module density low for reliable mobile camera and thermal-receipt scanning.

### Example JSON Payload

```json
{
  "source": "marketchain",
  "invoiceId": "MC-2026-0842",
  "item": "Samsung Galaxy A55 5G",
  "customerName": "Lukas Meyer",
  "phone": "012 345 678",
  "currency": "USD",
  "total": 480,
  "downPayment": 100,
  "installments": 6
}
```

---

## 2. Field Reference & Validation Rules

| Field | JSON Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `source` | `string` | Recommended | Set to `"marketchain"` to identify the POS source. |
| `invoiceId` | `string` | Optional* | Receipt or invoice reference displayed on KamChi's import confirmation banner (e.g. `"MC-2026-0842"`). |
| `item` | `string` | **Yes** | Product or item name. Pre-fills the **Item** field in the New Installment form. |
| `customerName` | `string` | **Yes** | Customer full name. Pre-fills the **Customer** field. |
| `phone` | `string` | Optional | Customer phone number (e.g. `"012 345 678"` or `"+85512345678"`). Pre-fills **Phone**. |
| `currency` | `"USD" \| "KHR"` | Optional | Currency code. Defaults to `"USD"` in the order summary when omitted. |
| `total` | `number` | **Yes** | Total item price (`>= 0`). Must be a JSON number (e.g. `480`), **not** a string (`"480"`). |
| `downPayment` | `number` | Optional | Deposit / down payment amount (`>= 0`). Defaults to `0` when omitted. |
| `installments` | `number` | Optional | Number of scheduled payments (integer `1`–`120`). Falls back to the shop's configured default when omitted. |

> **\*Recognition Rule:** KamChi's parser (`tryParseMarketChainPayload`) recognizes a QR code as a structured MarketChain order only when the decoded text parses as a JSON object containing at least one of `item` (string), `invoiceId` (string), or `total` (number).

---

## 3. QR Rendering Guidelines

Follow these settings so both live camera scanning and uploaded receipt/screenshot decoding succeed reliably:

- **Character Encoding:** UTF-8 (supports Khmer Unicode product/customer names cleanly)
- **Payload Size:** Keep under ~300 bytes where possible (avoid extra metadata or line-item arrays)
- **Error Correction Level:** `M` (15%, recommended) or `Q` (25%)
- **Colors:** Dark foreground (`#000000` or `#0F172A`) on a **solid white (`#FFFFFF`) background**
- **Quiet Zone (Margin):** Minimum `3`–`4` modules of solid white space around all four sides
- **Minimum Size:**
  - On-screen display: at least `256 × 256 px`
  - Thermal/POS printed receipt: at least `3 cm × 3 cm`

---

## 4. Reference Implementation (TypeScript / JavaScript)

```ts
import QRCode from 'qrcode';

export interface MarketChainInstallmentQrPayload {
  source: 'marketchain';
  invoiceId?: string;
  item: string;
  customerName: string;
  phone?: string;
  currency?: 'USD' | 'KHR';
  total: number;
  downPayment?: number;
  installments?: number;
}

export async function generateMarketChainInstallmentQr(
  order: MarketChainInstallmentQrPayload
): Promise<string> {
  const payload = JSON.stringify({
    source: 'marketchain',
    invoiceId: order.invoiceId,
    item: order.item.trim(),
    customerName: order.customerName.trim(),
    phone: order.phone?.trim(),
    currency: order.currency ?? 'USD',
    total: Number(order.total),
    downPayment: order.downPayment !== undefined ? Number(order.downPayment) : 0,
    installments: order.installments !== undefined ? Number(order.installments) : undefined,
  });

  return QRCode.toDataURL(payload, {
    width: 280,
    margin: 3,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}
```

---

## 5. Verification in KamChi

1. Open **Installments → Test QR** in KamChi to compare against the built-in reference QR (`public/assets/marketchain-test-qr.png`).
2. Open **Installments → New Installment → Scan MarketChain QR** (or **Import from MarketChain (QR)**) and either point the camera at the MarketChain QR or upload the PNG image.
3. Verify the confirmation banner displays the `invoiceId`, `item`, `customerName`, `phone`, `total`, `downPayment`, and `installments`, and that the New Installment form fields populate automatically.
