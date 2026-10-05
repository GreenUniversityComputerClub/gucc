/** "(3) Events | GUCC": the count in front of the tab's title. */
import { describe, expect, it } from "vitest";
import { stripCount, withCount } from "@/lib/notifications/title-badge";

describe("tab title count", () => {
  it("adds, replaces and removes the count", () => {
    expect(withCount("Events | GUCC", 3)).toBe("(3) Events | GUCC");
    expect(withCount("(3) Events | GUCC", 5)).toBe("(5) Events | GUCC");
    expect(withCount("(5) Events | GUCC", 0)).toBe("Events | GUCC");
    expect(withCount("Events", 250)).toBe("(99+) Events");
    expect(stripCount("(99+) Events")).toBe("Events");
  });

  it("leaves titles that merely start with brackets alone", () => {
    expect(stripCount("(GUCC) Events")).toBe("(GUCC) Events");
  });
});
