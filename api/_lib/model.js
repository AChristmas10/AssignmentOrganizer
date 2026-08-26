/**
 * Server-only. Nothing here may ever be imported by browser code — doing so
 * would put GEMINI_API_KEY in a file anyone can view-source.
 *
 * This is the entire reason Do2Date had to leave GitHub Pages. Pages serves
 * static files and nothing else, so there was no server to hold a secret.
 *
 * PROVIDER NOTE
 * -------------
 * Uses Google's Gemini API. The zod schema below is converted to the JSON
 * Schema that `responseSchema` wants, which is what forces the model to return
 * the exact shape rather than prose we would then have to parse out of a code
 * fence.
 *
 * Swapping providers later means changing this file and nothing else — the
 * endpoint imports `parseSyllabus()` and knows nothing about who answers it.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

/**
 * Flash, not Pro. A syllabus is an extraction task, not a reasoning one, and
 * Flash is on the free tier with far higher rate limits. If extraction quality
 * disappoints, fix the prompt before reaching for a bigger model.
 *
 * WHY THIS IS AN ENV VAR. It was hardcoded to "gemini-2.5-flash", which Google
 * then closed to new API keys:
 *
 *   404 NOT_FOUND — "This model models/gemini-2.5-flash is no longer available
 *   to new users. Please update your code to use models/gemini-3.6-flash"
 *
 * Note what that means: the code was fine and kept working for existing keys,
 * but any key created after the cutoff got a 404. That is not a failure a test
 * suite catches, and it will happen again — model names have a shelf life.
 * Reading it from the environment means the next deprecation is a dashboard
 * change and a redeploy, not a code change, a commit, and a push.
 */
export const SYLLABUS_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export function gemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set on this deployment.");
  }
  return new GoogleGenAI({ apiKey });
}

export const SYLLABUS_LIMITS = {
  /**
   * 3 MB. Not arbitrary: a Vercel serverless function rejects request bodies
   * over 4.5 MB and base64 inflates a file by a third, so 3 MB of PDF is ~4 MB
   * on the wire. Text-based syllabi are almost always under 1 MB; the ones that
   * aren't are scans, which have no text to read anyway. Paste is the fallback.
   */
  maxFileBytes: 3 * 1024 * 1024,
  maxCharacters: 120000,
  minExtractedCharacters: 200,
};

/**
 * What we require back before showing anything. A malformed parse is a failure,
 * not data — the Policies tab must never render a half-read policy as fact.
 *
 * Every field is nullable rather than optional. "The syllabus didn't say" is a
 * real answer worth getting back, not an absence. Both `range` and `weight` are
 * nullable for a reason that cost a bug once: a weights-only breakdown
 * ("Homework 15%") and a letters-only scale ("A 90-100") are both common, and a
 * syllabus with one usually lacks the other. Leave the model no legal way to
 * say "not given" and it writes the literal string "null" instead.
 */
export const parsedSyllabusSchema = z.object({
  grading_scale: z
    .array(
      z.object({
        label: z.string(),
        range: z.string().nullable(),
        weight: z.string().nullable(),
      })
    )
    .nullable(),
  attendance_policy: z.string().nullable(),
  late_work_policy: z.string().nullable(),
  key_dates: z.array(
    z.object({
      title: z.string(),
      date: z.string().nullable(),
      type: z.enum(["assignment", "exam", "holiday", "other"]),
      notes: z.string().nullable(),
    })
  ),
  contact_info: z
    .object({
      instructor_name: z.string().nullable(),
      email: z.string().nullable(),
      office: z.string().nullable(),
      office_hours: z.string().nullable(),
    })
    .nullable(),
});

/**
 * The same shape as JSON Schema, for `responseSchema`.
 *
 * Written out by hand rather than generated from the zod schema above. Gemini
 * accepts a subset of OpenAPI schema and rejects several things zod-to-json
 * emits ($ref, additionalProperties, anyOf-with-null for nullable). Keeping the
 * two side by side means the mismatch is visible when you edit one and forget
 * the other, instead of surfacing as a 400 at runtime.
 */
