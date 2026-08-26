/**
 * The only server endpoint in Do2Date.
 *
 * It exists for one reason: GEMINI_API_KEY must stay server-side. It is not
 * a general API layer, and nothing else should move behind it — the rest of the
 * app talks to Firebase directly, and Firebase security rules are what govern
 * that. Do not re-implement authorization here.
 *
 * What it does NOT do, on purpose: persist the parsed syllabus. Do2Date's data
 * lives in localStorage with a Firebase mirror, written by the browser. Having
 * the server write results too would create a second writer for the same
 * records and a drift bug nobody would find for months. The server returns the
 * parse; the client stores it the same way it stores everything else. The one
 * thing the server does own is the quota counter, because that is the one thing
 * the client must not be able to edit.
 */
import {
  SYLLABUS_LIMITS,
  SYLLABUS_MODEL,
  parseSyllabus,
} from "../_lib/model.js";
import { firebaseAdmin, verifyCaller } from "../_lib/firebase.js";
import { claimQuotaSlot } from "../_lib/quota.js";
import { extractPdfText, normalizeExtractedText } from "../_lib/pdf.js";

// NOTE: no `export const config` here. `{ api: { bodyParser: false } }` and a
// `maxDuration` in that object are NEXT.JS conventions — this is a plain Vercel
// Node function, where they are silently ignored. Function duration is set in
// vercel.json instead, and Vercel parses the body for us: for an
// application/json request it populates `req.body` with the parsed object.
//
// That means we cannot stream-cap the body ourselves. We do not need to:
// Vercel rejects request bodies over 4.5 MB before the function is invoked, and
// the decoded file size is checked below against SYLLABUS_LIMITS.maxFileBytes.

function fail(res, status, code, message) {
  return res.status(status).json({ ok: false, code, error: message });
}

/**
 * Vercel gives us `req.body` already parsed for application/json. It is a
 * getter that throws on malformed JSON, so it is read inside a try/catch. The
 * string fallback covers a client that sends JSON under a different
 * content-type, which would otherwise arrive as text.
 */
