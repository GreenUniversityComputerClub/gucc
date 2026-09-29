# Legacy data migration report

Run `run_2026-09-29T17-53-00-300Z_e1133b2d` · 2026-09-29T17:53:00.300Z · target **local** · mode insert-missing

Private values (phone numbers, participant emails) are masked in this report. The generated SQL and the source backup
(`migration/backup/2026-09-29T17-53-00-300Z`) contain them and are git-ignored.

## Summary

| Entity                 | Source | Migrated | Merged | Skipped | Failed | Duplicates | Conflicts |
| ---------------------- | ------ | -------- | ------ | ------- | ------ | ---------- | --------- |
| media                  | 268    | 268      | 0      | 0       | 0      | 0          | 0         |
| profiles               | 224    | 224      | 0      | 0       | 0      | 0          | 57        |
| executive_assignments  | 334    | 334      | 0      | 0       | 0      | 0          | 0         |
| committees             | 10     | 10       | 0      | 0       | 0      | 0          | 0         |
| events                 | 81     | 81       | 0      | 0       | 0      | 0          | 2         |
| categories             | 0      | 33       | 0      | 0       | 0      | 0          | 0         |
| contests               | 23     | 23       | 0      | 0       | 0      | 0          | 0         |
| posts                  | 1      | 1        | 0      | 0       | 0      | 0          | 0         |
| external_forms         | 7      | 7        | 0      | 0       | 0      | 0          | 0         |
| certificate_recipients | 146    | 146      | 0      | 0       | 0      | 0          | 0         |
| organization_settings  | 5      | 5        | 0      | 0       | 0      | 0          | 0         |
| positions              | 0      | 0        | 0      | 0       | 0      | 0          | 0         |

Merged means the record was folded into another one (reason listed under duplicates). Every source record is accounted for:
source = migrated + merged + skipped + failed.

## Source inventory

| Source                                                                                                    | Records              |
| --------------------------------------------------------------------------------------------------------- | -------------------- |
| data/executives.json                                                                                      | 10 committee years   |
| data/events.json                                                                                          | 81 events            |
| data/contests.json                                                                                        | 23 contests          |
| data/forms.json                                                                                           | 7 forms              |
| data/hacktheaiteam.json                                                                                   | 50 teams             |
| app/blog custom posts                                                                                     | 1 post               |
| data/sponsors.json, data/predefined.json, data/collaborations.ts, lib/lost-found/config.ts, partner clubs | 5 settings documents |
| public/ media                                                                                             | 268 files, 42.7 MB   |

### Sources not migrated automatically

| Source                                             | Why                                                                                                  | What to do                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Supabase (accounts, lost & found posts, storage)   | Out of scope by decision: only data kept in this repository is migrated.                             | Accounts are created fresh by registering on the new site; the lost & found board starts empty. |
| Hashnode blog posts                                | Out of scope by decision (external; the old site did not show them because HASHNODE_HOST was unset). | None.                                                                                           |
| data/contributors.ts                               | Application configuration (a fallback for the GitHub contributors API), not club data.               | Kept in code.                                                                                   |
| Social links, site name, address (lib/seo/site.ts) | Site configuration used for SEO metadata.                                                            | Kept in code.                                                                                   |

## Source → target mapping

| Source                                                                       | Target                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| data/executives.json (committee years)                                       | committees (layout_json keeps campus/wing structure)                                 |
| data/executives.json (people)                                                | profiles (one per person: student ID, else faculty/name identity)                    |
| data/executives.json (listings)                                              | committee_members → positions (legacy title kept in position_title)                  |
| data/executives.json (avatarUrl, avatarPosition, avatarScale)                | media + per-term crop on committee_members                                           |
| data/events.json                                                             | events, categories(kind=EVENT), event_people (guests, judges), event_media (banner)  |
| data/contests.json                                                           | contests, contest_teams, contest_media                                               |
| app/blog custom posts                                                        | posts, categories(kind=POST), tags, post_tags, post_revisions                        |
| data/forms.json                                                              | external_forms                                                                       |
| data/hacktheaiteam.json                                                      | certificate_programs, certificate_recipients (private)                               |
| data/sponsors.json                                                           | organization_settings[page.sponsorship]                                              |
| data/predefined.json                                                         | organization_settings[chatbot.knowledge]                                             |
| data/collaborations.ts                                                       | organization_settings[legacy.featured_collaborations]                                |
| partner clubs (collaboration-scroll.tsx, collaborations/page.tsx)            | organization_settings[page.collaborations]                                           |
| lib/lost-found/config.ts                                                     | organization_settings[lostfound.config]; adminEmails → lostfound.moderate permission |
| public/{events,executives,contests,blog,collaborators,sponsors,certificates} | media (storage=STATIC until scripts/platform/media.ts moves them to R2)              |

