-- ===========================================================================
-- RSVP60 database schema (PostgreSQL / Supabase)
-- ---------------------------------------------------------------------------
-- The FastAPI app also auto-creates these tables via SQLAlchemy on startup,
-- but this file is the canonical reference migration for a Postgres/Supabase
-- deployment. IDs are stored as 32-char hex strings (uuid4().hex) to match the
-- ORM models and stay portable with the SQLite dev database.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS events (
    id                     VARCHAR(32) PRIMARY KEY,
    name                   VARCHAR(200) NOT NULL,
    event_type             VARCHAR(50) DEFAULT 'other',   -- birthday | wedding | funeral | memorial | anniversary | church | dinner | conference | other
    host_or_celebrant_name VARCHAR(200) DEFAULT '',
    title                  VARCHAR(200) DEFAULT '',
    description            TEXT DEFAULT '',
    event_date             TIMESTAMP,
    event_time             VARCHAR(100) DEFAULT '',
    venue_name             VARCHAR(200) DEFAULT '',
    venue_address          VARCHAR(400) DEFAULT '',
    maps_url               VARCHAR(600) DEFAULT '',
    dress_code             TEXT DEFAULT '',
    gift_details           TEXT DEFAULT '',
    contact_phone          VARCHAR(50) DEFAULT '',
    flyer_url              VARCHAR(600) DEFAULT '',
    rsvp_deadline          TIMESTAMP,
    status                 VARCHAR(20) DEFAULT 'active',   -- draft | active | closed | archived
    created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admins (
    id              VARCHAR(32) PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    full_name       VARCHAR(200) DEFAULT '',
    role            VARCHAR(50) DEFAULT 'admin',
    hashed_password VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_trees (
    id               VARCHAR(32) PRIMARY KEY,
    event_id         VARCHAR(32) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name             VARCHAR(200) NOT NULL,
    token            VARCHAR(64) NOT NULL UNIQUE,
    allocated_seats  INTEGER NOT NULL DEFAULT 0,
    max_extra_guests INTEGER NOT NULL DEFAULT 0,  -- 0=no +1, 1=+1, 2=+2
    status           VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | paused
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invite_trees_token ON invite_trees(token);

CREATE TABLE IF NOT EXISTS rsvps (
    id                VARCHAR(32) PRIMARY KEY,
    event_id          VARCHAR(32) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    invite_tree_id    VARCHAR(32) NOT NULL REFERENCES invite_trees(id),
    full_name         VARCHAR(200) NOT NULL,
    phone             VARCHAR(50) NOT NULL,
    email             VARCHAR(255),
    attendance_status VARCHAR(20) NOT NULL DEFAULT 'attending',  -- attending | declined
    rsvp_status       VARCHAR(20) NOT NULL DEFAULT 'accepted',   -- accepted | declined | waitlisted | cancelled
    seats_requested   INTEGER NOT NULL DEFAULT 1,
    note_to_celebrant TEXT,
    dietary_note      TEXT,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rsvps_tree ON rsvps(invite_tree_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_phone ON rsvps(phone);
-- One RSVP per phone number per event (duplicate protection).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rsvps_event_phone ON rsvps(event_id, phone);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          VARCHAR(32) PRIMARY KEY,
    admin_id    VARCHAR(32),
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) DEFAULT '',
    entity_id   VARCHAR(32) DEFAULT '',
    metadata    TEXT DEFAULT '',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
