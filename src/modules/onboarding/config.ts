export const ONBOARDING_VERSION = 1;

export const DEFAULT_EXCHANGE_RATE_KHR = 4100;

export const ONBOARDING_DB_NAME = 'kamchi_onboarding_db';
export const ONBOARDING_DB_VERSION = 1;

export const BUSINESS_STORAGE_PREFIX = 'business_';

export const ONBOARDING_LOCAL_KEYS = {
  state: `${BUSINESS_STORAGE_PREFIX}onboarding_state_v${ONBOARDING_VERSION}`,
  profile: `${BUSINESS_STORAGE_PREFIX}profile_v1`,
  defaults: `${BUSINESS_STORAGE_PREFIX}defaults_v1`,
} as const;

export const FIELD_LIMITS = {
  businessNameMax: 100,
  ownerNameMax: 80,
  phoneMax: 24,
  telegramMax: 48,
  addressMax: 180,
  provinceMax: 60,
  logoMaxBytes: 180_000,
} as const;

export interface CambodiaProvinceOption {
  code: string;
  en: string;
  km: string;
}

export const CAMBODIAN_PROVINCES: ReadonlyArray<CambodiaProvinceOption> = [
  { code: 'PP', en: 'Phnom Penh', km: 'រាជធានីភ្នំពេញ' },
  { code: 'SR', en: 'Siem Reap', km: 'សៀមរាប' },
  { code: 'BTB', en: 'Battambang', km: 'បាត់ដំបង' },
  { code: 'KDL', en: 'Kandal', km: 'កណ្តាល' },
  { code: 'KPC', en: 'Kampong Cham', km: 'កំពង់ចាម' },
  { code: 'KPS', en: 'Preah Sihanouk', km: 'ព្រះសីហនុ' },
  { code: 'KPT', en: 'Kampot', km: 'កំពត' },
  { code: 'KSP', en: 'Kampong Speu', km: 'កំពង់ស្ពឺ' },
  { code: 'KTH', en: 'Kampong Thom', km: 'កំពង់ធំ' },
  { code: 'BMC', en: 'Banteay Meanchey', km: 'បន្ទាយមានជ័យ' },
  { code: 'PRV', en: 'Prey Veng', km: 'ព្រៃវែង' },
  { code: 'SVR', en: 'Svay Rieng', km: 'ស្វាយរៀង' },
  { code: 'TKO', en: 'Takeo', km: 'តាកែវ' },
  { code: 'TBK', en: 'Tboung Khmum', km: 'ត្បូងឃ្មុំ' },
  { code: 'KCH', en: 'Kampong Chhnang', km: 'កំពង់ឆ្នាំង' },
  { code: 'PUR', en: 'Pursat', km: 'ពោធិ៍សាត់' },
  { code: 'KRT', en: 'Kratie', km: 'ក្រចេះ' },
  { code: 'KKG', en: 'Koh Kong', km: 'កោះកុង' },
  { code: 'KEP', en: 'Kep', km: 'កែប' },
  { code: 'PLN', en: 'Pailin', km: 'ប៉ៃលិន' },
  { code: 'OMC', en: 'Oddar Meanchey', km: 'ឧត្តរមានជ័យ' },
  { code: 'PVH', en: 'Preah Vihear', km: 'ព្រះវិហារ' },
  { code: 'STG', en: 'Stung Treng', km: 'ស្ទឹងត្រែង' },
  { code: 'RTK', en: 'Ratanakiri', km: 'រតនគិរី' },
  { code: 'MDK', en: 'Mondulkiri', km: 'មណ្ឌលគិរី' },
] as const;

export const KHR_ROUNDING_STEPS = [100, 500, 1000] as const;
