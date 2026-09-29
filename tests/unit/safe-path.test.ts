import { describe, expect, it } from "vitest";
import { safeLocalPath } from "@/lib/safe-path";
import { safeUrl } from "@/lib/markdown";

describe("safe local paths (redirects, notification links, markdown links)", () => {
  it("keeps paths on this site", () => {
    expect(safeLocalPath("/dashboard/chat/cnv_1?x=1#end", "/")).toBe("/dashboard/chat/cnv_1?x=1#end");
    expect(safeLocalPath("/events", "/")).toBe("/events");
  });

  it("refuses anything that a browser would send elsewhere", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\tevil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "", "/%0a/evil"]) {
      const out = safeLocalPath(bad, "/fallback");
      expect(out === "/fallback" || out.startsWith("/%0a"), bad).toBe(true);
    }
    expect(safeLocalPath(123, "/f")).toBe("/f");
    expect(safeLocalPath("/" + "a".repeat(600), "/f")).toBe("/f");
  });

  it("markdown links never become protocol-relative", () => {
    expect(safeUrl("/\\evil.com")).toBeNull();
    expect(safeUrl("/\tevil.com")).toBeNull();
    expect(safeUrl("/blog/post")).toBe("/blog/post");
  });
});
