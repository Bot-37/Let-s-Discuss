import crypto from "crypto";

export function generateAnonId() {
  return "anon_" + crypto.randomBytes(8).toString("hex");
}
