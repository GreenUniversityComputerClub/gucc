-- Contact topic (2026-09-30, with round 8). Additive only: one nullable column.
--
--   * contact_messages.topic   what a visitor's message is about (general, membership, events,
--                              partnership, website), chosen on the contact form so the inbox can
--                              be sorted at a glance; older messages have none. The allowed values
--                              are checked by the service (lib/server/services/contact.ts).
ALTER TABLE contact_messages ADD COLUMN topic TEXT;
