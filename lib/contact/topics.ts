/** What a contact message can be about: the form's Topic list, the inbox label and the email subject. */
export const CONTACT_TOPICS = {
  general: "General question",
  membership: "Membership",
  events: "Events and workshops",
  partnership: "Partnership or sponsorship",
  website: "Website or account help",
} as const;

export type ContactTopic = keyof typeof CONTACT_TOPICS;

/** A known topic, or null (never an inherited name such as "constructor"). */
export const topicOf = (v: unknown): ContactTopic | null =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(CONTACT_TOPICS, v) ? (v as ContactTopic) : null;
