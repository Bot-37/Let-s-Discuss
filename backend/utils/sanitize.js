const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeText(value, { maxLength, trim = true } = {}) {
  if (typeof value !== "string") return "";

  let output = value.replace(CONTROL_CHARS, "");
  if (trim) output = output.trim();
  if (typeof maxLength === "number" && maxLength > 0) {
    output = output.slice(0, maxLength);
  }
  return output;
}

export function normalizePostContent(value, { maxLength = 5000 } = {}) {
  const cleaned = sanitizeText(value, { trim: true, maxLength });
  return cleaned
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function anonymizeAuthor(authorType, authorRef) {
  if (!authorRef) return "Anonymous";
  if (authorType === "user") {
    return `User ${String(authorRef).slice(0, 8)}`;
  }
  return `Anonymous #${String(authorRef).replace(/^anon_/, "").slice(0, 4).toUpperCase()}`;
}
