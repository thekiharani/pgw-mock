-- migrate:up

-- Production-safe seed: the platform admin plus the 10 named sandbox merchants.
-- Sign-in is email-OTP only (better-auth emailOTP); email_verified is preset so
-- the OTP step is the only gate. The bulk demo dataset lives in the next
-- migration, gated off in production (see 20260101000006_seed_demo.sql).
INSERT INTO users (id, name, email, email_verified, role) VALUES
  ('019ec766-5000-7aaa-8000-000000000001', 'Noria Admin', 'admin@noria.co.ke', true, 'admin');

INSERT INTO merchants
  (id, name, email, phone_number, mpesa_paybill_number, sasapay_till_number, mpesa_balance, sasapay_balance, meta)
VALUES
  ('019ec766-4e13-7796-bf86-dd5c6e75a2ff', 'MJENGOTECH SANDBOX', 'sandbox@mjengotech.com', '254799000000', '887000', 'NA-MPESA-887000', 55000000, 0, '{"description":"MJENGOTECH SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf86-e28a6284ad02', 'MJENGOSMART SANDBOX', 'sandbox@mjengosmart.com', '254799000001', '887001', 'NA-MPESA-887001', 57500000, 0, '{"description":"MJENGOSMART SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf86-e7b6ad566e2e', 'BAMBURI CEMENT SANDBOX', 'sandbox@bamburi.co.ke', '254799000002', '887002', 'NA-MPESA-887002', 100000000, 0, '{"description":"BAMBURI CEMENT SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf86-ea0efeccd38a', 'SAVANNAH CEMENT SANDBOX', 'sandbox@savannahcement.com', '254799000003', '887003', 'NA-MPESA-887003', 120000000, 0, '{"description":"SAVANNAH CEMENT SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf86-edad5f683a0c', 'CROWN PAINTS SANDBOX', 'sandbox@crownpaints.co.ke', '254799000004', '887004', 'NA-MPESA-887004', 150000000, 0, '{"description":"CROWN PAINTS SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf86-f17c8e5d028b', 'KASARANI HARDWARE SANDBOX', 'sandbox@kasaranihardware.com', '254799000005', '887005', 'NA-MPESA-887005', 50000000, 0, '{"description":"KASARANI HARDWARE SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf86-f524cd0fd32b', 'RHINO MABATI SANDBOX', 'sandbox@rhinomabati.co.ke', '254799000006', '887006', 'NA-MPESA-887006', 450000000, 0, '{"description":"RHINO MABATI SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf86-fb26677e71df', 'TONONOKA STEELS SANDBOX', 'sandbox@tononokasteels.com', '254799000007', '887007', 'NA-MPESA-887007', 100000000, 0, '{"description":"TONONOKA STEELS SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf86-ff32ff748cdb', 'BLUE TRIANGLE SANDBOX', 'sandbox@bluetriangle.co.ke', '254799000008', '887008', 'NA-MPESA-887008', 200000000, 0, '{"description":"BLUE TRIANGLE SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}'),
  ('019ec766-4e13-7796-bf87-02acaaf2ebfa', 'MOMBASA CEMENT SANDBOX', 'sandbox@mombasacement.com', '254799000009', '887009', 'NA-MPESA-887009', 80000000, 0, '{"description":"MOMBASA CEMENT SANDBOX Sandbox Merchant","mpesa":{"kind":"PAYBILL","capabilities":["c2b","b2c","b2b"]}}');

-- Deterministic per-merchant API credentials, derived from the paybill/till.
UPDATE merchants SET
  mpesa_consumer_key    = CONCAT('mpesa_ck_', mpesa_paybill_number),
  mpesa_consumer_secret = CONCAT('mpesa_cs_', mpesa_paybill_number),
  sasapay_client_id     = CONCAT('sasapay_cid_', sasapay_till_number),
  sasapay_client_secret = CONCAT('sasapay_cs_', sasapay_till_number);

-- migrate:down

DELETE FROM merchants WHERE mpesa_paybill_number ~ '^88700[0-9]$';
DELETE FROM users WHERE email = 'admin@noria.co.ke';
