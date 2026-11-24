export interface XlsxSheetInput {
  name: string;
  rows: Array<Record<string, string | number>>;
  defaultHeaders?: string[];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function sanitizeXmlText(input: unknown): string {
  // Strip XML 1.0 illegal control characters while preserving tabs, newlines, and full Unicode/Khmer
  const cleaned = String(input ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(raw: string, fallbackIndex: number): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${fallbackIndex}`;
}

function columnLetter(colIndexZeroBased: number): string {
  let n = colIndexZeroBased + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function buildWorksheetXml(sheet: XlsxSheetInput): string {
  const headers =
    sheet.rows.length > 0
      ? Object.keys(sheet.rows[0])
      : sheet.defaultHeaders && sheet.defaultHeaders.length > 0
      ? sheet.defaultHeaders
      : ['NoData'];

  const colWidths = headers.map((h) => Math.max(10, Math.min(40, h.length + 4)));
  for (const row of sheet.rows.slice(0, 200)) {
    headers.forEach((h, idx) => {
      const len = String(row[h] ?? '').length + 3;
      if (len > colWidths[idx]) {
        colWidths[idx] = Math.min(42, len);
      }
    });
  }

  const colsXml = `<cols>${colWidths
    .map((w, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`)
    .join('')}</cols>`;

  const headerCells = headers
    .map((h, colIdx) => {
      const ref = `${columnLetter(colIdx)}1`;
      return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${sanitizeXmlText(h)}</t></is></c>`;
    })
    .join('');

  const dataRowsXml = sheet.rows
    .map((row, rowIdx) => {
      const rNum = rowIdx + 2;
      const cells = headers
        .map((h, colIdx) => {
          const ref = `${columnLetter(colIdx)}${rNum}`;
          const val = row[h];
          if (typeof val === 'number' && Number.isFinite(val)) {
            return `<c r="${ref}" t="n"><v>${val}</v></c>`;
          }
          const strVal = val === undefined || val === null ? '' : String(val);
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${sanitizeXmlText(strVal)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rNum}">${cells}</row>`;
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `${colsXml}` +
    `<sheetData><row r="1">${headerCells}</row>${dataRowsXml}</sheetData>` +
    `</worksheet>`
  );
}

function buildZipStore(entries: Array<{ path: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // compression: STORE
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  let cdSize = 0;
  for (const part of centralParts) {
    cdSize += part.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + cdSize + eocd.length;
  const result = new Uint8Array(totalLength);
  let cursor = 0;
  for (const p of localParts) {
    result.set(p, cursor);
    cursor += p.length;
  }
  for (const p of centralParts) {
    result.set(p, cursor);
    cursor += p.length;
  }
  result.set(eocd, cursor);
  return result;
}

export function buildXlsxBlob(sheets: XlsxSheetInput[]): Blob {
  const encoder = new TextEncoder();
  const safeSheets = sheets.map((s, idx) => ({
    ...s,
    name: sanitizeSheetName(s.name, idx + 1),
  }));

  const sheetOverrides = safeSheets
    .map(
      (_s, idx) =>
        `<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `${sheetOverrides}` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookSheetsXml = safeSheets
    .map(
      (s, idx) =>
        `<sheet name="${sanitizeXmlText(s.name)}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
    )
    .join('');

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${workbookSheetsXml}</sheets>` +
    `</workbook>`;

  const sheetRels = safeSheets
    .map(
      (_s, idx) =>
        `<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
    )
    .join('');
  const stylesRelId = `rId${safeSheets.length + 1}`;
  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `${sheetRels}` +
    `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="3">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border><left/><right/><top/><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
    `</cellXfs>` +
    `</styleSheet>`;

  const files: Array<{ path: string; data: Uint8Array }> = [
    { path: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { path: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { path: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { path: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    ...safeSheets.map((s, idx) => ({
      path: `xl/worksheets/sheet${idx + 1}.xml`,
      data: encoder.encode(buildWorksheetXml(s)),
    })),
  ];

  const zipBytes = buildZipStore(files);
  const buffer = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(buffer).set(zipBytes);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 15000);
}
