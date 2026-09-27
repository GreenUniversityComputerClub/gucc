"use server";

import { runAction } from "@/lib/api/session";

export async function saveAvatarCrop(input: { year: string; name: string; position: string; avatarPosition: { x: number; y: number }; avatarScale: number }) {
  return runAction("executives.avatarCrop", { input });
}
