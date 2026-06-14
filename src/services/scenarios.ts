/** Mirrors app/services/scenarios.py. */
import { and, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';

import type { Executor } from '@/db/client.js';
import { mockScenarios } from '@/db/schema.js';
import { generateUlid } from '@/utils/generators.js';

export interface ProviderResult {
  code: string;
  description: string;
  status: string;
  payload?: Record<string, any> | null;
}

export const MPESA_RESULT_CATALOG: Record<string, ProviderResult> = {
  '0': {
    code: '0',
    description: 'The service request is processed successfully.',
    status: 'SUCCESS',
  },
  '1': {
    code: '1',
    description: 'The balance is insufficient for the transaction.',
    status: 'FAILED',
  },
  '17': { code: '17', description: 'Internal system error.', status: 'FAILED' },
  '1032': { code: '1032', description: 'Request cancelled by user.', status: 'CANCELLED' },
  '1037': { code: '1037', description: 'DS timeout user cannot be reached.', status: 'TIMEOUT' },
  '2001': { code: '2001', description: 'The initiator information is invalid.', status: 'FAILED' },
};

export const SASAPAY_RESULT_CATALOG: Record<string, ProviderResult> = {
  '0': { code: '0', description: 'Transaction processed successfully.', status: 'SUCCESS' },
  '1': { code: '1', description: 'Transaction failed.', status: 'FAILED' },
  '400': { code: '400', description: 'Transaction failed.', status: 'FAILED' },
  '500': {
    code: '500',
    description: 'Transaction failed to process. Please try again.',
    status: 'FAILED',
  },
};

export const AMOUNT_RESULT_CODES = new Set(['1', '17', '1032', '1037', '2001']);
export const SASAPAY_FAILURE_AMOUNTS = new Set([
  '11000',
  '22000',
  '33000',
  '44000',
  '55000',
  '66000',
  '77000',
  '88000',
  '99000',
]);

export async function createScenario(
  exec: Executor,
  opts: {
    provider: string;
    flow: string;
    selectorType: string;
    selectorValue: string | null;
    resultCode: string;
    resultDescription: string;
    status: string;
    payload?: Record<string, any> | null;
  },
): Promise<{
  id: string;
  provider: string;
  flow: string;
  selector_type: string;
  selector_value: string | null;
  result_code: string;
  result_description: string;
  status: string;
  payload: Record<string, any>;
}> {
  const id = generateUlid();
  const payload = opts.payload ?? {};
  await exec.insert(mockScenarios).values({
    id,
    provider: opts.provider,
    flow: opts.flow,
    selectorType: opts.selectorType,
    selectorValue: opts.selectorValue,
    resultCode: opts.resultCode,
    resultDescription: opts.resultDescription,
    status: opts.status,
    payload,
  });
  return {
    id,
    provider: opts.provider,
    flow: opts.flow,
    selector_type: opts.selectorType,
    selector_value: opts.selectorValue,
    result_code: opts.resultCode,
    result_description: opts.resultDescription,
    status: opts.status,
    payload,
  };
}

export async function resolveMpesaResult(
  exec: Executor,
  request: { headers: Record<string, any> } | null,
  opts: { flow: string; amount?: unknown; reference?: string | null },
): Promise<ProviderResult> {
  const persisted = await resolvePersisted(
    exec,
    'mpesa',
    opts.flow,
    opts.amount,
    opts.reference ?? null,
  );
  if (persisted) return persisted;

  const requested = header(request, 'x-mock-result-code');
  if (requested) {
    return MPESA_RESULT_CATALOG[requested.trim()] ?? MPESA_RESULT_CATALOG['0']!;
  }
  return MPESA_RESULT_CATALOG[amountResultCode(opts.amount)] ?? MPESA_RESULT_CATALOG['0']!;
}

export async function resolveSasapayResult(
  exec: Executor,
  request: { headers: Record<string, any> } | null,
  opts: { flow: string; amount?: unknown; reference?: string | null },
): Promise<ProviderResult> {
  const persisted = await resolvePersisted(
    exec,
    'sasapay',
    opts.flow,
    opts.amount,
    opts.reference ?? null,
  );
  if (persisted) return persisted;

  const requested = header(request, 'x-mock-result-code');
  if (requested) {
    return SASAPAY_RESULT_CATALOG[requested.trim()] ?? SASAPAY_RESULT_CATALOG['0']!;
  }
  const amountValue = amountSelector(opts.amount);
  if (amountValue && SASAPAY_FAILURE_AMOUNTS.has(amountValue)) {
    return SASAPAY_RESULT_CATALOG['400']!;
  }
  return SASAPAY_RESULT_CATALOG['0']!;
}

export function isTimeoutResult(resultCode: string): boolean {
  return resultCode === '1037';
}

async function resolvePersisted(
  exec: Executor,
  provider: string,
  flow: string,
  amount: unknown,
  reference: string | null,
): Promise<ProviderResult | null> {
  const selectors: Array<[string, string | null]> = [['default', null]];
  if (reference) selectors.unshift(['reference', reference]);
  const amountValue = amountSelector(amount);
  if (amountValue) selectors.unshift(['amount', amountValue]);

  const selectorConds: SQL[] = selectors.map(
    ([type, value]) =>
      and(
        eq(mockScenarios.selectorType, type),
        value === null
          ? isNull(mockScenarios.selectorValue)
          : eq(mockScenarios.selectorValue, value),
      )!,
  );

  const rows = await exec
    .select()
    .from(mockScenarios)
    .where(
      and(
        eq(mockScenarios.provider, provider),
        inArray(mockScenarios.flow, [flow, '*']),
        or(...selectorConds),
      ),
    )
    .orderBy(desc(mockScenarios.createdAt))
    .limit(1);

  const scenario = rows[0];
  if (!scenario) return null;
  return {
    code: scenario.resultCode,
    description: scenario.resultDescription,
    status: scenario.status,
    payload: scenario.payload,
  };
}

function amountResultCode(amount: unknown): string {
  const value = amountSelector(amount);
  if (value && AMOUNT_RESULT_CODES.has(value)) return value;
  return '0';
}

/** Mirror of _amount_selector: integral amounts -> int string, else decimal string. */
function amountSelector(amount: unknown): string | null {
  if (amount === null || amount === undefined) return null;
  const raw = String(amount).trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(raw)) return null;
  const num = Number(raw);
  if (Number.isNaN(num)) return null;
  if (Number.isInteger(num)) return String(num);
  let s = String(num);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function header(request: { headers: Record<string, any> } | null, name: string): string | null {
  if (!request) return null;
  const v = request.headers[name];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' ? v : null;
}
