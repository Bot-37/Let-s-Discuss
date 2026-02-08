import express from "express";
import cors from "cors";
import helmet from "helmet";

import { env } from "./config/env.js";
import { issueCsrfToken, csrfProtection } from "./middleware/csrf.middleware.js";
import { createRateLimiter } from "./middleware/rateLimit.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import threadRoutes from "./routes/threads.routes.js";
import postRoutes from "./routes/posts.routes.js";

const app = express();

app.use(helmet());
app.disable("x-powered-by");

if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowAnyOrigin = allowedOrigins.includes("*");
app.use(
  cors({
    origin: allowAnyOrigin ? true : allowedOrigins,
    credentials: !allowAnyOrigin,
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Anon-Id"],
    exposedHeaders: [
      "X-Anon-Id",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "Retry-After",
    ],
  })
);

app.use(express.json({ limit: env.JSON_LIMIT }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get(
  "/api/csrf-token",
  createRateLimiter({ windowMs: 60_000, max: 60, keyPrefix: "csrf" }),
  issueCsrfToken
);

app.use("/api", csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/threads", threadRoutes);
app.use("/api/posts", postRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled application error", err);
  if (res.headersSent) return;
  res.status(500).json({ message: "Internal server error" });
});

export default app;
