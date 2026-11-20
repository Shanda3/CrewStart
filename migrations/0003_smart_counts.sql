-- Daily counters for optional Smart AI suggestions.
-- smart_email_counts.key is SHA-256(RATE_LIMIT_SALT + '|smart-email|' + email);
-- raw emails are never stored here. Counters are deleted after about 2 days.
CREATE TABLE IF NOT EXISTS smart_email_counts (
  key        TEXT    PRIMARY KEY,
  day        TEXT    NOT NULL,              -- UTC date YYYY-MM-DD
  count      INTEGER NOT NULL,
  created_at TEXT    NOT NULL               -- ISO 8601 UTC
);

CREATE TABLE IF NOT EXISTS smart_global_counts (
  day        TEXT    PRIMARY KEY,           -- UTC date YYYY-MM-DD
  count      INTEGER NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_smart_email_day ON smart_email_counts(day);
