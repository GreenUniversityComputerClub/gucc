-- Email is opt-in (2026-09-30); authorization rules are cached safely and sponsorship pages are
-- managed from the dashboard (2026-10-01). Additive only: one defaulted column, new tables, their
-- triggers and indexes.
--
--   * users.security_emails   the member chose to get security alerts (a sign-in from a new
--                             device, a locked account, password or email changes) by email.
--                             Every notification email is off until its owner turns it on; the
--                             other choices stay in notification_preferences, whose category
--                             CHECK predates this one (changing a CHECK means rebuilding the table).
ALTER TABLE users ADD COLUMN security_emails INTEGER NOT NULL DEFAULT 0 CHECK (security_emails IN (0, 1));

-- Authorization rules are read on every signed-in request but change rarely (2026-10-01).
--
--   * cache_stamps   a counter per cached thing. Every change to the rules, their actions and
--                    conditions, or the approval policies they name bumps 'rules' in the same
--                    transaction (the triggers below), so a Worker may keep the rules it read until
--                    the counter moves: one indexed row per request instead of every rule.
CREATE TABLE IF NOT EXISTS cache_stamps (
  key   TEXT PRIMARY KEY,
  stamp INTEGER NOT NULL DEFAULT 0
);
INSERT INTO cache_stamps (key, stamp) VALUES ('rules', 0) ON CONFLICT(key) DO NOTHING;
CREATE TRIGGER IF NOT EXISTS rules_stamp_insert AFTER INSERT ON rules BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rules_stamp_update AFTER UPDATE ON rules BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rules_stamp_delete AFTER DELETE ON rules BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_actions_stamp_insert AFTER INSERT ON rule_actions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_actions_stamp_update AFTER UPDATE ON rule_actions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_actions_stamp_delete AFTER DELETE ON rule_actions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_conditions_stamp_insert AFTER INSERT ON rule_conditions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_conditions_stamp_update AFTER UPDATE ON rule_conditions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS rule_conditions_stamp_delete AFTER DELETE ON rule_conditions BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS approval_policies_stamp_insert AFTER INSERT ON approval_policies BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS approval_policies_stamp_update AFTER UPDATE ON approval_policies BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;
CREATE TRIGGER IF NOT EXISTS approval_policies_stamp_delete AFTER DELETE ON approval_policies BEGIN UPDATE cache_stamps SET stamp = stamp + 1 WHERE key = 'rules'; END;

-- A person's published posts, found by their profile (their member page lists them; a profile
-- save checks whether the blog shows them before refreshing it).
CREATE INDEX IF NOT EXISTS posts_author_profile_idx ON posts(author_profile_id) WHERE author_profile_id IS NOT NULL;

