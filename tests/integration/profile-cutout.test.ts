/**
 * A member's photo with its background removed: the round photo shows everywhere, the cut-out
 * (transparent) on the executives list. A new photo without a cut-out, a leader's new photo for
 * them, removing the photo and deleting the account all drop the old cut-out.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { setOwnAvatar, updatePerson } from "@/lib/server/services/people";
import { buildCommittee, type CommitteeRow, type MemberRow, type PublicExecutive } from "@/lib/public/shapes";
import { COMMITTEES_SQL, MEMBERS_SQL } from "@/lib/public/queries";
import { MEDIA_REFS_SQL } from "@/lib/server/services/media";
import { createWorld, type TestWorld } from "../support/d1";

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

function photo(id: string, by: string | null) {
  w.sqlite.prepare(
    "INSERT INTO media (id, storage, bucket, object_key, original_filename, mime_type, media_type, visibility, status, uploaded_by) VALUES (?, 'R2', 'public', ?, 'p.webp', 'image/webp', 'IMAGE', 'PUBLIC', 'READY', ?)",
  ).run(id, `media/${id}/master.webp`, by);
  return id;
}
function card(name: string): PublicExecutive {
  const c = (w.sqlite.prepare(COMMITTEES_SQL).all() as unknown as CommitteeRow[]).find((x) => x.id === w.committeeId)!;
  const built = buildCommittee(c, w.sqlite.prepare(MEMBERS_SQL).all() as unknown as MemberRow[]);
  return [...((built.facultyMembers as PublicExecutive[]) ?? []), ...((built.studentExecutives as PublicExecutive[]) ?? [])].find((p) => p.name === name)!;
}
const cutoutOf = (userId: string) => (w.sqlite.prepare("SELECT cutout_media_id FROM profiles WHERE user_id = ?").get(userId) as { cutout_media_id: string | null }).cutout_media_id;

describe("profile cut-out", () => {
  it("the executives list shows the cut-out; the round photo stays the avatar", async () => {
    const exec = await w.user({ email: "exec@x.bd", name: "Nadia Rahman", roles: ["member"], positions: ["executive-member"] });
    await setOwnAvatar(await w.ctx(exec), photo("med_round", exec), photo("med_cut", exec));
    const c = card("Nadia Rahman");
    expect(c.avatarUrl).toContain("med_round");
    expect(c.cutoutUrl).toContain("med_cut");
    // Both files are in use (never cleaned up as orphans).
    const refs = w.sqlite.prepare(`SELECT ${MEDIA_REFS_SQL} AS n FROM media m WHERE m.id = 'med_cut'`).get() as { n: number };
    expect(refs.n).toBe(1);
  });

  it("a new photo without a cut-out, or removing the photo, drops the old cut-out", async () => {
    const exec = await w.user({ email: "exec@x.bd", name: "Nadia Rahman", roles: ["member"], positions: ["executive-member"] });
    await setOwnAvatar(await w.ctx(exec), photo("med_a", exec), photo("med_a_cut", exec));
    await setOwnAvatar(await w.ctx(exec), photo("med_b", exec));
    expect(cutoutOf(exec)).toBeNull();
    expect(card("Nadia Rahman").cutoutUrl).toBeUndefined();
    await setOwnAvatar(await w.ctx(exec), photo("med_c", exec), photo("med_c_cut", exec));
    await setOwnAvatar(await w.ctx(exec), null, "med_c_cut");
    expect(cutoutOf(exec)).toBeNull();
  });

  it("someone else's upload can't be used as a cut-out", async () => {
    const exec = await w.user({ email: "exec@x.bd", roles: ["member"], positions: ["executive-member"] });
    const other = await w.user({ email: "o@x.bd", roles: ["member"] });
    await expect(setOwnAvatar(await w.ctx(exec), photo("med_mine", exec), photo("med_theirs", other))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a leader giving the person a new photo drops the member's cut-out of the old one", async () => {
    const exec = await w.user({ email: "exec@x.bd", name: "Nadia Rahman", roles: ["member"], positions: ["executive-member"] });
    const pres = await w.user({ email: "p@x.bd", roles: ["member"], positions: ["president"] });
    await setOwnAvatar(await w.ctx(exec), photo("med_own", exec), photo("med_own_cut", exec));
    const profile = w.sqlite.prepare("SELECT * FROM profiles WHERE user_id = ?").get(exec) as Record<string, unknown>;
    await updatePerson(await w.ctx(pres), String(profile.id), {
      fullName: "Nadia Rahman", personType: String(profile.person_type), avatarMediaId: photo("med_official", pres), expectedUpdatedAt: String(profile.updated_at),
    });
    expect(cutoutOf(exec)).toBeNull();
    expect(card("Nadia Rahman").avatarUrl).toContain("med_official");
  });
});
