import { expect, test } from "@playwright/test";
import { acceptConfirms, ensureMember, login, MODERATOR, settle } from "./helpers";

const run = Date.now().toString(36);
const MEMBER = { email: `quizmem-${run}@green.edu.bd`, name: `Sadia Quiz ${run}`, password: "Quiz-member-pass-2026!" };

test("complete Quiz Arena lifecycle: authoring, guest & member join, real-time WS gameplay, reveal, finalize, results & certificates", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await ensureMember(MEMBER.email, MEMBER.name, MEMBER.password);

  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await acceptConfirms(host);
  await login(host, MODERATOR.email, MODERATOR.password, "/dashboard/quizzes/new");

  // 1. Moderator creates a new quiz draft
  const quizTitle = `GUCC Live Bowl ${run}`;
  await host.getByLabel(/^Title/).fill(quizTitle);
  await host.getByLabel("Topic / Track").fill("Networking");
  await host.getByRole("button", { name: "Create quiz draft" }).click();
  await expect(host).toHaveURL(/\/dashboard\/quizzes\/qiz_/);
  await settle(host);

  const quizPath = new URL(host.url()).pathname;

  // 2. Add 2 questions (1 MCQ + 1 True/False)
  await host.getByLabel("Question 1 prompt").fill("Which OSI layer handles IP packet routing?");
  await host.getByPlaceholder("Option 1").fill("Network Layer");
  await host.getByPlaceholder("Option 2").fill("Physical Layer");
  await host.getByPlaceholder("Option 3").fill("Session Layer");
  await host.getByPlaceholder("Option 4").fill("Presentation Layer");

  await host.getByRole("button", { name: "Add question" }).click();
  await host.getByLabel("Question 2 type").selectOption("TRUE_FALSE");
  await host.getByLabel("Question 2 prompt").fill("HTTP 200 OK indicates a successful request.");

  await host.getByRole("button", { name: "Save question bank" }).click();
  await expect(host.getByText(/Question bank saved/i)).toBeVisible({ timeout: 15_000 });

  // 3. Publish quiz & launch a live session room
  await host.getByRole("button", { name: "Publish quiz" }).click();
  await expect(host.getByRole("button", { name: "Create & open host room" })).toBeVisible({ timeout: 15_000 });
  await host.getByRole("button", { name: "Create & open host room" }).click();
  await expect(host).toHaveURL(/\/dashboard\/quizzes\/host\/qses_/);
  await settle(host);
  await expect(host.getByText("Live WebSocket")).toBeVisible({ timeout: 15_000 });

  const desc = (await host.getByText(/Session [A-Z0-9]{6,12} ·/).textContent()) ?? "";
  const codeMatch = desc.match(/Session ([A-Z0-9]{6,12}) ·/);
  expect(codeMatch?.[1]).toBeTruthy();
  const joinCode = codeMatch![1]!;

  // Capture slug from quiz page link after reloading detail or reading quizzes list
  const quizPage = await hostCtx.newPage();
  await quizPage.goto(quizPath);
  await expect(quizPage.getByRole("link", { name: "Public page" })).toBeVisible();
  const publicSlugHref = await quizPage.getByRole("link", { name: "Public page" }).getAttribute("href");
  await quizPage.close();
  expect(publicSlugHref).toBeTruthy();

  // 4. External guest joins via /q/[joinCode]
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(`/q/${joinCode}`);
  await guest.getByRole("radio", { name: "Guest / Other Univ." }).click();
  await guest.getByLabel("Full name *").fill(`Tariq Guest ${run}`);
  await guest.getByLabel("Email address *").fill(`tariq-${run}@example.edu`);
  await guest.getByLabel("University / Institution *").fill("Green University");
  await guest.getByRole("button", { name: "Join & Enter Arena" }).click();
  await expect(guest).toHaveURL(/\/quizzes\/.*\/live\?session=qses_/);
  await expect(guest.getByText("Get Ready!")).toBeVisible();
  await expect(guest.getByText("Live", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 5. Signed-in member joins with 1 click via /quizzes/[slug]
  const memberCtx = await browser.newContext();
  const memberPage = await memberCtx.newPage();
  await login(memberPage, MEMBER.email, MEMBER.password, publicSlugHref!);
  await expect(memberPage.getByText(`Joining as ${MEMBER.name}`)).toBeVisible();
  await memberPage.getByRole("button", { name: "Join & Enter Arena" }).click();
  await expect(memberPage).toHaveURL(/\/quizzes\/.*\/live\?session=qses_/);
  await expect(memberPage.getByText("Get Ready!")).toBeVisible();
  await expect(memberPage.getByText("Live", { exact: true })).toBeVisible({ timeout: 15_000 });

  // 6. Host sees participants joined & starts Q1
  await expect(host.getByText(/2 joined/)).toBeVisible({ timeout: 15_000 });
  await host.getByRole("button", { name: "Start Quiz (Q1)" }).click();

  await expect(guest.getByText("Which OSI layer handles IP packet routing?")).toBeVisible({ timeout: 15_000 });
  await expect(memberPage.getByText("Which OSI layer handles IP packet routing?")).toBeVisible({ timeout: 15_000 });

  await guest.getByRole("button", { name: /Network Layer/ }).click();
  await guest.getByRole("button", { name: "Lock Answer" }).click();
  await expect(guest.getByText(/Answer locked in!/)).toBeVisible();

  await memberPage.getByRole("button", { name: /Physical Layer/ }).click();
  await memberPage.getByRole("button", { name: "Lock Answer" }).click();

  // 7. Reveal Q1 -> Next Q2 -> Reveal Q2 -> Finalize
  await host.getByRole("button", { name: "Reveal Answer" }).click();
  await expect(guest.getByText(/Correct!/)).toBeVisible({ timeout: 15_000 });

  await host.getByRole("button", { name: /Next Question \(Q2\)/ }).click();
  await expect(guest.getByText("HTTP 200 OK indicates a successful request.")).toBeVisible({ timeout: 15_000 });
  await guest.getByRole("button", { name: /True/ }).click();
  await guest.getByRole("button", { name: "Lock Answer" }).click();

  await host.getByRole("button", { name: "Reveal Answer" }).click();
  await host.getByRole("button", { name: "Finalize & Save Results" }).click();

  // 8. Both sides reflect finalization; host can issue certificates
  await expect(host.getByText("Session Finalized")).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByText("Quiz Finished!")).toBeVisible({ timeout: 15_000 });
  await guest.getByRole("link", { name: /Open Full Leaderboard/ }).click();
  await expect(guest.getByText(`Official Results — ${quizTitle}`)).toBeVisible();
  await expect(guest.getByText(`Your Performance — Tariq Guest ${run}`)).toBeVisible();

  await host.getByRole("button", { name: "Issue Quiz Certificates" }).click();
  await expect(host.getByText(/Certificates issued\./i)).toBeVisible({ timeout: 15_000 });

  await guestCtx.close();
  await memberCtx.close();
  await hostCtx.close();
});
