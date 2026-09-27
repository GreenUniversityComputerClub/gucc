-- 0005 · Platform v3 schema: optional Google Form registration for events, contests linked
-- to their event, recruitment reviewer assignment with a note history, and internal review
-- notes on member accounts. Additive only: no existing column or row changes.

-- Events can collect registrations through an external form (Google Forms) instead of,
-- or besides, the built-in registration.
ALTER TABLE events ADD COLUMN registration_form_url TEXT;
ALTER TABLE events ADD COLUMN registration_form_label TEXT;

-- A contest can point at the event that ran it (registrations, gallery, coordinators).
ALTER TABLE contests ADD COLUMN event_id TEXT REFERENCES events(id);
CREATE INDEX contests_event_idx ON contests(event_id) WHERE event_id IS NOT NULL;

-- Recruitment: who reviews an application, and every note left on it.
ALTER TABLE recruitment_applications ADD COLUMN assigned_to TEXT REFERENCES users(id);
CREATE INDEX recruitment_applications_assigned_idx ON recruitment_applications(assigned_to, status) WHERE assigned_to IS NOT NULL;

CREATE TABLE recruitment_notes (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  author_id      TEXT REFERENCES users(id),
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX recruitment_notes_application_idx ON recruitment_notes(application_id, created_at);

-- Member review: an internal note for reviewers (never shown to the member).
ALTER TABLE users ADD COLUMN review_note TEXT;
