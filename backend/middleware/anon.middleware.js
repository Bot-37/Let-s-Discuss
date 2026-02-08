import { generateAnonId } from "../utils/anon.js";

const ANON_HEADER = "x-anon-id";
const ANON_ID_PATTERN = /^anon_[a-f0-9]{16}$/;

export function ensureAnonIdentity(req, res, next) {
  const incoming = req.headers[ANON_HEADER];
  const anonId =
    typeof incoming === "string" && ANON_ID_PATTERN.test(incoming)
      ? incoming
      : generateAnonId();

  req.anonId = anonId;
  res.setHeader("X-Anon-Id", anonId);
  next();
}
