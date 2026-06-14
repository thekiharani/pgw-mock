export const COUNTRIES = [
  { id: 1, name: 'Kenya', callingCode: '254', isoCode: 'KE', currency: 'KES' },
  { id: 2, name: 'Uganda', callingCode: '256', isoCode: 'UG', currency: 'UGX' },
];

export const SUB_REGIONS: Record<string, Array<Record<string, any>>> = {
  '254': [
    { id: 101, countryId: 1, name: 'Nairobi', code: '047' },
    { id: 102, countryId: 1, name: 'Mombasa', code: '001' },
    { id: 103, countryId: 1, name: 'Kiambu', code: '022' },
  ],
  '256': [
    { id: 201, countryId: 2, name: 'Central', code: 'C' },
    { id: 202, countryId: 2, name: 'Western', code: 'W' },
  ],
};

export const INDUSTRIES = [
  { id: 62, name: 'Retail and Wholesale Trade' },
  { id: 63, name: 'Education' },
  { id: 64, name: 'Professional Services' },
  { id: 65, name: 'Hospitality' },
];

export const SUB_INDUSTRIES: Record<string, Array<Record<string, any>>> = {
  '62': [
    { id: 6201, industryId: 62, name: 'General Retail' },
    { id: 6202, industryId: 62, name: 'Supermarket' },
    { id: 6203, industryId: 62, name: 'E-commerce' },
  ],
  '63': [
    { id: 6301, industryId: 63, name: 'Primary School' },
    { id: 6302, industryId: 63, name: 'Secondary School' },
    { id: 6303, industryId: 63, name: 'College or University' },
  ],
  '64': [
    { id: 6401, industryId: 64, name: 'Accounting' },
    { id: 6402, industryId: 64, name: 'Technology Services' },
    { id: 6403, industryId: 64, name: 'Consulting' },
  ],
  '65': [
    { id: 6501, industryId: 65, name: 'Restaurant' },
    { id: 6502, industryId: 65, name: 'Hotel' },
  ],
};

export const BUSINESS_TYPES = [
  { id: 1, name: 'Sole Proprietorship', requiresBoardResolution: false, requiresCr12: false },
  { id: 2, name: 'Partnership', requiresBoardResolution: false, requiresCr12: false },
  { id: 3, name: 'Limited Company', requiresBoardResolution: true, requiresCr12: true },
  {
    id: 4,
    name: 'Non-Governmental Organization',
    requiresBoardResolution: true,
    requiresCr12: false,
  },
];

export const PRODUCTS = [
  { id: 1, name: 'Wallet', code: 'WALLET' },
  { id: 2, name: 'Payments', code: 'PAYMENTS' },
  { id: 3, name: 'Collections', code: 'COLLECTIONS' },
  { id: 4, name: 'Disbursements', code: 'DISBURSEMENTS' },
];

export const BANKS = [
  { id: 1, code: '01', name: 'Kenya Commercial Bank', shortName: 'KCB' },
  { id: 2, code: '02', name: 'Standard Chartered Bank', shortName: 'SCB' },
  { id: 3, code: '07', name: 'NCBA Bank', shortName: 'NCBA' },
  { id: 4, code: '11', name: 'Co-operative Bank', shortName: 'COOP' },
  { id: 5, code: '12', name: 'National Bank', shortName: 'NBK' },
  { id: 6, code: '19', name: 'Bank of Africa', shortName: 'BOA' },
  { id: 7, code: '23', name: 'Consolidated Bank Ltd', shortName: 'CBL' },
  { id: 8, code: '25', name: 'Credit Bank', shortName: 'CBA' },
  { id: 9, code: '31', name: 'CFC Stanbic', shortName: 'CFC' },
  { id: 10, code: '43', name: 'Ecobank', shortName: 'ECO' },
  { id: 11, code: '57', name: 'I & M Bank Limited', shortName: 'IM' },
  { id: 12, code: '63', name: 'Diamond Trust Bank', shortName: 'DTB' },
  { id: 13, code: '68', name: 'Equity Bank', shortName: 'EQB' },
  { id: 14, code: '70', name: 'Family Bank Ltd', shortName: 'FBL' },
  { id: 15, code: '72', name: 'Gulf African Bank', shortName: 'GAB' },
  { id: 16, code: '76', name: 'UBA Bank', shortName: 'UBA' },
];

export function responsePayload(message: string, data: Array<Record<string, any>>) {
  return { status: true, responseCode: '0', message, data };
}

const idsOf = (records: Array<{ id: number }>) => new Set(records.map((r) => Number(r.id)));

export const VALID_COUNTRY_IDS = idsOf(COUNTRIES);
export const VALID_SUB_REGION_IDS = new Set(
  Object.values(SUB_REGIONS).flatMap((records) => records.map((r) => Number(r.id))),
);
export const VALID_INDUSTRY_IDS = idsOf(INDUSTRIES);
export const VALID_SUB_INDUSTRY_IDS = new Set(
  Object.values(SUB_INDUSTRIES).flatMap((records) => records.map((r) => Number(r.id))),
);
export const VALID_BUSINESS_TYPE_IDS = idsOf(BUSINESS_TYPES);
export const VALID_PRODUCT_IDS = idsOf(PRODUCTS);

export const BUSINESS_TYPE_BY_ID = new Map(BUSINESS_TYPES.map((b) => [b.id, b]));
