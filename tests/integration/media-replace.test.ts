import { beforeEach, describe, expect, it } from "vitest";
import { mediaDetails, uploadMedia } from "@/lib/server/services/media";
import { createWorld, type TestWorld } from "../support/d1";

const PNG_A = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const PNG_B = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"));

let w: TestWorld;
beforeEach(async () => {
  w = await createWorld();
});

describe("replacing an image", () => {
  it("keeps the record and every reference, swaps the files and deletes the old ones", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const tags: string[] = [];
    const ctx = async () => ({ ...(await w.ctx(pres)), revalidate: (t: string[]) => void tags.push(...t) });
    const first = await uploadMedia(await ctx(), { files: { master: PNG_A }, originalFilename: "portrait.png" });
    w.sqlite.prepare("INSERT INTO profiles (id, full_name, avatar_media_id) VALUES ('prf_x', 'Somebody', ?)").run(first.id);
    const before = w.sqlite.prepare("SELECT object_key, checksum_sha256 FROM media WHERE id = ?").get(first.id) as { object_key: string; checksum_sha256: string };
    expect(w.bucket.objects.has(before.object_key)).toBe(true);

    const replaced = await uploadMedia(await ctx(), { files: { master: PNG_B }, originalFilename: "portrait-2026.png", replaceId: first.id });
    expect(replaced.id).toBe(first.id);
    const after = w.sqlite.prepare("SELECT object_key, checksum_sha256, original_filename FROM media WHERE id = ?").get(first.id) as { object_key: string; checksum_sha256: string; original_filename: string };
    expect(after.object_key).not.toBe(before.object_key);
    expect(after.checksum_sha256).not.toBe(before.checksum_sha256);
    expect(after.original_filename).toBe("portrait-2026.png");
    expect(w.bucket.objects.has(before.object_key)).toBe(false);
    expect(w.bucket.objects.has(after.object_key)).toBe(true);
    expect(w.sqlite.prepare("SELECT avatar_media_id FROM profiles WHERE id = 'prf_x'").get()).toEqual({ avatar_media_id: first.id });
    expect(tags).toEqual(expect.arrayContaining(["committees", "events"]));
    expect(w.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action = 'media.replace'").get()).toEqual({ n: 1 });

    const details = await mediaDetails(await w.ctx(pres), first.id);
    expect(details.usage).toEqual([{ kind: "Profile photo", label: "Somebody", link: "/dashboard/people/prf_x" }]);
  });

  it("refuses people who can't edit the file, and non-images", async () => {
    const pres = await w.user({ email: "p@x.bd", positions: ["president"] });
    const exec = await w.user({ email: "e@x.bd", positions: ["executive-member"] });
    const img = await uploadMedia(await w.ctx(pres), { files: { master: PNG_A }, originalFilename: "a.png" });
    await expect(uploadMedia(await w.ctx(exec), { files: { master: PNG_B }, originalFilename: "b.png", replaceId: img.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const pdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    await expect(uploadMedia(await w.ctx(pres), { files: { master: pdf }, originalFilename: "c.pdf", replaceId: img.id })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
