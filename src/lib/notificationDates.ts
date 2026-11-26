/**
 * DST-free local calendar date & Khmer public holiday utilities.
 * Uses Intl.DateTimeFormat with Asia/Phnom_Penh as default so calendar-day
 * arithmetic never drifts due to 24-hour millisecond offsets or DST transitions.
 */

export const DEFAULT_TIMEZONE = 'Asia/Phnom_Penh';

export interface HolidayInfo {
  dateIso: string;
  key: string;
  nameEn: string;
  nameKm: string;
}

const FIXED_KHMER_HOLIDAYS: Record<string, { key: string; nameEn: string; nameKm: string }> = {
  '01-01': {
    key: 'new_year',
    nameEn: 'International New Year Day',
    nameKm: 'ទិវាបុណ្យចូលឆ្នាំសកល',
  },
  '01-07': {
    key: 'victory_day',
    nameEn: 'Victory Over Genocide Day',
    nameKm: 'ទិវាជ័យជម្នះលើរបបប្រល័យពូជសាសន៍',
  },
  '03-08': {
    key: 'womens_day',
    nameEn: "International Women's Day",
    nameKm: 'ទិវានារីអន្តរជាតិ',
  },
  '04-14': {
    key: 'khmer_new_year',
    nameEn: 'Khmer New Year (Day 1)',
    nameKm: 'ពិធីបុណ្យចូលឆ្នាំថ្មីប្រពៃណីជាតិ',
  },
  '04-15': {
    key: 'khmer_new_year',
    nameEn: 'Khmer New Year (Day 2)',
    nameKm: 'ពិធីបុណ្យចូលឆ្នាំថ្មីប្រពៃណីជាតិ',
  },
  '04-16': {
    key: 'khmer_new_year',
    nameEn: 'Khmer New Year (Day 3)',
    nameKm: 'ពិធីបុណ្យចូលឆ្នាំថ្មីប្រពៃណីជាតិ',
  },
  '05-01': {
    key: 'labor_day',
    nameEn: 'International Labor Day',
    nameKm: 'ទិវាពលកម្មអន្តរជាតិ',
  },
  '05-14': {
    key: 'king_birthday',
    nameEn: "King Sihamoni's Birthday",
    nameKm: 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្មព្រះមហាក្សត្រ',
  },
  '06-18': {
    key: 'queen_mother_birthday',
    nameEn: "Queen Mother's Birthday",
    nameKm: 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្មសម្តេចម៉ែ',
  },
  '09-24': {
    key: 'constitution_day',
    nameEn: 'Constitutional Day',
    nameKm: 'ទិវាប្រកាសរដ្ឋធម្មនុញ្ញ',
  },
  '10-15': {
    key: 'king_father_day',
    nameEn: 'Commemoration Day of King Father',
    nameKm: 'ទិវាគោរពព្រះវិញ្ញាណក្ខន្ធព្រះបរមរតនកោដ្ឋ',
  },
  '10-29': {
    key: 'coronation_day',
    nameEn: 'Coronation Day of King Sihamoni',
    nameKm: 'ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ',
  },
  '11-09': {
    key: 'independence_day',
    nameEn: 'Independence Day',
    nameKm: 'ទិវាបុណ្យឯករាជ្យជាតិ',
  },
};

// Approximate lunar-calendar Khmer festival dates (Pchum Ben & Water Festival) for 2024–2028
const LUNAR_KHMER_HOLIDAYS: Record<string, { key: string; nameEn: string; nameKm: string }> = {
  '2025-05-11': { key: 'visak_bochea', nameEn: 'Visak Bochea Day', nameKm: 'ពិធីបុណ្យវិសាខបូជា' },
  '2025-05-15': { key: 'royal_ploughing', nameEn: 'Royal Ploughing Ceremony', nameKm: 'ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល' },
  '2025-09-21': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2025-09-22': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2025-09-23': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2025-11-04': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
  '2025-11-05': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
  '2025-11-06': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
  '2026-05-01': { key: 'visak_bochea', nameEn: 'Visak Bochea Day', nameKm: 'ពិធីបុណ្យវិសាខបូជា' },
  '2026-05-05': { key: 'royal_ploughing', nameEn: 'Royal Ploughing Ceremony', nameKm: 'ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល' },
  '2026-10-09': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2026-10-10': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2026-10-11': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2026-11-23': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
  '2026-11-24': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
  '2026-11-25': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
  '2027-05-20': { key: 'visak_bochea', nameEn: 'Visak Bochea Day', nameKm: 'ពិធីបុណ្យវិសាខបូជា' },
  '2027-05-24': { key: 'royal_ploughing', nameEn: 'Royal Ploughing Ceremony', nameKm: 'ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល' },
  '2027-09-29': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2027-09-30': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2027-10-01': { key: 'pchum_ben', nameEn: 'Pchum Ben Festival', nameKm: 'ពិធីបុណ្យភ្ជុំបិណ្ឌ' },
  '2027-11-12': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
  '2027-11-13': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
  '2027-11-14': { key: 'water_festival', nameEn: 'Water Festival (Bon Om Touk)', nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក' },
};

export function resolveDeviceTimeZone(preferred?: string): string {
  if (preferred) return preferred;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function getLocalIsoDate(now: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback below if invalid timezone
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getLocalHHMM(now: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hour === '24' ? '00' : hour}:${minute}`;
  } catch {
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

export function parseIsoDateToUtcDayNumber(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Pure calendar-day difference (`laterIso - earlierIso`) unaffected by DST or local offsets.
 */
export function diffCalendarDays(laterIso: string, earlierIso: string): number {
  const a = parseIsoDateToUtcDayNumber(laterIso);
  const b = parseIsoDateToUtcDayNumber(earlierIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return a - b;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const dayNum = parseIsoDateToUtcDayNumber(isoDate);
  if (!Number.isFinite(dayNum)) return isoDate;
  const dt = new Date((dayNum + days) * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

export function getIsoWeekKey(isoDate: string): string {
  const dayNum = parseIsoDateToUtcDayNumber(isoDate);
  if (!Number.isFinite(dayNum)) return isoDate;
  const dt = new Date(dayNum * 86_400_000);
  const dayOfWeek = dt.getUTCDay() || 7; // 1 (Mon) .. 7 (Sun)
  dt.setUTCDate(dt.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function isTimeInQuietHours(
  hhmm: string,
  quietHours: { enabled: boolean; start: string; end: string }
): boolean {
  if (!quietHours.enabled) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map((n) => Number(n) || 0);
    return h * 60 + m;
  };
  const nowMin = toMin(hhmm);
  const startMin = toMin(quietHours.start);
  const endMin = toMin(quietHours.end);
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  // Overnight window e.g. 21:00 -> 07:00
  return nowMin >= startMin || nowMin < endMin;
}

export function getKhmerPublicHoliday(isoDate: string): HolidayInfo | null {
  const lunar = LUNAR_KHMER_HOLIDAYS[isoDate];
  if (lunar) {
    return { dateIso: isoDate, ...lunar };
  }
  const mmdd = isoDate.slice(5, 10);
  const fixed = FIXED_KHMER_HOLIDAYS[mmdd];
  if (fixed) {
    return { dateIso: isoDate, ...fixed };
  }
  return null;
}
