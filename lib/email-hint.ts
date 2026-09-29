/**
 * Club email comes from a university address through SMTP2GO without the university's DNS
 * records for it, so some inboxes file it as spam. Every screen that follows a sent email says so.
 */
export const EMAIL_SENDER = "gucc@green.edu.bd";
export const SPAM_HINT = `Not there in a few minutes? Check your spam or junk folder (from ${EMAIL_SENDER}) and mark it "Not spam" so later emails arrive.`;
