/**
 * Firebase access without the Admin SDK.
 *
 * WHY NOT firebase-admin
 * ---------------------
 * It crashed the function on cold start:
 *
 *   Error [ERR_REQUIRE_ESM]: require() of ES Module
 *   /var/task/node_modules/jose/dist/webapi/index.js
 *   from /var/task/node_modules/jwks-rsa/src/utils.js not supported.
 *
 * firebase-admin depends on jwks-rsa, which still uses CommonJS `require()`,
 * and jose shipped as ESM-only. Vercel bundles the function as CommonJS, so the
 * require fails at import time — before a single line of our code runs. Every
 * request 500'd with FUNCTION_INVOCATION_FAILED, which the browser could only
 * report as a generic "unavailable", pointing debugging at the wrong things.
 *
 * We needed exactly two things from that SDK: verify a Firebase ID token, and
 * write a counter the client cannot forge. Both are a few dozen lines against
 * documented Google endpoints, using jose directly — which is ESM-native, so
 * the whole failure mode disappears. It also drops ~50 MB of dependency and the
 * cold start that came with it.
 */
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";

/** Google's public keys for Firebase ID tokens, in JWKS form. Cached by jose. */
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

let cachedServiceAccount = null;

function serviceAccount() {
  if (cachedServiceAccount) return cachedServiceAccount;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set on this deployment.");
  }

  try {
    // Accepts raw JSON or base64-wrapped JSON. Vercel's dashboard handles
    // multiline values badly enough that base64 is the safer paste.
    const text = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    cachedServiceAccount = JSON.parse(text);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }

  if (!cachedServiceAccount.private_key || !cachedServiceAccount.client_email) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing private_key or client_email.");
  }

  return cachedServiceAccount;
}

export function projectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    serviceAccount().project_id ||
    "do2date"
  );
}

function databaseUrl() {
  const url =
    process.env.FIREBASE_DATABASE_URL ||
    `https://${projectId()}-default-rtdb.firebaseio.com`;
  return url.replace(/\/+$/, "");
}

/**
 * Verify the caller's Firebase ID token against Google's public keys.
 *
 * Checking `issuer` and `audience` is not optional decoration: without them a
 * validly-signed token from any *other* Firebase project would be accepted,
 * and anyone can make a Firebase project.
 *
 * Returns null rather than throwing on a bad token — "your session expired" is
 * an ordinary thing to tell a student, not a server error.
 */
export async function verifyCaller(authorizationHeader) {
  const header = String(authorizationHeader || "");
  if (!header.toLowerCase().startsWith("bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  try {
    const id = projectId();
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${id}`,
      audience: id,
    });
    // `sub` is the uid. Firebase also sets user_id; sub is the standard claim.
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

let cachedToken = null; // { token, expiresAtMs }

/**
 * An OAuth access token for the Realtime Database REST API, minted from the
 * service account.
 *
 * This is what makes the quota counter trustworthy: requests carrying this
 * token bypass security rules entirely, so `syllabusQuota` can be denied to
 * every client and still be writable here.
 *
 * Cached in module scope with a 60s safety margin. A warm function reuses it;
 * a cold one pays for one extra round trip.
 */
async function accessToken() {
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60000) {
    return cachedToken.token;
  }

  const account = serviceAccount();
  const key = await importPKCS8(
    // Vercel stores the newlines escaped when the JSON is pasted raw.
    account.private_key.replace(/\\n/g, "\n"),
    "RS256"
  );

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope:
      "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Token exchange failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const body = await response.json();
  cachedToken = {
    token: body.access_token,
    expiresAtMs: Date.now() + (body.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

/**
 * Read a database path. Returns { value, etag }.
 *
 * The ETag is requested so the caller can do a compare-and-swap on write. The
 * REST API has no transactions, and a read-then-blind-write on a quota counter
 * is exactly the shape that lets two simultaneous requests both see nine used.
 */
export async function dbGet(path) {
  const token = await accessToken();
  const response = await fetch(`${databaseUrl()}/${path}.json`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Firebase-ETag": "true",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Database read failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return {
    value: await response.json(),
    etag: response.headers.get("ETag"),
  };
}

/**
 * Write a database path, optionally only if it still matches `etag`.
 *
 * Returns false on a 412, meaning someone else wrote first and the caller
 * should re-read rather than clobber.
 */
export async function dbPut(path, value, etag) {
  const token = await accessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (etag) headers["if-match"] = etag;

  const response = await fetch(`${databaseUrl()}/${path}.json`, {
    method: "PUT",
    headers,
    body: JSON.stringify(value),
  });

  if (response.status === 412) return false; // lost the race; caller retries

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Database write failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  return true;
}
