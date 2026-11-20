-- November 20, 2026: email is now required to see the prompt (Shanda's decision).
-- Marketing consent becomes a separate, optional flag. consent_text/consent_version are set
-- only when marketing_consent = 1. Rebuilds the table (SQLite can't drop NOT NULL in place).
CREATE TABLE subscribers_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT    NOT NULL UNIQUE,          -- trimmed + lowercased
  first_name        TEXT,                              -- optional
  role              TEXT,                              -- only if the separate share box was ticked
  industry          TEXT,                              -- only if the separate share box was ticked
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
  consent_text      TEXT,                              -- exact wording agreed to (marketing only)
  consent_version   TEXT,
  source            TEXT    NOT NULL DEFAULT 'crewstart',
  created_at        TEXT    NOT NULL,                  -- ISO 8601 UTC
  consent_at        TEXT                               -- ISO 8601 UTC, when marketing consent was given
);
INSERT INTO subscribers_new (id, email, first_name, role, industry, marketing_consent, consent_text, consent_version, source, created_at, consent_at)
  SELECT id, email, first_name, role, industry, 1, consent_text, consent_version, source, created_at, created_at FROM subscribers;
DROP TABLE subscribers;
ALTER TABLE subscribers_new RENAME TO subscribers;
