import crypto from "crypto";
import { env } from "../config/env.js";

export const ANON_ID_PATTERN = /^anon_[a-f0-9]{16}$/;

export function generateAnonId() {
  return "anon_" + crypto.randomBytes(8).toString("hex");
}

function signatureForAnonId(anonId) {
  return crypto.createHmac("sha256", env.ANON_COOKIE_SECRET).update(anonId).digest("base64url");
}

export function signAnonId(anonId) {
  return `${anonId}.${signatureForAnonId(anonId)}`;
}

export function verifySignedAnonId(value) {
  if (typeof value !== "string" || value.length === 0) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const anonId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!ANON_ID_PATTERN.test(anonId) || signature.length === 0) return null;

  const expected = signatureForAnonId(anonId);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  return anonId;
}
