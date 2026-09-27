/**
 * Version of the contract between the website and the API Worker. Both are built from this
 * repository, so after a full deploy they match; while one side is older (a deploy in
 * progress, or the local site pointed at the live API) the dashboard says so instead of
 * breaking. Bump it whenever the website starts relying on a new procedure or field.
 */
export const API_VERSION = "2026.09.28";
