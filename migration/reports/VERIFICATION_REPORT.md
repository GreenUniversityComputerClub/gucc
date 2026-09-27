# Migration verification report

Target **local** · 2026-09-26T12:34:44.895Z · migration run `run_2026-09-26T11-01-29-827Z_ae386868`

**Result: PASSED**

| Check                                            | Result | Detail                                                                                                                                                    |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No imported rows missing                         | PASS   | 21 tables compared                                                                                                                                        |
| Foreign keys                                     | PASS   | no violations                                                                                                                                             |
| Exactly one current committee                    | PASS   | 1 current                                                                                                                                                 |
| Event slugs unique                               | PASS   | unique                                                                                                                                                    |
| Student IDs unique across profiles               | PASS   | unique                                                                                                                                                    |
| No duplicate active executive assignments        | PASS   | none                                                                                                                                                      |
| Every event has a banner                         | PASS   | 0 without banner                                                                                                                                          |
| Published events have title and date             | PASS   | 0 incomplete                                                                                                                                              |
| STATIC media files exist in public/              | PASS   | 1 files present                                                                                                                                           |
| R2 media have object keys                        | PASS   | 0 missing                                                                                                                                                 |
| Unreferenced media (informational)               | PASS   | 27 media rows not referenced by any record (sponsor/partner logos are referenced from settings JSON, unused portraits are listed in the migration report) |
| Every source record maps to an existing row      | PASS   | 0 dangling of 1099 entries                                                                                                                                |
| Committees rebuilt from D1 match executives.json | PASS   | 334 listings compared across 10 committees                                                                                                                |
| Events rebuilt from D1 match events.json         | PASS   | 81 of 81 events compared                                                                                                                                  |
| Contests rebuilt from D1 match contests.json     | PASS   | 23 contests compared                                                                                                                                      |
| Forms match forms.json                           | PASS   | 7 of 7                                                                                                                                                    |
| Sponsorship page content matches sponsors.json   | PASS   | deep-equal                                                                                                                                                |
| Chatbot knowledge matches predefined.json        | PASS   | deep-equal                                                                                                                                                |
| Partner clubs match the hard-coded list          | PASS   | deep-equal                                                                                                                                                |
| Certificate recipients imported                  | PASS   | 146                                                                                                                                                       |
| No private data in public columns                | PASS   | public builders select no private columns; verified above per record                                                                                      |

## Row counts

| Table                  | Expected | Actual | OK  |
| ---------------------- | -------- | ------ | --- |
| media                  | 268      | 268    | yes |
| committees             | 10       | 10     | yes |
| committee_members      | 334      | 334    | yes |
| profiles               | 224      | 225    | yes |
| categories             | 33       | 33     | yes |
| events                 | 81       | 81     | yes |
| event_media            | 81       | 81     | yes |
| event_people           | 216      | 216    | yes |
| contests               | 23       | 23     | yes |
| contest_teams          | 33       | 33     | yes |
| contest_media          | 1        | 1      | yes |
| posts                  | 1        | 1      | yes |
| post_revisions         | 1        | 1      | yes |
| tags                   | 5        | 5      | yes |
| post_tags              | 5        | 5      | yes |
| external_forms         | 7        | 7      | yes |
| certificate_programs   | 1        | 1      | yes |
| certificate_recipients | 146      | 146    | yes |
| organization_settings  | 5        | 5      | yes |
| migration_source_map   | 1099     | 1099   | yes |
| migration_conflicts    | 59       | 59     | yes |

## Intended differences (448)

Rebuilt content differs from the legacy JSON only in these ways, each deliberate:

- portrait resolved (student-ID file or profile photo): 155
- portrait now served from R2: 110
- event cover now served from R2: 81
- private field removed from public output: 50
- empty value omitted: 18
- shared student ID held back pending review: 17
- placeholder student ID dropped (was a broken profile link): 12
- surrounding whitespace trimmed: 4
- contest image now served from R2: 1

## Unexpected differences (0)

None.