-- Sponsorship pages (2026-10-01). Any number of them, each at /sponsors/<slug>; /become-a-sponsor
-- lists the active ones. The dashboard picks the default (the navbar's Sponsors link opens it);
-- changing it never deactivates or removes the others. The CSE Carnival page, which lived in the
-- organisation setting 'page.sponsorship', is copied in as the first page and the default.
CREATE TABLE IF NOT EXISTS sponsorship_pages (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT,
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  is_default   INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_by   TEXT REFERENCES users(id),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by   TEXT REFERENCES users(id),
  deleted_at   TEXT,
  -- The default is always an active page.
  CHECK (is_default = 0 OR status = 'ACTIVE')
);
CREATE UNIQUE INDEX IF NOT EXISTS sponsorship_pages_slug_uq ON sponsorship_pages(slug) WHERE deleted_at IS NULL;
-- At most one default.
CREATE UNIQUE INDEX IF NOT EXISTS sponsorship_pages_default_uq ON sponsorship_pages(is_default) WHERE is_default = 1 AND deleted_at IS NULL;
INSERT INTO sponsorship_pages (id, slug, title, summary, status, is_default, sort_order, content_json)
SELECT 'spn_cse_carnival_2026', 'cse-carnival-2026', COALESCE(json_extract(value_json, '$.event.fullName'), 'CSE Carnival 2026'),
       'Sponsor the CSE Carnival: IUPC, CTF, ICT Olympiad and Math Olympiad, with workshops, industry sessions and awards.',
       'ACTIVE', 1, 0, value_json
FROM organization_settings WHERE key = 'page.sponsorship' AND json_valid(value_json)
ON CONFLICT DO NOTHING;

-- The general page (2026-10-01): a year-round partnership with the club, named after no event, to
-- approach any company. Active, not the default. Its achievements, previous partners and contacts
-- are the Carnival page's. Generated from lib/sponsorship/general.ts (a test keeps them equal).
INSERT INTO sponsorship_pages (id, slug, title, summary, status, is_default, sort_order, content_json)
SELECT 'spn_gucc_partnership', 'partner-with-gucc', 'Partner with GUCC', 'A year-round partnership with the Green University Computer Club: your brand at every contest, hackathon and workshop, and direct access to 7,000+ tech students.', 'ACTIVE', 0, 1,
       json_set(json_object('event', json('{"name":"GUCC PARTNERSHIP","fullName":"GUCC Partnership Program","tagline":"Partner with GUCC","organizer":"Green University Computer Club (GUCC)","university":"Green University of Bangladesh","website":"gucc.green.edu.bd","email":"gucc@green.edu.bd"}'), 'heroSubtitle', 'Partner with Green University Computer Club all year round — reach 7,000+ tech students through programming contests, hackathons, workshops, tech talks and career events.', 'typingPhrases', json('["Programming Contests","Hackathons","Workshops & Bootcamps","Tech Talks & Career Events"]'), 'programs', json('[{"id":"gucc-partnership","name":"Year-round Club Partnership","shortName":"Partnership","category":"Year-round Partnership","featured":true,"description":"Support GUCC''s whole calendar instead of a single event: programming contests, hackathons, workshops, tech talks and community programs across the academic year, with your brand at every one of them.","components":["Programming Contests","Hackathons","Workshops","Tech Talks","Career Events","Networking","Awards","Community Programs"],"sponsorValue":["Brand presence across every GUCC event of the year","Direct access to 7,000+ tech-focused students","Hiring and internship drives on campus","Speaking, mentoring and judging opportunities","Year-round social media and digital promotion"],"eventSlug":"","facts":[{"value":"7,000+","label":"Students reached"},{"value":"Year-round","label":"Club calendar"},{"value":"Contests","label":"& Hackathons"},{"value":"Brand","label":"Visibility"}]}]'), 'packages', json('[{"tier":"Gold Sponsor","slots":1,"price":0,"currency":"BDT","period":"per academic year","highlight":true,"benefits":["Title partner of the club for the year (\"GUCC, powered by …\")","Logo on every event''s backdrop, banners, t-shirts and certificates","A tech talk or workshop slot at every flagship event","Hiring drive on campus and access to opted-in student CVs","Judging and mentoring seats at contests and hackathons","Monthly social media features and press mentions"]},{"tier":"Silver Sponsor","slots":2,"price":0,"currency":"BDT","period":"per academic year","highlight":false,"benefits":["Logo on event banners, posters and digital campaigns","One tech talk or workshop slot during the year","A booth at one flagship event","Quarterly social media features"]},{"tier":"Bronze Sponsor","slots":4,"price":0,"currency":"BDT","period":"per academic year","highlight":false,"benefits":["Logo on digital campaigns and the club website","Social media thank-you post for each event","Invitations to the club''s award ceremonies"]}]'), 'comparisonFeatures', json('[{"feature":"Logo on every event","gold":true,"silver":true,"bronze":false},{"feature":"Social media promotion","gold":true,"silver":true,"bronze":true},{"feature":"Club website listing","gold":true,"silver":true,"bronze":true},{"feature":"Booth at flagship events","gold":true,"silver":true,"bronze":false},{"feature":"Tech talk / workshop slot","gold":true,"silver":true,"bronze":false},{"feature":"Hiring drive on campus","gold":true,"silver":false,"bronze":false},{"feature":"Judging & mentoring seats","gold":true,"silver":false,"bronze":false},{"feature":"Title partner of the year","gold":true,"silver":false,"bronze":false}]'), 'whySponsorReasons', json('[{"title":"Access Top Tech Talent","description":"Meet competitive programmers, hackathon winners and developers skilled in today''s most wanted stacks, all year.","icon":"Users"},{"title":"Year-round Visibility","description":"One partnership puts your brand on every contest, hackathon, workshop and campaign the club runs.","icon":"Megaphone"},{"title":"Recruitment Pipeline","description":"Hire interns and graduates straight from an engaged, pre-screened technical community.","icon":"Briefcase"},{"title":"Social Media Reach","description":"Featured across GUCC''s official channels, followed by thousands of students and alumni.","icon":"Share2"},{"title":"Campus Presence","description":"Booths, talks and branded merchandise put your team in front of students in person.","icon":"MapPin"},{"title":"Shape the Next Generation","description":"Mentor, judge and teach: help build the engineers your industry needs.","icon":"GraduationCap"}]'), 'otherOpportunities', json('[{"title":"Merchandise Partner","detail":"T-shirts & kits","description":"Your brand on the club''s t-shirts, ID cards and kits, worn at every event of the year.","icon":"Shirt"},{"title":"Food & Beverage Partner","detail":"Event refreshments","description":"Refreshments for participants and guests, with your brand on stalls, cups and packaging.","icon":"Utensils"},{"title":"Prize & Award Partner","detail":"Gifts and awards","description":"Your brand on the prizes, awards and souvenirs given to winners and guests.","icon":"Gift"},{"title":"Cloud & Platform Partner","detail":"In-kind / Technical","description":"Credits, hosting or tools that power the club''s contests and projects. Ideal for cloud and developer-tool companies.","icon":"Server"}]')), '$.achievements', json(COALESCE(json_extract(o.value_json, '$.achievements'), '[]')), '$.previousPartners', json(COALESCE(json_extract(o.value_json, '$.previousPartners'), '[]')), '$.contacts', json(COALESCE(json_extract(o.value_json, '$.contacts'), '[]')))
FROM organization_settings o WHERE o.key = 'page.sponsorship' AND json_valid(o.value_json)
  AND NOT EXISTS (SELECT 1 FROM sponsorship_pages WHERE slug = 'partner-with-gucc')
ON CONFLICT(id) DO NOTHING;
