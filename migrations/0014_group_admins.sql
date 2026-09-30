-- Group admins (2026-09-30). Additive only: one defaulted column.
--
--   * conversation_members.is_admin   a group member the owner (or another admin) made an admin:
--                                     they change the group's name, photo and description and add
--                                     or remove members. The owner stays role = 'OWNER'; the role
--                                     column's CHECK (OWNER, MEMBER) is left as it is, since
--                                     changing a CHECK means rebuilding the table.
ALTER TABLE conversation_members ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1));
