import { getPublicSetting } from "@/lib/public/data";
import { LostFoundClient } from "./lost-found-client";

/** The same page for everyone, cached; who is signed in is worked out in the browser. */
export const revalidate = 21600;

export default async function LostFoundPage() {
  const cfg = await getPublicSetting<{ categories?: string[]; locations?: string[] }>("lostfound.config");
  return <LostFoundClient config={{ categories: cfg?.categories ?? [], locations: cfg?.locations ?? [] }} />;
}
