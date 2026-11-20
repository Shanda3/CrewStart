-- Crewstart opt-in email list. Only people who tick the consent box are stored.
CREATE TABLE IF NOT EXISTS subscribers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT    NOT NULL UNIQUE,          -- trimmed + lowercased
  first_name      TEXT,                              -- optional
  role            TEXT,                              -- only if the separate share box was ticked
  industry        TEXT,                              -- only if the separate share box was ticked
  consent_text    TEXT    NOT NULL,                  -- exact wording agreed to
  consent_version TEXT    NOT NULL,
  source          TEXT    NOT NULL DEFAULT 'crewstart',
  created_at      TEXT    NOT NULL                   -- ISO 8601 UTC
);

-- Fixed-window rate limiting by hashed IP (raw IPs are never stored).
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT    PRIMARY KEY,                  -- SHA-256(salt + ip)
  window_start INTEGER NOT NULL,                     -- unix seconds
  count        INTEGER NOT NULL
);
