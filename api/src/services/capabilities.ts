import { PayloadError } from '@/errors.js';

export type Capability = 'c2b' | 'b2c' | 'b2b';
export type ShortcodeKind = 'TILL' | 'PAYBILL';

export const VALID_CAPABILITIES = new Set<string>(['c2b', 'b2c', 'b2b']);
export const VALID_KINDS = new Set<string>(['TILL', 'PAYBILL']);

export const DEFAULT_KIND: ShortcodeKind = 'PAYBILL';
export const DEFAULT_CAPABILITIES: Capability[] = ['c2b', 'b2c', 'b2b'];

export type Operation =
  | 'stk_push'
  | 'c2b_simulate'
  | 'c2b_register_url'
  | 'b2c'
  | 'b2b'
  | 'reversal'
  | 'transaction_status'
  | 'account_balance'
  | 'qr_code';

const OPERATION_REQUIRES: Record<Operation, Capability | Capability[] | null> = {
  stk_push: 'c2b',
  c2b_simulate: 'c2b',
  c2b_register_url: 'c2b',
  qr_code: 'c2b',
  b2c: 'b2c',
  b2b: 'b2b',
  reversal: ['b2c', 'b2b'],
  transaction_status: null,
  account_balance: null,
};

const STK_TX_TYPE_BY_KIND: Record<ShortcodeKind, Set<string>> = {
  TILL: new Set(['CustomerBuyGoodsOnline']),
  PAYBILL: new Set(['CustomerPayBillOnline']),
};
const C2B_COMMAND_BY_KIND = STK_TX_TYPE_BY_KIND;

// The merchant's `meta` JSON holds the M-Pesa capability config under
// `meta.mpesa`. These readers operate on that raw meta object so both the
// gateway lookups (which alias the column as `merchant_meta`) and the console
// mapper (plain `meta`) share one source of truth.
export function readShortcodeKind(meta: Record<string, any> | null | undefined): ShortcodeKind {
  const raw = meta?.mpesa?.kind ?? DEFAULT_KIND;
  if (!VALID_KINDS.has(raw)) return DEFAULT_KIND;
  return raw;
}

export function readCapabilities(meta: Record<string, any> | null | undefined): Capability[] {
  const raw = meta?.mpesa?.capabilities;
  if (Array.isArray(raw)) {
    const filtered = raw.filter(
      (c: unknown): c is Capability => typeof c === 'string' && VALID_CAPABILITIES.has(c),
    );
    if (filtered.length) return filtered;
  }
  return [...DEFAULT_CAPABILITIES];
}

// Merge capability config into a merchant's existing meta without clobbering
// sibling keys (e.g. registered c2b confirmation/validation URLs).
export function writeMpesaMeta(
  meta: Record<string, any> | null | undefined,
  patch: { capabilities?: Capability[]; shortcodeKind?: ShortcodeKind },
): Record<string, any> {
  const base = meta && typeof meta === 'object' ? { ...meta } : {};
  const mpesa = { ...(base.mpesa ?? {}) };
  if (patch.capabilities !== undefined) mpesa.capabilities = patch.capabilities;
  if (patch.shortcodeKind !== undefined) mpesa.kind = patch.shortcodeKind;
  base.mpesa = mpesa;
  return base;
}

export function shortcodeKind(merchant: Record<string, any>): ShortcodeKind {
  return readShortcodeKind(merchant.merchant_meta);
}

export function capabilitiesOf(merchant: Record<string, any>): Set<Capability> {
  return new Set(readCapabilities(merchant.merchant_meta));
}

function darajaError(
  errorCode: string,
  message: string,
  extras: Record<string, any> = {},
): Record<string, any> {
  const payload: Record<string, any> = { requestId: '', errorCode, errorMessage: message };
  for (const [k, v] of Object.entries(extras)) {
    if (v !== null && v !== undefined) payload[k] = v;
  }
  return payload;
}

export function enforceCapability(
  merchant: Record<string, any>,
  operation: Operation,
  opts: { transactionType?: string | null; commandId?: string | null } = {},
): ShortcodeKind {
  const kind = shortcodeKind(merchant);
  const caps = capabilitiesOf(merchant);
  const required = OPERATION_REQUIRES[operation];

  if (required !== null) {
    const requiredList = Array.isArray(required) ? required : [required];
    if (!requiredList.some((c) => caps.has(c))) {
      throw new PayloadError({
        statusCode: 400,
        payload: darajaError('400.002.02', `Bad Request - Shortcode does not support ${operation}`),
      });
    }
  }

  if (operation === 'stk_push' && opts.transactionType != null) {
    if (!STK_TX_TYPE_BY_KIND[kind].has(opts.transactionType)) {
      throw new PayloadError({
        statusCode: 400,
        payload: darajaError(
          '400.002.02',
          `Bad Request - TransactionType ${opts.transactionType} not valid for ${kind}`,
        ),
      });
    }
  }

  if (operation === 'c2b_simulate' && opts.commandId != null) {
    if (!C2B_COMMAND_BY_KIND[kind].has(opts.commandId)) {
      throw new PayloadError({
        statusCode: 400,
        payload: darajaError(
          '400.002.02',
          `Bad Request - CommandID ${opts.commandId} not valid for ${kind}`,
        ),
      });
    }
  }

  return kind;
}
