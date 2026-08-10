BEGIN;
CREATE TABLE IF NOT EXISTS plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('MONTHLY','ANNUAL')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  edition text NOT NULL,
  offline_lease_days integer NOT NULL CHECK (offline_lease_days BETWEEN 1 AND 90),
  grace_period_days integer NOT NULL CHECK (grace_period_days BETWEEN 0 AND 30),
  active boolean NOT NULL DEFAULT true
);
INSERT INTO plans(code,name,billing_cycle,amount_cents,edition,offline_lease_days,grace_period_days) VALUES
 ('ESSENTIAL_MONTHLY','Caixa no Controle Essencial','MONTHLY',990,'ESSENTIAL',7,5),
 ('ESSENTIAL_ANNUAL','Caixa no Controle Essencial','ANNUAL',9990,'ESSENTIAL',30,10)
ON CONFLICT(code) DO UPDATE SET name=excluded.name,billing_cycle=excluded.billing_cycle,amount_cents=excluded.amount_cents,edition=excluded.edition,offline_lease_days=excluded.offline_lease_days,grace_period_days=excluded.grace_period_days;

CREATE TABLE IF NOT EXISTS customers (id uuid PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,document text,created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS installations (id uuid PRIMARY KEY,customer_id uuid NOT NULL REFERENCES customers(id),installation_code text NOT NULL UNIQUE,device_public_key text NOT NULL,fingerprint text NOT NULL UNIQUE,first_seen_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL,status text NOT NULL CHECK(status IN('ACTIVE','REVOKED')));
CREATE TABLE IF NOT EXISTS subscriptions (id uuid PRIMARY KEY,customer_id uuid NOT NULL REFERENCES customers(id),installation_id uuid NOT NULL REFERENCES installations(id),plan_code text NOT NULL REFERENCES plans(code),provider text NOT NULL,provider_subscription_id text UNIQUE,status text NOT NULL CHECK(status IN('PAYMENT_PENDING','ACTIVE','GRACE_PERIOD','PAYMENT_FAILED','EXPIRED','CANCELED','REFUNDED')),current_period_start timestamptz,current_period_end timestamptz,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS subscriptions_installation_idx ON subscriptions(installation_id,status);
CREATE TABLE IF NOT EXISTS payments (id uuid PRIMARY KEY,subscription_id uuid NOT NULL REFERENCES subscriptions(id),provider_payment_id text NOT NULL UNIQUE,amount_cents integer NOT NULL CHECK(amount_cents >= 0),status text NOT NULL,paid_at timestamptz,created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS webhook_events (id uuid PRIMARY KEY,provider text NOT NULL,provider_event_id text NOT NULL,event_type text NOT NULL,status text NOT NULL,processed_at timestamptz,UNIQUE(provider,provider_event_id));
CREATE TABLE IF NOT EXISTS device_challenges (id uuid PRIMARY KEY,installation_id uuid NOT NULL REFERENCES installations(id),nonce_hash text NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS device_challenges_expiry_idx ON device_challenges(expires_at) WHERE consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS entitlement_sequences (subscription_id uuid PRIMARY KEY REFERENCES subscriptions(id),sequence bigint NOT NULL CHECK(sequence > 0));
CREATE TABLE IF NOT EXISTS entitlements (id uuid PRIMARY KEY,subscription_id uuid NOT NULL REFERENCES subscriptions(id),installation_id uuid NOT NULL REFERENCES installations(id),edition text NOT NULL,valid_from timestamptz NOT NULL,valid_until timestamptz NOT NULL,server_sequence bigint NOT NULL,signed_payload_hash text NOT NULL,key_id text NOT NULL,created_at timestamptz NOT NULL,UNIQUE(subscription_id,server_sequence));
COMMIT;