## Position title mapping

Legacy titles are kept verbatim for display; the mapping only decides which configurable position (and so which default permissions) an assignment carries.

| Legacy title                                      | Position                             | Matched by | Listings |
| ------------------------------------------------- | ------------------------------------ | ---------- | -------- |
| Blue Team Secretary                               | blue-team-secretary                  | name       | 1        |
| Chair                                             | chair                                | name       | 3        |
| Content Writer                                    | content-writer                       | name       | 1        |
| CTF Secretary                                     | ctf-secretary                        | name       | 1        |
| Cultural Secretary                                | cultural-secretary                   | name       | 11       |
| Deputy Moderator                                  | deputy-moderator                     | name       | 22       |
| E-Sports Gaming Secretary                         | esports-secretary                    | alias      | 1        |
| Esports Secretary                                 | esports-secretary                    | alias      | 1        |
| Event Coordinator                                 | event-coordinator                    | name       | 4        |
| Executive Member                                  | executive-member                     | name       | 12       |
| Executive Member – 1                              | executive-member                     | pattern    | 1        |
| Executive Member – 2                              | executive-member                     | pattern    | 1        |
| Executive Member-1                                | executive-member                     | pattern    | 3        |
| Executive Member-2                                | executive-member                     | pattern    | 3        |
| Executive Member-3                                | executive-member                     | pattern    | 2        |
| Executive Member-4                                | executive-member                     | pattern    | 2        |
| Executive Member-5                                | executive-member                     | pattern    | 1        |
| Executive Member-6                                | executive-member                     | pattern    | 1        |
| Executive Member-7                                | executive-member                     | pattern    | 1        |
| Former Deputy Moderator                           | former-deputy-moderator              | name       | 1        |
| General Secretary                                 | general-secretary                    | name       | 15       |
| Assistant Graphics Designer                       | graphics-designer                    | alias      | 1        |
| Graphic Designer                                  | graphics-designer                    | alias      | 1        |
| Graphics Designer                                 | graphics-designer                    | name       | 3        |
| Graphics and Multimedia Coordinator               | graphics-multimedia-coordinator      | alias      | 3        |
| Graphics and Multimedia Coordinators              | graphics-multimedia-coordinator      | alias      | 3        |
| Graphics and Multimedia Coordinators -1           | graphics-multimedia-coordinator      | pattern    | 1        |
| Graphics and Multimedia Coordinators -2           | graphics-multimedia-coordinator      | pattern    | 1        |
| Graphics and Multimedia Secretary                 | graphics-multimedia-coordinator      | alias      | 4        |
| Graphics and Multimedia Coordinators (Lead)       | graphics-multimedia-coordinator-lead | alias      | 1        |
| Information Secretary                             | information-secretary                | name       | 12       |
| Deputy Cultural Secretary                         | joint-cultural-secretary             | alias      | 1        |
| Joint Cultural Secretary                          | joint-cultural-secretary             | name       | 8        |
| Assistant General Secretary                       | joint-general-secretary              | alias      | 1        |
| Joint General Secretary                           | joint-general-secretary              | name       | 9        |
| Joint General Secretary (Activity)                | joint-general-secretary-activity     | name       | 3        |
| Joint General Secretary (Technical)               | joint-general-secretary-technical    | name       | 3        |
| Deputy Information Secretary                      | joint-information-secretary          | alias      | 1        |
| Joint Information Secretary                       | joint-information-secretary          | name       | 11       |
| Deputy Organization Secretary                     | joint-organizing-secretary           | alias      | 1        |
| Joint Organizing Secretary                        | joint-organizing-secretary           | name       | 12       |
| Deputy Programming Secretary                      | joint-programming-secretary          | alias      | 1        |
| Joint Programming Secretary                       | joint-programming-secretary          | name       | 8        |
| Deputy Publication Secretary                      | joint-publication-secretary          | alias      | 1        |
| Joint Publication Secretary                       | joint-publication-secretary          | name       | 11       |
| Deputy Sports Secretary                           | joint-sports-secretary               | alias      | 1        |
| Joint Sports Secretary                            | joint-sports-secretary               | name       | 5        |
| Deputy Treasurer                                  | joint-treasurer                      | alias      | 1        |
| Joint Treasurer                                   | joint-treasurer                      | name       | 11       |
| Media Production Coordinator                      | media-production-coordinator         | name       | 1        |
| Moderator                                         | moderator                            | name       | 15       |
| Office Secretary                                  | office-secretary                     | name       | 1        |
| Office Secretary & Graphic Designer               | office-secretary                     | alias      | 1        |
| Organization Secretary                            | organizing-secretary                 | alias      | 1        |
| Organizing Secretary                              | organizing-secretary                 | name       | 14       |
| Outreach Secretary                                | outreach-secretary                   | name       | 4        |
| Photography Secretary                             | photography-secretary                | name       | 2        |
| President                                         | president                            | name       | 12       |
| Programming and Development Secretary             | programming-secretary                | alias      | 1        |
| Programming Secretary                             | programming-secretary                | name       | 11       |
| Programming and Development Secretary (Activity)  | programming-secretary-activity       | alias      | 1        |
| Programming Secretary (Activity)                  | programming-secretary-activity       | name       | 1        |
| Programming and Development Secretary (Technical) | programming-secretary-technical      | alias      | 1        |
| Programming Secretary (Technical)                 | programming-secretary-technical      | name       | 1        |
| Publication & Publicity Secretary                 | publication-secretary                | alias      | 1        |
| Publication Secretary                             | publication-secretary                | name       | 12       |
| Red Team Secretary                                | red-team-secretary                   | name       | 1        |
| Sports Secretary                                  | sports-secretary                     | name       | 10       |
| Treasurer                                         | treasurer                            | name       | 15       |
| Vice Chair                                        | vice-chair                           | alias      | 1        |
| Vice-Chair                                        | vice-chair                           | name       | 2        |
| Vice President                                    | vice-president                       | alias      | 4        |
| Vice-President                                    | vice-president                       | name       | 4        |
| Vice President (Activities)                       | vice-president-activities            | alias      | 1        |
| Vice President (Activity)                         | vice-president-activities            | alias      | 3        |
| Vice-President (Activity)                         | vice-president-activities            | alias      | 1        |
| Vice President (Technical)                        | vice-president-technical             | alias      | 4        |
| Vice-President (Technical)                        | vice-president-technical             | name       | 1        |

