export type LostFoundType = "lost" | "found";

export type LostFoundStatus = "pending" | "active" | "resolved" | "rejected";

export type ContactMethod = "email" | "phone" | "in_app";

export interface LostFoundPost {
  id: string;
  user_id: string;
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
}

export interface LostFoundMessage {
  id: string;
  post_id: string;
  sender_id: string;
  sender_email: string;
  body: string;
  created_at: string;
  post?: {
    id: string;
    title: string;
    user_id: string;
  };
}
