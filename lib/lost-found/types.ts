export type LostFoundType = "lost" | "found";

export type LostFoundStatus = "pending" | "active" | "resolved" | "rejected";

export type ContactMethod = "email" | "phone" | "in_app";

export interface LostFoundPost {
  id: string;
  /** Never sent to the browser; ownership is expressed by is_owner. */
  user_id?: string;
  is_owner?: boolean;
  type: LostFoundType;
  title: string;
  category: string;
  description: string;
  location: string;
  occurred_at: string;
  image_url: string | null;
  contact_method: ContactMethod;
  contact_value: string | null;
  status: LostFoundStatus;
  created_at: string;
  /** Shown to the author (and moderators) when a moderator asks for changes. */
  reject_reason?: string | null;
}

export interface LostFoundMessage {
  id: string;
  post_id: string;
  sender_id: string;
  sender_email: string;
  body: string;
  created_at: string;
  /** The conversation in Messages this message belongs to. */
  conversation_id?: string;
  post_title?: string;
  post?: {
    id: string;
    title: string;
    user_id: string;
  };
}
