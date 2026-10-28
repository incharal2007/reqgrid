CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  incident_type TEXT NOT NULL CHECK (incident_type IN ('Flood','Fire','Medical','Building collapse','Road blockage','Earthquake','Other')),
  status TEXT NOT NULL DEFAULT 'Reported' CHECK (status IN ('Reported','Under review','Verified','Allocated','Responding','Resolved','Closed')),
  urgency INTEGER NOT NULL DEFAULT 5 CHECK (urgency BETWEEN 1 AND 10),
  people_affected INTEGER NOT NULL DEFAULT 1 CHECK (people_affected >= 0),
  location_label TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  source_mode TEXT NOT NULL DEFAULT 'SIMULATION' CHECK (source_mode IN ('LIVE_FEED','PROVIDER_REPORTED','USER_REPORTED','SIMULATION')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geom GEOGRAPHY(POINT,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon,lat),4326)::geography) STORED
);
CREATE INDEX IF NOT EXISTS incidents_geom_idx ON incidents USING GIST (geom);
CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status);
CREATE INDEX IF NOT EXISTS incidents_created_idx ON incidents(created_at DESC);

CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('Hospital','Shelter','NGO','Rescue team','Food and water','Ambulance','Other')),
  contact_name TEXT,
  contact_phone TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  source_mode TEXT NOT NULL DEFAULT 'SIMULATION',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geom GEOGRAPHY(POINT,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon,lat),4326)::geography) STORED
);
CREATE INDEX IF NOT EXISTS providers_geom_idx ON providers USING GIST (geom);

CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('Ambulance','Medical team','Shelter beds','Food kits','Water kits','Rescue team','Transport','Other')),
  quantity_total INTEGER NOT NULL DEFAULT 0 CHECK (quantity_total >= 0),
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0 AND quantity_available <= quantity_total),
  status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available','Partially available','Unavailable')),
  last_verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id),
  resource_id UUID NOT NULL REFERENCES resources(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'Recommended' CHECK (status IN ('Recommended','Approved','Rejected','Assigned','Accepted','En route','Arrived','Completed','Cancelled')),
  score NUMERIC(6,2),
  rationale JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
