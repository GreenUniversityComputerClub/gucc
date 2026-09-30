import { expect, test } from "@playwright/test";
import { ensureMember, login } from "./helpers";

/**
 * A member's profile photo: framed, the background removed in the browser (MediaPipe, served by
 * this site), a backdrop chosen, then uploaded and shown. Other photo fields (executives, people,
 * groups) frame the picture but don't offer background removal.
 */
const run = Date.now().toString(36);
const M = { email: `photo-${run}@student.green.ac.bd`, name: `Photo ${run}`, password: "Photo-member-pass-2026!" };

test("profile photo: frame, remove the background, choose a backdrop, save", async ({ page }) => {
  test.setTimeout(180_000);
  await ensureMember(M.email, M.name, M.password);
  await login(page, M.email, M.password, "/dashboard/profile");
  // A real photo with people in it (from the club's events).
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles("public/events/20.jpg");
  const editor = page.getByRole("dialog", { name: "Frame your photo" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Rotate a quarter turn" }).isVisible();
  await editor.getByRole("button", { name: "Next", exact: true }).click();

  const step2 = page.getByRole("dialog", { name: "Choose a background" });
  await expect(step2.getByText("Removing the background…")).toBeHidden({ timeout: 90_000 });
  await step2.getByRole("radio", { name: "GUCC green" }).click();
  await expect(step2.getByRole("radio", { name: "GUCC green" })).toHaveAttribute("aria-checked", "true");
  await step2.getByRole("button", { name: "Use this photo" }).click();
  await expect(page.getByText(/Photo updated/).first()).toBeVisible({ timeout: 60_000 });
});

test("the background remover's runtime and model are served by the site itself", async ({ request }) => {
  for (const path of ["/models/selfie_segmenter.tflite", "/mediapipe/vision_wasm_internal.js", "/mediapipe/vision_wasm_internal.wasm"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
  }
});
