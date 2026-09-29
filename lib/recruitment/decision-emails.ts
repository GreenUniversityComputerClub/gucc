/** What an applicant is emailed when a reviewer records a decision (shared by the API and the review page's preview). */
export const DECISION_EMAILS: Record<string, string> = {
  SHORTLISTED: "Congratulations — you have been shortlisted. We will email you the next steps soon.",
  INTERVIEW: "You are invited to an interview. We will email you the schedule.",
  ACCEPTED: "Congratulations — your application has been accepted. Welcome to the team!",
  REJECTED: "Thank you for applying. After careful review we are unable to offer you a position this time.",
};

export function decisionEmail(status: string, a: { fullName: string; campaignTitle: string; positionName: string }) {
  const line = DECISION_EMAILS[status];
  if (!line) return null;
  return {
    subject: `Your GUCC application: ${a.campaignTitle}`,
    text: `Hello ${a.fullName},\n\n${line}\n\nPosition: ${a.positionName}\n\nGreen University Computer Club`,
  };
}
