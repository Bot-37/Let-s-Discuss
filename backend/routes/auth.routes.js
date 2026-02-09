import { Router } from "express";
import { adminLogin, login, me, register } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyPrefix: "auth",
});

router.post(
  "/register",
  authLimiter,
  validate({
    username: {
      required: true,
      type: "string",
      trim: true,
      minLength: 3,
      maxLength: 32,
      pattern: /^[A-Za-z0-9_]+$/,
    },
    password: {
      required: true,
      type: "string",
      minLength: 8,
      maxLength: 72,
    },
  }),
  register
);

router.post(
  "/admin/login",
  authLimiter,
  validate({
    username: {
      required: true,
      type: "string",
      trim: true,
      minLength: 3,
      maxLength: 32,
    },
    password: {
      required: true,
      type: "string",
      minLength: 8,
      maxLength: 72,
    },
  }),
  adminLogin
);

router.post(
  "/login",
  authLimiter,
  validate({
    username: {
      required: true,
      type: "string",
      trim: true,
      minLength: 3,
      maxLength: 32,
    },
    password: {
      required: true,
      type: "string",
      minLength: 8,
      maxLength: 72,
    },
  }),
  login
);

router.get(
  "/me",
  requireAuth,
  createRateLimiter({ windowMs: 60_000, max: 120, keyPrefix: "auth-me" }),
  me
);

export default router;
