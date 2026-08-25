import { extractText, getDocumentProxy } from "unpdf";

/**
 * Server-side PDF text extraction.
 *
 * This runs on the server and never in the browser — not for speed, but because
 * the client is not trusted to say what text came out of a file. A
 * client-supplied string is unbounded input we would be paying Anthropic to
 * process. The browser sends the file; the server decides what is in it.
 */
export async function extractPdfText(bytes) {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

/**
 * Collapses the whitespace debris PDF extraction produces — page headers
 * separated by runs of newlines, hard-wrapped lines, stray form feeds. Cosmetic
 * for the model, but it meaningfully cuts the token count on a 40-page syllabus,
 * and tokens are the only thing here that costs money.
 */
export function normalizeExtractedText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
