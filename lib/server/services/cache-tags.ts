/** Cache tags shared by the public read models and the services that invalidate them. */
export const TAGS = {
  committees: "committees",
  events: "events",
  event: (slug: string) => `event:${slug}`,
  contests: "contests",
  posts: "posts",
  post: (type: string, slug: string) => `post:${type}:${slug}`,
  settings: "settings",
  forms: "forms",
  sponsorships: "sponsorships",
};

export function tagsForPost(type: string, ...slugs: string[]): string[] {
  return [TAGS.posts, ...slugs.map((s) => TAGS.post(type, s))];
}
