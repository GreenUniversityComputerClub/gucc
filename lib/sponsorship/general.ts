/**
 * The general sponsorship page ("Partner with GUCC"): a year-round partnership with the club,
 * named after no event, to approach any company. Its club-level parts (achievements, previous
 * partners, contacts) come from the CSE Carnival page's content when it's created, so they match
 * what the club already shows. Packages are "on request" (price 0): agreed with each partner.
 *
 * Created by migration 0015 and by the legacy import, both from generalSponsorshipSql();
 * tests/unit/general-sponsorship.test.ts checks the migration still matches this file.
 */
export const GENERAL_SPONSORSHIP = {
  id: "spn_gucc_partnership",
  slug: "partner-with-gucc",
  title: "Partner with GUCC",
  summary: "A year-round partnership with the Green University Computer Club: your brand at every contest, hackathon and workshop, and direct access to 7,000+ tech students.",
  sortOrder: 1,
  content: {
    event: {
      name: "GUCC PARTNERSHIP",
      fullName: "GUCC Partnership Program",
      tagline: "Partner with GUCC",
      organizer: "Green University Computer Club (GUCC)",
      university: "Green University of Bangladesh",
      website: "gucc.green.edu.bd",
      email: "gucc@green.edu.bd",
    },
    heroSubtitle: "Partner with Green University Computer Club all year round — reach 7,000+ tech students through programming contests, hackathons, workshops, tech talks and career events.",
    typingPhrases: ["Programming Contests", "Hackathons", "Workshops & Bootcamps", "Tech Talks & Career Events"],
    programs: [{
      id: "gucc-partnership",
      name: "Year-round Club Partnership",
      shortName: "Partnership",
      category: "Year-round Partnership",
      featured: true,
      description: "Support GUCC's whole calendar instead of a single event: programming contests, hackathons, workshops, tech talks and community programs across the academic year, with your brand at every one of them.",
      components: ["Programming Contests", "Hackathons", "Workshops", "Tech Talks", "Career Events", "Networking", "Awards", "Community Programs"],
      sponsorValue: [
        "Brand presence across every GUCC event of the year",
        "Direct access to 7,000+ tech-focused students",
        "Hiring and internship drives on campus",
        "Speaking, mentoring and judging opportunities",
        "Year-round social media and digital promotion",
      ],
      eventSlug: "",
      facts: [
        { value: "7,000+", label: "Students reached" },
        { value: "Year-round", label: "Club calendar" },
        { value: "Contests", label: "& Hackathons" },
        { value: "Brand", label: "Visibility" },
      ],
    }],
    packages: [
      {
        tier: "Gold Sponsor", slots: 1, price: 0, currency: "BDT", period: "per academic year", highlight: true,
        benefits: [
          "Title partner of the club for the year (\"GUCC, powered by …\")",
          "Logo on every event's backdrop, banners, t-shirts and certificates",
          "A tech talk or workshop slot at every flagship event",
          "Hiring drive on campus and access to opted-in student CVs",
          "Judging and mentoring seats at contests and hackathons",
          "Monthly social media features and press mentions",
        ],
      },
      {
        tier: "Silver Sponsor", slots: 2, price: 0, currency: "BDT", period: "per academic year", highlight: false,
        benefits: [
          "Logo on event banners, posters and digital campaigns",
          "One tech talk or workshop slot during the year",
          "A booth at one flagship event",
          "Quarterly social media features",
        ],
      },
      {
        tier: "Bronze Sponsor", slots: 4, price: 0, currency: "BDT", period: "per academic year", highlight: false,
        benefits: [
          "Logo on digital campaigns and the club website",
          "Social media thank-you post for each event",
          "Invitations to the club's award ceremonies",
        ],
      },
    ],
    comparisonFeatures: [
      { feature: "Logo on every event", gold: true, silver: true, bronze: false },
      { feature: "Social media promotion", gold: true, silver: true, bronze: true },
      { feature: "Club website listing", gold: true, silver: true, bronze: true },
      { feature: "Booth at flagship events", gold: true, silver: true, bronze: false },
      { feature: "Tech talk / workshop slot", gold: true, silver: true, bronze: false },
      { feature: "Hiring drive on campus", gold: true, silver: false, bronze: false },
      { feature: "Judging & mentoring seats", gold: true, silver: false, bronze: false },
      { feature: "Title partner of the year", gold: true, silver: false, bronze: false },
    ],
    whySponsorReasons: [
      { title: "Access Top Tech Talent", description: "Meet competitive programmers, hackathon winners and developers skilled in today's most wanted stacks, all year.", icon: "Users" },
      { title: "Year-round Visibility", description: "One partnership puts your brand on every contest, hackathon, workshop and campaign the club runs.", icon: "Megaphone" },
      { title: "Recruitment Pipeline", description: "Hire interns and graduates straight from an engaged, pre-screened technical community.", icon: "Briefcase" },
      { title: "Social Media Reach", description: "Featured across GUCC's official channels, followed by thousands of students and alumni.", icon: "Share2" },
      { title: "Campus Presence", description: "Booths, talks and branded merchandise put your team in front of students in person.", icon: "MapPin" },
      { title: "Shape the Next Generation", description: "Mentor, judge and teach: help build the engineers your industry needs.", icon: "GraduationCap" },
    ],
    otherOpportunities: [
      { title: "Merchandise Partner", detail: "T-shirts & kits", description: "Your brand on the club's t-shirts, ID cards and kits, worn at every event of the year.", icon: "Shirt" },
      { title: "Food & Beverage Partner", detail: "Event refreshments", description: "Refreshments for participants and guests, with your brand on stalls, cups and packaging.", icon: "Utensils" },
      { title: "Prize & Award Partner", detail: "Gifts and awards", description: "Your brand on the prizes, awards and souvenirs given to winners and guests.", icon: "Gift" },
      { title: "Cloud & Platform Partner", detail: "In-kind / Technical", description: "Credits, hosting or tools that power the club's contests and projects. Ideal for cloud and developer-tool companies.", icon: "Server" },
    ],
  },
} as const;

