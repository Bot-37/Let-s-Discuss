import crypto from "crypto";

function requestId() {
  return crypto.randomBytes(8).toString("hex");
}

export function logSecurityEvent(message, context = {}) {
  const eventId = requestId();
  // Keep logs structured for incident triage without exposing raw stack traces to clients.
  console.error(`[${eventId}] ${message}`, context);
  return eventId;
}

export function sendSafeError(res, statusCode, message, logMessage, context = {}) {
  if (logMessage) {
    logSecurityEvent(logMessage, context);
  }
  return res.status(statusCode).json({ message });
}
