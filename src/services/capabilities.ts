/**
 * M-Pesa shortcode capability model.
 *
 * A shortcode has:
 *   - a `kind`: "TILL" (Buy Goods) or "PAYBILL" (Pay Bill) — this drives the
 *     valid STK TransactionType / C2B CommandID pairing.
 *   - a `capabilities` bundle: any non-empty subset of {"c2b", "b2c", "b2b"}.
 *     One shortcode can bundle 1, 2 or all 3.
 *
 * Storage: each Merchant row carries `meta.mpesa.kind` and
 * `meta.mpesa.capabilities`. Missing values default to a PAYBILL with all three
 * capabilities so legacy/seed-less data keeps working.
 */
import { PayloadError } from '../errors.js';

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

/**
 * Capability required to run each operation. `null` means any onboarded
 * shortcode may run it (status/balance queries). An array means the shortcode
 * needs at least one of the listed capabilities (reversal reverses an outbound
 * disbursement, so it needs b2c or b2b).
 */
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

// STK TransactionType / C2B CommandID must pair with the shortcode kind.
const STK_TX_TYPE_BY_KIND: Record<ShortcodeKind, Set<string>> = {
  TILL: new Set(['CustomerBuyGoodsOnline']),
  PAYBILL: new Set(['CustomerPayBillOnline']),
};
const C2B_COMMAND_BY_KIND = STK_TX_TYPE_BY_KIND;

export function shortcodeKind(merchant: Record<string, any>): ShortcodeKind {
  const meta = merchant.merchant_meta ?? {};
  const raw = meta?.mpesa?.kind ?? DEFAULT_KIND;
  if (!VALID_KINDS.has(raw)) return DEFAULT_KIND;
  return raw;
}

export function capabilitiesOf(merchant: Record<string, any>): Set<Capability> {
  const meta = merchant.merchant_meta ?? {};
  const raw = meta?.mpesa?.capabilities;
  if (Array.isArray(raw)) {
    const filtered = raw.filter(
      (c: unknown): c is Capability => typeof c === 'string' && VALID_CAPABILITIES.has(c),
    );
    if (filtered.length) return new Set(filtered);
  }
  return new Set(DEFAULT_CAPABILITIES);
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

/**
 * Validate the merchant's capabilities/kind can run the given operation.
 * Returns the resolved shortcode kind. Raises PayloadError (HTTP 400) with a
 * Daraja-shaped envelope on mismatch.
 */
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
