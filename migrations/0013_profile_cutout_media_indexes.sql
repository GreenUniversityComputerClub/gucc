-- Profile cut-out and media-use indexes (2026-09-30, with round 8). Additive only.
--
--   * profiles.cutout_media_id   the member's photo with its background removed (transparent),
--                                made in their browser when they choose a new backdrop for their
--                                profile photo. The executives list shows it floating on the card,
--                                like the club's own cut-out portraits; everywhere else shows the
--                                round photo (avatar_media_id). Cleared whenever the photo changes
--                                without one.
--   * media-use indexes          "is this file used anywhere?" (the media library's counts, the
--                                daily clean-up of unused uploads) looked through every profile,
--                                listing, event, post and link table for each file. Small partial
--                                indexes (only rows that have a file) make each look a single
--                                search, at almost no cost to writes.
ALTER TABLE profiles ADD COLUMN cutout_media_id TEXT REFERENCES media(id);

CREATE INDEX profiles_avatar_media_idx ON profiles(avatar_media_id) WHERE avatar_media_id IS NOT NULL;
CREATE INDEX profiles_cutout_media_idx ON profiles(cutout_media_id) WHERE cutout_media_id IS NOT NULL;
CREATE INDEX committee_members_avatar_media_idx ON committee_members(avatar_media_id) WHERE avatar_media_id IS NOT NULL;
CREATE INDEX events_banner_media_idx ON events(banner_media_id) WHERE banner_media_id IS NOT NULL;
CREATE INDEX event_media_media_idx ON event_media(media_id);
CREATE INDEX posts_featured_media_idx ON posts(featured_media_id) WHERE featured_media_id IS NOT NULL;
CREATE INDEX contest_media_media_idx ON contest_media(media_id);
CREATE INDEX lost_found_posts_image_media_idx ON lost_found_posts(image_media_id) WHERE image_media_id IS NOT NULL;
CREATE INDEX chat_groups_photo_media_idx ON chat_groups(photo_media_id) WHERE photo_media_id IS NOT NULL;
CREATE INDEX recruitment_applications_cv_media_idx ON recruitment_applications(cv_media_id) WHERE cv_media_id IS NOT NULL;
CREATE INDEX recruitment_applications_photo_media_idx ON recruitment_applications(photo_media_id) WHERE photo_media_id IS NOT NULL;
CREATE INDEX recruitment_applications_id_card_media_idx ON recruitment_applications(id_card_media_id) WHERE id_card_media_id IS NOT NULL;
