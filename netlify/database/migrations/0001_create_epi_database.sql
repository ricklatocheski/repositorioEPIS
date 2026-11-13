CREATE TABLE epi_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE epi_audit (
  revision integer PRIMARY KEY,
  request_id uuid UNIQUE NOT NULL,
  operation varchar(20) NOT NULL,
  state_hash varchar(64) NOT NULL,
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Read-only views expose each business collection for reporting/maintenance.
-- A single revisioned aggregate keeps stock + loans + returns atomic.
CREATE VIEW epi_stock AS
SELECT item->>'nome' AS name, item AS record
FROM epi_state, jsonb_array_elements(payload->'stock') AS item;

CREATE VIEW epi_loans AS
SELECT (item->>'id')::integer AS id, item->>'grupo' AS protocol,
       item->>'motorista' AS driver, item->>'placa' AS plate, item AS record
FROM epi_state, jsonb_array_elements(payload->'loans') AS item;

CREATE VIEW epi_carriers AS
SELECT item->>'id' AS id, item->>'name' AS name, item AS record
FROM epi_state, jsonb_array_elements(payload->'registries'->'transportadoras') AS item;

CREATE VIEW epi_drivers AS
SELECT item->>'id' AS id, item->>'name' AS name, item AS record
FROM epi_state, jsonb_array_elements(payload->'registries'->'motoristas') AS item;

CREATE VIEW epi_vehicles AS
SELECT item->>'id' AS id, item->>'name' AS plate, item AS record
FROM epi_state, jsonb_array_elements(payload->'registries'->'veiculos') AS item;