const responseSchema = {
  type: "object",
  properties: {
    grading_scale: {
      type: "array",
      nullable: true,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          range: { type: "string", nullable: true },
          weight: { type: "string", nullable: true },
        },
        required: ["label", "range", "weight"],
      },
    },
    attendance_policy: { type: "string", nullable: true },
    late_work_policy: { type: "string", nullable: true },
    key_dates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", nullable: true },
          type: {
            type: "string",
            enum: ["assignment", "exam", "holiday", "other"],
          },
          notes: { type: "string", nullable: true },
        },
        required: ["title", "date", "type", "notes"],
      },
    },
    contact_info: {
      type: "object",
      nullable: true,
      properties: {
        instructor_name: { type: "string", nullable: true },
        email: { type: "string", nullable: true },
        office: { type: "string", nullable: true },
        office_hours: { type: "string", nullable: true },
      },
      required: ["instructor_name", "email", "office", "office_hours"],
    },
  },
  required: [
    "grading_scale",
    "attendance_policy",
    "late_work_policy",
    "key_dates",
    "contact_info",
  ],
};

/**
 * The instruction that matters most is "don't invent".
 *
 * A student who reads a fabricated late-work policy and skips a deadline is
 * worse off than one who sees "not stated" and emails their professor. An
 * omission is recoverable. A confident wrong answer is not.
 */
export const SYLLABUS_SYSTEM_PROMPT = `You extract policy information from course syllabi for a student planning app.

Rules:

1. Report only what the syllabus actually says. If it does not state something, return null for that field (or an empty array for key_dates). Never infer a typical policy, fill in a plausible default, or generalize from context. "Not stated" is a correct and useful answer.

2. For policy text, quote or closely paraphrase the syllabus's own wording. Keep the specifics — percentages, day counts, penalty rates, number of allowed absences. Do not compress "10% per day, up to three days late" into "late work is penalized".

3. key_dates covers graded work and notable calendar dates. Use ISO YYYY-MM-DD only when the full date including year is determinable from the document. If the syllabus says "Week 4" or "Oct 12" with no recoverable year, set date to null and put the original wording in notes. Never guess a year.

4. key_dates type: "exam" for tests, quizzes, midterms, and finals; "assignment" for other graded work; "holiday" for no-class days and breaks; "other" for anything else worth knowing.

5. grading_scale covers both kinds of breakdown a syllabus might give, and most give only one:
   - A weighting of components ("Homework 15%, Midterm 25%") — set label and weight, and set range to null.
   - A letter-grade scale ("A 93-100, B 83-86") — set label and range, and set weight to null.
   If a syllabus lists both, include both as separate entries. Set a field to null when the syllabus does not give it. Do not write the word "null", "N/A", or a dash as the value — use an actual null.

The input may be messy: OCR artifacts, broken tables, headers and footers repeated on every page. Read through that, but do not treat garbled text as a licence to guess.`;

/**
 * Send the text, get back a validated object.
 *
 * Returns { ok: true, data, usage } or { ok: false, code }. Deliberately does
 * not throw for a bad parse: "the model returned something unusable" is an
 * expected outcome on a messy scanned document, not an exceptional one, and the
 * endpoint has a different response for it than for an outage.
 */
export async function parseSyllabus(text, { truncated = false } = {}) {
  const response = await gemini().models.generateContent({
    model: SYLLABUS_MODEL,
    config: {
      systemInstruction: SYLLABUS_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema,
      // Extraction, not composition. Low temperature keeps it close to the
      // document's own wording, which is the whole point of rule 2.
      temperature: 0,
      maxOutputTokens: 16000,
    },
    contents: `Extract the policies from this syllabus.${
      truncated
        ? " NOTE: this document was truncated, so later sections may be missing. Extract only what is present."
        : ""
    }\n\n<syllabus>\n${text}\n</syllabus>`,
  });

  const raw = response.text;
  if (!raw) {
    // A safety block or a maxOutputTokens cutoff both land here with no text.
    return { ok: false, code: "EMPTY_RESPONSE" };
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: "INVALID_MODEL_OUTPUT" };
  }

  // responseSchema makes this near-certain, but "near" is doing real work: a
  // truncated response is still valid JSON right up until it isn't.
  const parsed = parsedSyllabusSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_MODEL_OUTPUT" };
  }

  const usage = response.usageMetadata || {};
  return {
    ok: true,
    data: parsed.data,
    usage: {
      input_tokens: usage.promptTokenCount ?? null,
      output_tokens: usage.candidatesTokenCount ?? null,
    },
  };
}
