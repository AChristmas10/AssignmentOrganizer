/**
 * Firebase Admin, used for exactly two things: proving who is calling, and
 * keeping a parse counter the caller cannot edit.
 *
 * WHY ADMIN AND NOT THE CLIENT SDK
 * --------------------------------
 * The browser already talks to Firebase directly, and Do2Date's security rules
 * are what stop one student reading another's classes. That model is fine for
 * user data. It is useless for a spend limit: anything the client can write,
 * the client can rewrite, so a quota kept under the user's own subtree is a
 * quota they can zero out with one console command.
 *
 * This endpoint is the only thing in Do2Date that costs money per request, so
 * its guard has to live somewhere the user cannot reach. `syllabusQuota/` is
 * written only here, with admin credentials, and the security rules should deny
 * both read and write to everyone else.
 */
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

let cached = null;

/**
 * Returns { auth, db }, or throws.
 *
 * Throwing is deliberate. If the service account is missing or malformed, the
 * endpoint must refuse every request rather than fall back to "no auth, no
 * quota" — a misconfigured deploy should be visibly broken, not quietly an open
 * proxy to a metered API key.
 */
export function firebaseAdmin() {
  if (cached) return cached;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set on this deployment.");
  }

  let serviceAccount;
  try {
    // Accepts either raw JSON or base64-wrapped JSON. Vercel's dashboard
    // handles multiline values badly enough that base64 is the safer paste.
    const text = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    serviceAccount = JSON.parse(text);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ||
    "https://do2date-default-rtdb.firebaseio.com";

  const app = getApps().length
    ? getApp()
    : initializeApp({ credential: cert(serviceAccount), databaseURL });

  cached = { auth: getAuth(app), db: getDatabase(app) };
  return cached;
}

/**
 * Verifies the caller's Firebase ID token and returns their uid.
 *
 * Returns null rather than throwing on a bad token, because "your session
 * expired, sign in again" is an ordinary thing to tell a student, not a server
 * error to log.
 */
export async function verifyCaller(authorizationHeader) {
  const header = String(authorizationHeader || "");
  if (!header.toLowerCase().startsWith("bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  try {
    const { auth } = firebaseAdmin();
    const decoded = await auth.verifyIdToken(token);
    return decoded.uid || null;
  } catch {
    return null;
  }
}