/** The statement that creates the page (if missing), taking the club-level parts from the Carnival page. */
export function generalSponsorshipSql(): string {
  const c = GENERAL_SPONSORSHIP.content;
  const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  const s = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const own = `json_object('event', json(${q(c.event)}), 'heroSubtitle', ${s(c.heroSubtitle)}, 'typingPhrases', json(${q(c.typingPhrases)}), 'programs', json(${q(c.programs)}), 'packages', json(${q(c.packages)}), 'comparisonFeatures', json(${q(c.comparisonFeatures)}), 'whySponsorReasons', json(${q(c.whySponsorReasons)}), 'otherOpportunities', json(${q(c.otherOpportunities)}))`;
  const club = (key: string) => `'$.${key}', json(COALESCE(json_extract(o.value_json, '$.${key}'), '[]'))`;
  return `INSERT INTO sponsorship_pages (id, slug, title, summary, status, is_default, sort_order, content_json)
SELECT ${s(GENERAL_SPONSORSHIP.id)}, ${s(GENERAL_SPONSORSHIP.slug)}, ${s(GENERAL_SPONSORSHIP.title)}, ${s(GENERAL_SPONSORSHIP.summary)}, 'ACTIVE', 0, ${GENERAL_SPONSORSHIP.sortOrder},
       json_set(${own}, ${club("achievements")}, ${club("previousPartners")}, ${club("contacts")})
FROM organization_settings o WHERE o.key = 'page.sponsorship' AND json_valid(o.value_json)
  AND NOT EXISTS (SELECT 1 FROM sponsorship_pages WHERE slug = ${s(GENERAL_SPONSORSHIP.slug)})
ON CONFLICT(id) DO NOTHING;`;
}
