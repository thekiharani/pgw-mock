// Generates db/migrations/20260101000002_seed_merchants.sql
// Faithful port of alembic _seed_merchants() in the Python source.
import { writeFileSync } from 'node:fs';
import { v7 as uuidv7 } from 'uuid';

const NAMED_INTEGRATED_MERCHANTS = [
  ['MJENGOTECH SANDBOX', 'sandbox@mjengotech.com', '254799000000', 55_000_000],
  ['MJENGOSMART SANDBOX', 'sandbox@mjengosmart.com', '254799000001', 57_500_000],
  ['BAMBURI CEMENT SANDBOX', 'sandbox@bamburi.co.ke', '254799000002', 100_000_000],
  ['SAVANNAH CEMENT SANDBOX', 'sandbox@savannahcement.com', '254799000003', 120_000_000],
  ['CROWN PAINTS SANDBOX', 'sandbox@crownpaints.co.ke', '254799000004', 150_000_000],
  ['KASARANI HARDWARE SANDBOX', 'sandbox@kasaranihardware.com', '254799000005', 50_000_000],
  ['RHINO MABATI SANDBOX', 'sandbox@rhinomabati.co.ke', '254799000006', 450_000_000],
  ['TONONOKA STEELS SANDBOX', 'sandbox@tononokasteels.com', '254799000007', 100_000_000],
  ['BLUE TRIANGLE SANDBOX', 'sandbox@bluetriangle.co.ke', '254799000008', 200_000_000],
  ['MOMBASA CEMENT SANDBOX', 'sandbox@mombasacement.com', '254799000009', 80_000_000],
];

const MERCHANTS_PER_RANGE = 50;
const DEFAULT_BALANCE = 50_000_000;

// Each M-Pesa range declares an explicit shortcode `kind` (TILL | PAYBILL) and
// a `capabilities` bundle — any subset of c2b / b2c / b2b. A single shortcode
// can bundle 1, 2 or all 3.
//   884000 tills:        TILL,    [c2b]              (buy goods collections)
//   885000 disbursement: PAYBILL, [b2c, b2b]
//   886000 collection:   PAYBILL, [c2b]
//   887000 integrated:   PAYBILL, [c2b, b2c, b2b]    (all bundled)
//   888000 sasapay tills
const RANGE_SPECS = [
  ['till', 884000, 'Mock M-Pesa Till', 'TILL', ['c2b'], false],
  ['disbursement', 885000, 'Mock M-Pesa Disbursement', 'PAYBILL', ['b2c', 'b2b'], false],
  ['collection', 886000, 'Mock M-Pesa Collection', 'PAYBILL', ['c2b'], false],
  ['integrated', 887000, 'Mock M-Pesa Integrated', 'PAYBILL', ['c2b', 'b2c', 'b2b'], false],
  ['sasapay', 888000, 'Mock SasaPay Merchant', null, null, true],
];

const sqlStr = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
const sqlJson = (obj) => sqlStr(JSON.stringify(obj));

const rows = [];
let phoneSeq = 0;

for (const [label, start, prefix, kind, capabilities, isSasapay] of RANGE_SPECS) {
  for (let offset = 0; offset < MERCHANTS_PER_RANGE; offset++) {
    const shortcode = String(start + offset);
    let name, email, phone, balance;
    if (label === 'integrated' && offset < NAMED_INTEGRATED_MERCHANTS.length) {
      [name, email, phone, balance] = NAMED_INTEGRATED_MERCHANTS[offset];
    } else {
      name = `${prefix} ${shortcode}`;
      email = `sandbox+${label}-${shortcode}@example.com`;
      phone = ('2547' + String(99_000_000 + phoneSeq).padStart(8, '0')).slice(-12);
      balance = DEFAULT_BALANCE;
      phoneSeq += 1;
    }

    let paybillValue, tillValue, mpesaBalance, sasapayBalance, meta;
    if (isSasapay) {
      paybillValue = `NA-SASAPAY-${shortcode}`;
      tillValue = shortcode;
      mpesaBalance = 0;
      sasapayBalance = balance;
      // SasaPay tills are full-service: they always carry all three capabilities.
      meta = {
        description: `${name} Sandbox Merchant`,
        sasapay: { till_number: shortcode, capabilities: ['c2b', 'b2c', 'b2b'] },
      };
    } else {
      paybillValue = shortcode;
      tillValue = `NA-MPESA-${shortcode}`;
      mpesaBalance = balance;
      sasapayBalance = 0;
      meta = {
        description: `${name} Sandbox Merchant`,
        mpesa: { kind, capabilities },
      };
    }

    rows.push(
      '  (' +
        [
          sqlStr(uuidv7()),
          sqlStr(name),
          sqlStr(email),
          sqlStr(phone),
          sqlStr(paybillValue),
          sqlStr(tillValue),
          mpesaBalance,
          sasapayBalance,
          sqlJson(meta),
        ].join(', ') +
        ')',
    );
  }
}

const sql = `-- migrate:up

INSERT INTO merchants
  (id, name, email, phone_number, mpesa_paybill_number, sasapay_till_number, mpesa_balance, sasapay_balance, meta)
VALUES
${rows.join(',\n')};

-- migrate:down

DELETE FROM merchants
WHERE mpesa_paybill_number REGEXP '^(884|885|886|887)[0-9]{3}$'
   OR sasapay_till_number REGEXP '^888[0-9]{3}$';
`;

writeFileSync(new URL('../db/migrations/20260101000002_seed_merchants.sql', import.meta.url), sql);
console.log(`Wrote seed migration with ${rows.length} merchants.`);