function readJsonBody(req) {
  const body = req.body;
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return JSON.parse(body);
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8"));
  return body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "METHOD_NOT_ALLOWED", "Use POST.");
  }

  // -------------------------------------------------------------------
  // 1. Who is calling. An unauthenticated endpoint here is an open proxy
  //    to a metered API key, so this comes before anything expensive.
  // -------------------------------------------------------------------
  let uid;
  try {
    uid = await verifyCaller(req.headers.authorization);
  } catch (error) {
    // Missing or malformed service account. Refuse rather than degrade.
    console.error("[syllabus/parse] admin init failed", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return fail(
      res,
      503,
      "AUTH_UNAVAILABLE",
      "The syllabus reader isn't configured yet. Try again later."
    );
  }

  if (!uid) {
    return fail(
      res,
      401,
      "UNAUTHENTICATED",
      "Sign in to read a syllabus. Guest mode keeps your data on this device, but syllabus reading needs an account."
    );
  }

  // -------------------------------------------------------------------
  // 2. Read the request.
  // -------------------------------------------------------------------
  let body;
  try {
    body = readJsonBody(req);
  } catch {
    return fail(res, 400, "BAD_REQUEST", "That request couldn't be read.");
  }

  if (!body) {
    return fail(res, 400, "BAD_REQUEST", "That request couldn't be read.");
  }

  const mode = body.mode === "upload" ? "upload" : "paste";

  // -------------------------------------------------------------------
  // 3. Get the text. Extraction happens here, never in the browser.
  // -------------------------------------------------------------------
  let rawText;

  if (mode === "upload") {
    const fileName = String(body.fileName || "syllabus.pdf");
    const base64 = String(body.fileBase64 || "");
    if (!base64) {
      return fail(res, 400, "BAD_REQUEST", "No file was attached.");
    }

    let bytes;
    try {
      bytes = Buffer.from(base64, "base64");
    } catch {
      return fail(res, 400, "BAD_REQUEST", "That file couldn't be decoded.");
    }

    if (bytes.length > SYLLABUS_LIMITS.maxFileBytes) {
      return fail(
        res,
        413,
        "FILE_TOO_LARGE",
        "That file is over 3 MB. Upload a smaller PDF or paste the text."
      );
    }

    const lower = fileName.toLowerCase();
    const isPdf = lower.endsWith(".pdf") || bytes.subarray(0, 4).toString() === "%PDF";
    const isText = lower.endsWith(".txt") || lower.endsWith(".md");

    if (!isPdf && !isText) {
      return fail(
        res,
        415,
        "UNSUPPORTED_TYPE",
        "Upload a PDF or a .txt file, or paste the text instead."
      );
    }

    if (isPdf) {
      try {
        rawText = normalizeExtractedText(
          await extractPdfText(new Uint8Array(bytes))
        );
      } catch {
        // Password-protected and corrupt PDFs both land here.
        return fail(
          res,
          422,
          "PDF_UNREADABLE",
          "We couldn't open that PDF. If it's password-protected, remove the password or paste the text instead."
        );
      }
    } else {
      rawText = normalizeExtractedText(bytes.toString("utf8"));
    }

    // Almost no text out of a PDF means it is a scan. "That's a scanned image,
    // paste the text" is actionable; "parse failed" is not.
    if (rawText.length < SYLLABUS_LIMITS.minExtractedCharacters) {
      return fail(
        res,
        422,
        "NO_TEXT_FOUND",
        isPdf
          ? "That PDF looks like a scan — there's no text in it to read. Copy the syllabus text and paste it instead."
          : "There wasn't enough text in that file to work with."
      );
    }
  } else {
    rawText = normalizeExtractedText(String(body.text || ""));
    if (rawText.length < SYLLABUS_LIMITS.minExtractedCharacters) {
      return fail(
        res,
        400,
        "NO_TEXT_FOUND",
        "That doesn't look like enough text to be a syllabus. Paste more of it."
      );
    }
  }

  // Truncate to the token budget before spending anything on the call.
  const truncated = rawText.length > SYLLABUS_LIMITS.maxCharacters;
  const text = truncated ? rawText.slice(0, SYLLABUS_LIMITS.maxCharacters) : rawText;

  // -------------------------------------------------------------------
  // 4. Claim a quota slot BEFORE calling Anthropic.
  // -------------------------------------------------------------------
  let claim;
  try {
    const { db } = firebaseAdmin();
    claim = await claimQuotaSlot(db, uid);
  } catch (error) {
    // Fail CLOSED. Treating a failed lookup as "no parses yet" would report a
    // full allowance and let the request through, so a database blip would
    // silently disable the only guard on a metered API key.
    console.error("[syllabus/parse] quota check failed", {
      detail: error instanceof Error ? error.message : String(error),
    });
    return fail(
      res,
      503,
      "QUOTA_UNAVAILABLE",
      "We couldn't check your syllabus read allowance just now. Try again in a moment."
    );
  }

  if (!claim.ok) {
    const when = claim.state && claim.state.resetsAt
      ? ` You'll get one back on ${new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(claim.state.resetsAt)}.`
      : "";
    return fail(
      res,
      429,
      "QUOTA_EXCEEDED",
      `You've used all ${claim.state.limit} syllabus reads for this month.${when}`
    );
  }

  // -------------------------------------------------------------------
  // 5. Ask the model, with the output shape pinned down.
  // -------------------------------------------------------------------

  // Checked here rather than left to the catch below. A missing key threw a
  // plain Error with no .status, which fell through as MODEL_undefined and
  // reached the student as "unavailable right now — try again in a minute".
  // That is actively misleading: retrying cannot fix a deployment that has no
  // key, and it sends whoever is debugging to look for an outage instead of a
  // setting. A configuration mistake should say it is a configuration mistake.
  if (!process.env.GEMINI_API_KEY) {
    console.error("[syllabus/parse] GEMINI_API_KEY is not set on this deployment");
    return fail(
      res,
      503,
      "MODEL_NOT_CONFIGURED",
      "The syllabus reader isn't set up yet — the site is missing its AI key. (If you're the site owner: add GEMINI_API_KEY in Vercel and redeploy.)"
    );
  }

  try {
    const result = await parseSyllabus(text, { truncated });

    if (!result.ok) {
      return fail(
        res,
        422,
        result.code,
        "We couldn't read a clear set of policies out of that document. Try pasting just the policy sections."
      );
    }

    return res.status(200).json({
      ok: true,
      truncated,
      parsedAt: new Date().toISOString(),
      model: SYLLABUS_MODEL,
      quota: {
        used: claim.state.used + 1,
        limit: claim.state.limit,
        remaining: Math.max(0, claim.state.remaining - 1),
      },
      data: result.data,
    });
  } catch (error) {
    // Outage, rate limit, timeout, bad key — the student cannot act on the
    // distinction, so they get one honest message and a retry.
    const status = error && typeof error === "object" ? error.status : undefined;
    const code = `MODEL_${status ?? "ERROR"}`;

    // The student gets a generic message; the operator needs the real one.
    // Without this, a 400 from an unsupported parameter is indistinguishable
    // from an outage — both read "unavailable", with nothing in the logs to
    // tell them apart. That exact ambiguity cost a day once already.
    //
    // On the FREE tier a burst of 429s here is the expected failure mode, not a
    // bug: free-tier requests-per-minute is low. If students start seeing this,
    // that is the signal to enable billing, not to change the code.
    console.error("[syllabus/parse] model call failed", {
      code,
      model: SYLLABUS_MODEL,
      detail: error instanceof Error ? error.message : String(error),
    });

    return fail(
      res,
      502,
      code,
      "The syllabus reader is unavailable right now. Try again in a minute."
    );
  }
}
