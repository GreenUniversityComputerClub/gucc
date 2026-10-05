import { describe, expect, it } from "vitest";
import { insertMention, matchPeople, mentionIdsOf, mentionQueryAt, parseMentions, presentIn, segment } from "@/lib/chat/mentions";

describe("mentions", () => {
  it("finds the @query being typed, not emails or long text", () => {
    expect(mentionQueryAt("Hi @Ra", 6)).toEqual({ start: 3, query: "Ra" });
    expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQueryAt("Hi @Rafi Ah", 11)).toEqual({ start: 3, query: "Rafi Ah" });
    expect(mentionQueryAt("mail me at x@gucc.bd", 20)).toBeNull();
    expect(mentionQueryAt("@ Rafi", 6)).toBeNull();
    expect(mentionQueryAt("@a\nb", 4)).toBeNull();
    expect(mentionQueryAt("@one two three four", 19)).toBeNull();
  });

  it("puts the name in place of the query, with one space after", () => {
    expect(insertMention("Hi @Ra", 3, 6, "Rafi Ahmed")).toEqual({ text: "Hi @Rafi Ahmed ", caret: 15 });
    expect(insertMention("Hi @Ra, see this", 3, 6, "Rafi Ahmed")).toEqual({ text: "Hi @Rafi Ahmed, see this", caret: 14 });
    expect(insertMention("@Raf there", 0, 2, "Rafi")).toEqual({ text: "@Rafi there", caret: 5 });
  });

  it("keeps only mentions still written, as whole names", () => {
    const m = [{ u: "u1", n: "Rafi" }, { u: "u2", n: "Nusrat Jahan" }];
    expect(presentIn("Thanks @Rafi!", m)).toEqual([m[0]]);
    expect(presentIn("@Rafiq is someone else", m)).toEqual([]);
    expect(presentIn("@Nusrat Jahan and @Rafi", m)).toEqual(m);
  });

  it("splits text into links and mentions, longest names first, never inside a link", () => {
    const m = [{ u: "u1", n: "Rafi" }, { u: "u2", n: "Rafi Ahmed", h: "rafi-ahmed" }];
    expect(segment("Hi @Rafi Ahmed and @Rafi: https://x.com/@Rafi", m)).toEqual([
      { t: "text", v: "Hi " },
      { t: "mention", v: "@Rafi Ahmed", m: m[1] },
      { t: "text", v: " and " },
      { t: "mention", v: "@Rafi", m: m[0] },
      { t: "text", v: ": " },
      { t: "url", v: "https://x.com/@Rafi" },
    ]);
    expect(segment("plain")).toEqual([{ t: "text", v: "plain" }]);
  });

  it("matches word starts first, and reads ids and stored lists safely", () => {
    const people = [{ name: "Anika Rahman" }, { name: "Rafi Ahmed" }, { name: "Farhan" }];
    expect(matchPeople(people, "ra").map((p) => p.name)).toEqual(["Anika Rahman", "Rafi Ahmed"]);
    expect(matchPeople(people, "an").map((p) => p.name)).toEqual(["Anika Rahman", "Farhan"]);
    expect(matchPeople(people, "ahm").map((p) => p.name)).toEqual(["Rafi Ahmed", "Anika Rahman"]);
    expect(mentionIdsOf(["usr_1", { u: "usr_2" }, "usr_1", "*", "bad id", 5])).toEqual(["usr_1", "usr_2", "*"]);
    expect(mentionIdsOf("usr_1")).toEqual([]);
    expect(parseMentions('[{"u":"a","n":"A","h":"a"},{"u":1},null]')).toEqual([{ u: "a", n: "A", h: "a" }]);
    expect(parseMentions("not json")).toEqual([]);
  });
});
