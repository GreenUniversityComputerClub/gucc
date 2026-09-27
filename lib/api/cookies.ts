/**
 * Cookie names, shared by the middleware (edge) and the server helpers.
 *
 * In production the session cookie carries the `__Host-` prefix: browsers only accept it over
 * HTTPS, from this exact host, for the whole site, with no Domain attribute, so no other site or
 * subdomain can set or overwrite it. Local and test servers on http://localhost use plain names.
 */
const httpBase = (process.env.NEXT_PUBLIC_BASE_URL ?? "").startsWith("http://");
export const SECURE_SITE = process.env.NODE_ENV === "production" && !httpBase;

/** The opaque session token (HttpOnly). */
export const SESSION_COOKIE = SECURE_SITE ? "__Host-gucc_session" : "gucc_session";

/**
 * Not a secret, readable by scripts: "a session may exist here". Static pages only ask the server
 * who is signed in when it's present, so anonymous visitors cost no function call.
 */
export const SIGNED_IN_HINT = "gucc_signed_in";