## Conflicts (59)

- **profiles · sid:151002009** — field: student*id_shared; owner: Abdullah Al Mashuk (2016); others: S.M. Emon (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:141002029** — field: student*id_shared; owner: Saleh Al Hasan (2016); others: Bulbul Ahmed (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:143002037** — field: student*id_shared; owner: Md. Asif Bashar (2016); others: Mostafiz Babu (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:143002026** — field: student*id_shared; owner: A.K.M. Ashek Farahi (2016); others: Arafat Hossain Rana (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:151002010** — field: student*id_shared; owner: Bulbul Ahmed (2016); others: Tamim Hossain (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:151002022** — field: student*id_shared; owner: S.M EMON (2016); others: Kaushik Ahmed Apu (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:153002007** — field: student*id_shared; owner: Shah Adil (2016); others: Razibur Rahman (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:151002017** — field: student*id_shared; owner: Muhammad Tareq Hossain (2016); others: Gulzar Hossain (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:151002096** — field: student*id_shared; owner: Gulzar Hossain (2016); others: Md. Khaled (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:162002013** — field: student*id_shared; owner: Tamim Hossen (2016, 2019); others: Angshu Adhikary (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:162002004** — field: student*id_shared; owner: Omar Faruk (2016); others: Rushmita Halim (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:161002026** — field: student*id_shared; owner: Angshu Adhikary (2016); others: Omar Faruk (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:161002019** — field: student*id_shared; owner: Arnob Mirza (2016, 2019); others: Md. Miraz (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:161002080** — field: student*id_shared; owner: Sajjad Sobuj (2016); others: Ashfaqur Rahman (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:162002001** — field: student*id_shared; owner: Rajibul Palas (2016, 2019); others: Munibul Islam (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:161002032** — field: student*id_shared; owner: Kaushik Ahmed Apu (2016, 2019); others: Sajjad Sobuj (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:161002043** — field: student*id_shared; owner: Arafat Hossain Rana (2016, 2019); others: Roman (2018). \_One student ID is listed for different people. They are kept as separate profiles; the ID (and its /executives/<id> page) stays with the person listed most often, earliest on ties. The others keep their committee listings but have no profile link until an administrator confirms their real ID.*
- **profiles · sid:161002019** — field: full*name; chosen: Mirza Saifullah Zaman Arnob; alternatives: Arnob Mirza; years: 2016, 2019. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:162002001** — field: full*name; chosen: Md. Rajibul Palas; alternatives: Rajibul Palas; years: 2016, 2019. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:161002043** — field: full*name; chosen: Md. Arafat Hossen; alternatives: Arafat Hossain Rana; years: 2016, 2019. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · faculty:ahmed iqbal pritom** — field: designation; chosen: Sr. Lecturer; alternatives: Lecturer, Senior Lecturer; years: 2018, 2019, 2020, 2021, 2022. _Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json._
- **profiles · sid:193015047** — field: full*name; chosen: MD Mohtamim Islam Nayeem; alternatives: Md. Mohtamim Islam Nayeem; years: 2020, 2021, 2022. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:183002076** — field: full*name; chosen: Md. Zahidul Hasan; alternatives: Md Zahidul Hasan, MD Zahidul Hasan; years: 2020, 2021, 2022. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:191002281** — field: full*name; chosen: Md. Iqbal Jahan; alternatives: Md.Iqbal Jahan, MD. Iqbal Jahan; years: 2020, 2021, 2022. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:173002044** — field: full*name; chosen: MD. Nasir Hossain Hridoy; alternatives: Md. Nasir Hossain Hridoy; years: 2020, 2021. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:191002067** — field: full*name; chosen: Md. Rahul Reza; alternatives: MD. Rahul Reza; years: 2020, 2021, 2022. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:201002463** — field: full*name; chosen: Md. Jahid Hassan; alternatives: MD. Jahid Hassan; years: 2020, 2021, 2022, 2023. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:201002311** — field: full*name; chosen: Sakhawat Hossain Rabbi; alternatives: MD Sakhawat Hossain Rabbi; years: 2020, 2021, 2022, 2023. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:201902145** — field: full*name; chosen: Abdullah al kafi; alternatives: Abdullah Al Kafi; years: 2022, 2023. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · faculty:md abu rumman refat** — field: designation; chosen: Lecturer; alternatives: Lecturer, CSE; years: 2023, 2023. _Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json._
- **profiles · sid:221902188** — field: public*email; chosen: mailto::mermaidriyahasan188@gmail.com; alternatives: riyahasan6754@gmail.com; years: 2023, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:221902084** — field: public*email; chosen: mailto::tanveer.cse69@gmail.com; alternatives: tanveer.cse69@gmail.com; years: 2023, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · faculty:md monirul islam** — field: designation; chosen: Assistant Professor; alternatives: Lecturer; years: 2023, 2024, 2024, 2025, 2025, 2026, 2026. _Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json._
- **profiles · sid:222002062** — field: full*name; chosen: M. Tahsinur Rahman; alternatives: M. Tahsinur Rahiman; years: 2024, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:222002062** — field: linkedin*url; chosen: https://www.linkedin.com/in/m-tahsinur-rahman62/; alternatives: https://www.linkedin.com/in/m-tahsinur-rahman62; years: 2024, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:222002062** — field: github*url; chosen: https://github.com/Aruuu62/; alternatives: https://github.com/Aruuu62; years: 2024, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:222002062** — field: facebook*url; chosen: https://www.facebook.com/iqbal.abdullah.3572; alternatives: https://m.facebook.com/iqbal.abdullah.3572/; years: 2024, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:221902015** — field: linkedin*url; chosen: https://www.linkedin.com/in/heaven-bawm-4a79a1295?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app; alternatives: https://www.linkedin.com/in/heaven-bawm-4a79a1295; years: 2024, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:221902015** — field: facebook*url; chosen: https://www.facebook.com/share/1JnVDFQ5ab/; alternatives: https://www.facebook.com/share/1G7uEH4JYD/; years: 2024, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:222002112** — field: linkedin*url; chosen: https://www.linkedin.com/in/afiya-humaira-13a396285?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app; alternatives: https://www.linkedin.com/in/afiya-humaira-13a396285; years: 2024, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:222002112** — field: facebook*url; chosen: https://www.facebook.com/share/19kEy4L1xy/; alternatives: https://www.facebook.com/share/1A8KwRUow2/; years: 2024, 2025. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:231902048** — field: public*email; chosen: tanveer.ziad@gmail.com; alternatives: mailto::tanveer.ziad@gmail.com; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:231902048** — field: linkedin*url; chosen: https://www.linkedin.com/in/tanveer-ziad07; alternatives: https://www.linkedin.com/in/tanveer-ziad-785855246/; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:232002184** — field: public*email; chosen: mailto::bakul.ahmedd@gmail.com; alternatives: mailto::bokula88@gmail.com; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:232002184** — field: github*url; chosen: https://github.com/bakulbd; alternatives: https://github.com/BakulBd; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:223902001** — field: public*email; chosen: mailto::tasmianoortama@gmail.com; alternatives: mailto::ttasmianoor@gmail.com; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002036** — field: linkedin*url; chosen: https://www.linkedin.com/in/shakib-hasan-118571193/; alternatives: https://www.linkedin.com/in/shakib-hasan-118571193; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002036** — field: facebook*url; chosen: https://www.facebook.com/shakibhasan101; alternatives: https://facebook.com/shakibhasan101; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002002** — field: full*name; chosen: MD. Jawadul Hasan Sowmik; alternatives: Md. Jawadul Hassan Sowmik; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002002** — field: public*email; chosen: mailto::jhsowmik35@gmail.com; alternatives: mailto::jhsowmik35@gamil.com; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002002** — field: linkedin*url; chosen: https://www.linkedin.com/in/jawadul-hasan-sowmik-2775342a4/; alternatives: https://www.linkedin.com/in/jawadul-hasan-sowmik-13028b355; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002002** — field: facebook*url; chosen: https://www.facebook.com/JawadulHasanSowmik/; alternatives: https://www.facebook.com/jawadulhasan04/; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002017** — field: full*name; chosen: Md. Farhad; alternatives: Md Farhad; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002017** — field: public*email; chosen: mailto::mdfarhad24100@gmail.com; alternatives: mailto::md1660782@gmail.com; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:241002017** — field: facebook*url; chosen: https://www.facebook.com/md.rimonbhuiyanfarhad/; alternatives: https://www.facebook.com/share/1AE1weBiBN/; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:242002167** — field: linkedin*url; chosen: https://www.linkedin.com/in/nusrat-jahan-sumaiya-242002167gub; alternatives: https://www.linkedin.com/in/nusrat-jahan-sumaiya-8aba342a6?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **profiles · sid:242002167** — field: facebook*url; chosen: https://www.facebook.com/share/1GKDwFPYNn/; alternatives: https://www.facebook.com/share/1A5Fc8GwrY/; years: 2025, 2026. \_Used the value from the most recent committee year; every original value is preserved in committee_members.legacy_json.*
- **events · sl:53** — sl: 53; events: Celebration of Pohela Boishakh 1432 with বৈশাখী ত্রিধারা and Boishakh Fusion, CSE Fresher's Orientation Spring 2025. _Legacy id 53 is used by 2 events, so they shared one cover image (/events/53.jpg). Both imported as separate events; both still point at that image. Upload a correct cover for one of them._
- **events · cse-freshers-orientation-spring-2025** — slug: cse-freshers-orientation-spring-2025; keptBy: CSE Fresher's Orientation Spring 2025; renamed: CSE Fresher's Orientation Spring 2025; newSlug: cse-freshers-orientation-spring-2025-2. _Two events share the URL /events/cse-freshers-orientation-spring-2025. The first keeps it (as before, the second was unreachable); the second now lives at /events/cse-freshers-orientation-spring-2025-2._

## Duplicates (0)

None.

## Skipped (0) and failed (0)

None.

## Notes for review (35)

- **profiles · sidshared:151002009:s-m-emon** — name: S.M. Emon; years: 2018; studentIdGiven: 151002009. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:141002029:bulbul-ahmed** — name: Bulbul Ahmed; years: 2018; studentIdGiven: 141002029. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:143002037:mostafiz-babu** — name: Mostafiz Babu; years: 2018; studentIdGiven: 143002037. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:143002026:arafat-hossain-rana** — name: Arafat Hossain Rana; years: 2018; studentIdGiven: 143002026. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:151002010:tamim-hossain** — name: Tamim Hossain; years: 2018; studentIdGiven: 151002010. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:151002022:kaushik-ahmed-apu** — name: Kaushik Ahmed Apu; years: 2018; studentIdGiven: 151002022. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:153002007:razibur-rahman** — name: Razibur Rahman; years: 2018; studentIdGiven: 153002007. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:151002017:gulzar-hossain** — name: Gulzar Hossain; years: 2018; studentIdGiven: 151002017. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:151002096:md-khaled** — name: Md. Khaled; years: 2018; studentIdGiven: 151002096. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:162002013:angshu-adhikary** — name: Angshu Adhikary; years: 2018; studentIdGiven: 162002013. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:162002004:rushmita-halim** — name: Rushmita Halim; years: 2018; studentIdGiven: 162002004. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:161002026:omar-faruk** — name: Omar Faruk; years: 2018; studentIdGiven: 161002026. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:161002019:md-miraz** — name: Md. Miraz; years: 2018; studentIdGiven: 161002019. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:161002080:ashfaqur-rahman** — name: Ashfaqur Rahman; years: 2018; studentIdGiven: 161002080. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:162002001:munibul-islam** — name: Munibul Islam; years: 2018; studentIdGiven: 162002001. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:161002032:sajjad-sobuj** — name: Sajjad Sobuj; years: 2018; studentIdGiven: 161002032. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · sidshared:161002043:roman** — name: Roman; years: 2018; studentIdGiven: 161002043. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:fahad bin kamal anik** — name: Fahad Bin Kamal Anik; years: 2021; studentIdGiven: 183002xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:kazi hasnayeen emad** — name: Kazi Hasnayeen Emad; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:md ariful islam** — name: Md. Ariful Islam; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:ahsanul karim** — name: Ahsanul Karim; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:md neamot ullah okib** — name: Md. Neamot Ullah Okib; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:nasir uddin foysal** — name: Nasir Uddin Foysal; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:mohammad nazmul hossain** — name: Mohammad Nazmul Hossain; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:farjana afrin maria** — name: Farjana Afrin Maria; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:md jubayer** — name: Md. Jubayer; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:rayhan kobir** — name: Rayhan Kobir; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:amitav roy chowdhury** — name: Amitav Roy Chowdhury; years: 2022; studentIdGiven: 201902xxx. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **profiles · name:md sazib** — name: MD. Sazib; years: 2024; studentIdGiven: 23190200S. _No valid student ID; records merged by exact name. Review if two different people share this name._
- **posts · neurogebra** — canonical: https://fahimerican.substack.com/p/neurogebra?r=35a5fa&triedRedirect=true. _Article body lives at its canonical URL and is fetched there at render time, as before._
- **media · /executives/231902305.png** — path: /executives/231902305.png. _Portrait not referenced by any committee record. Kept (never auto-deleted); review whether it belongs to someone._
- **media · /executives/aminur.cse.png** — path: /executives/aminur.cse.png. _Portrait not referenced by any committee record. Kept (never auto-deleted); review whether it belongs to someone._
- **media · /executives/kabir.cse.png** — path: /executives/kabir.cse.png. _Portrait not referenced by any committee record. Kept (never auto-deleted); review whether it belongs to someone._
- **media · /executives/mahabib.cse.png** — path: /executives/mahabib.cse.png. _Portrait not referenced by any committee record. Kept (never auto-deleted); review whether it belongs to someone._
- **lostfound · adminEmails** — accounts: 1. _Hard-coded lost & found admin emails are replaced by the lostfound.moderate permission. Grant it (e.g. via a position or the Administrator role) once that person registers._
