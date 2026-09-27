# Importing executives (JSON or CSV)

**Admin → Committees & executives → Import executives** (`/admin/committees/import`). You need the
`executives.import` permission (by default: Moderators, the President and the General Secretary) and
permission to manage executives of each committee the file touches.

Nothing is saved until you confirm. The steps:

1. **Choose the file** (or paste its content). JSON and CSV are detected automatically.
2. **Options.** The committee to use for rows that don't name one, and what to do with people
   already listed:
   - **Add new only**: new people and listings are added; existing records stay exactly as they are.
   - **Add and update**: also updates the details of people already listed.
   - **Update existing only**: changes details of people already listed and adds no one.
3. **Review.** Every row shows what would happen (new person, new listing, update, no change,
   skipped, needs attention) and why. You can:
   - map a title GUCC doesn't have (e.g. "Chief Wizard") to an existing position; the file's title is
     still what the public page shows;
   - pick the right person when several share a name, or say it's a new person;
   - skip any row.

   Changing anything asks for a fresh preview. **Import** stays disabled while any row needs attention.

4. **Import.** Everything is applied in one step, or nothing is. Afterwards the result lists what was
   created and updated and confirms that every new listing and person is in the database. The public
   committee pages refresh on their own.

If someone else changes the committee between your preview and your import, the import is refused
and asks you to preview again.

## Accepted formats

A list of people:

```json
[
  {
    "name": "Example Person",
    "studentId": "232000001",
    "position": "General Secretary",
    "committee": "2027",
    "unit": "gucc",
    "photo": "/executives/232000001.png",
    "linkedin": "https://www.linkedin.com/in/example",
    "bio": "Short bio.",
    "order": 1
  }
]
```

One committee with a list (`executives`, `members`, `people` or `data`):

```json
{ "committee": "2027", "executives": [{ "name": "…", "position": "…" }] }
```

GUCC's own `executives.json` format works as it is: years with `facultyMembers` and
`studentExecutives`, `campuses` (e.g. `gucc`, `css`) and `wings` (e.g. `vgs`), portrait framing
(`avatarPosition`, `avatarScale`) and `mail`.

CSV needs a header row with the same field names. Quoted cells may contain commas and line breaks.
Download the examples from the import page (`/examples/executives-import.json`, `.csv`).

| Field                                                  | Also accepted as | Notes                                                                                                                                                |
| ------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                                 | full name        | Required.                                                                                                                                            |
| `position`                                             | title, role      | Required. Matched to GUCC's positions, including older titles.                                                                                       |
| `studentId`                                            | student ID, id   | Nine digits. Matches people already on record, so nobody is duplicated. Anything else is ignored with a warning.                                     |
| `committee`                                            | year, term       | Matched to a committee's URL segment, term, name or academic year (e.g. `2026`). Unknown committees must be created first.                           |
| `unit`                                                 | campus, wing     | Required in committees organised by campus or wing (2026: `gucc`, `css`). A new unit adds a new tab, with a warning.                                 |
| `section`                                              | type             | `faculty` or `student`; default from the position.                                                                                                   |
| `email`                                                | mail             | Only used to match an existing account; never stored publicly.                                                                                       |
| `photo`                                                | avatarUrl, image | A photo already in the media library, e.g. `/executives/232002184.png`. Web addresses aren't downloaded: upload the photo on the listing afterwards. |
| `bio`, `designation`                                   |                  | Designation is the faculty title, e.g. Lecturer.                                                                                                     |
| `linkedin`, `github`, `facebook`, `twitter`, `website` | profileUrl       | Full web addresses.                                                                                                                                  |
| `order`, `startDate`, `endDate`                        |                  | Display order; dates as YYYY-MM-DD.                                                                                                                  |

## How people are matched (never duplicated)

1. By **student ID**.
2. By the **email** of an existing account.
3. By **name**, only if exactly one person has it (and no conflicting student ID). The preview flags it so you can
   choose "A new person" instead. Several people with the same name must be chosen explicitly.

The same person and position twice in one file counts as a duplicate: the later row is skipped.

## What is checked

- Single-holder positions (President, General Secretary …) can't get a second holder.
- Only Moderators can assign protected positions (Moderator).
- Nobody can assign themselves.
- Dates must be valid, and end dates can't be before start dates.
- Existing student IDs are never changed, and values missing from the file never erase stored ones.

## Records

Each import writes an audit record (`executives.import`) with the file's SHA-256, the format and mode,
and how many people and listings were created, updated, unchanged and skipped. It also writes one
`executive.assign` or `executive.update` record per listing. People who already have an account are
told in the app that they were added.

## Bulk changes on a committee page

On a committee's page, tick listings and choose **End assignments**, **Reactivate**, **Change position**,
**Copy to another committee** (for example to carry people into next term) or **Sort by position rank**.
Each shows the exact changes, and what can't change and why, before you apply it. The same rules
apply as for single listings, and each change is audited.
