BEGIN;

CREATE TABLE beta_access (
  id uuid PRIMARY KEY,
  invite_code_hash text NOT NULL UNIQUE,
  invited_email text NOT NULL,
  status text NOT NULL CHECK(status IN('INVITED','ACTIVE','SUSPENDED','CONVERTED','CLOSED')),
  customer_id uuid REFERENCES customers(id),
  installation_id uuid REFERENCES installations(id),
  admitted_at timestamptz NOT NULL,
  activated_at timestamptz,
  client_version text,
  last_activity_at timestamptz,
  admin_notes text,
  sequence bigint NOT NULL DEFAULT 0 CHECK(sequence >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX beta_access_customer_idx ON beta_access(customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX beta_access_installation_idx ON beta_access(installation_id) WHERE installation_id IS NOT NULL;
CREATE INDEX beta_access_status_idx ON beta_access(status,admitted_at);

CREATE TABLE beta_entitlements (
  id uuid PRIMARY KEY,
  beta_access_id uuid NOT NULL REFERENCES beta_access(id),
  installation_id uuid NOT NULL REFERENCES installations(id),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  server_sequence bigint NOT NULL,
  signed_payload_hash text NOT NULL,
  key_id text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(beta_access_id,server_sequence)
);

COMMIT;
