import { env } from "../config/env.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validate(schema, target = "body") {
  return (req, res, next) => {
    const payload = req[target] ?? {};
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      let value = payload[field];
      const isMissing = value === undefined || value === null;

      if (rules.required && isMissing) {
        errors.push(`${field} is required`);
        continue;
      }

      if (isMissing) continue;

      if (rules.type === "string") {
        if (typeof value !== "string") {
          errors.push(`${field} must be a string`);
          continue;
        }
        if (rules.trim) {
          value = value.trim();
          payload[field] = value;
        }
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} must be at most ${rules.maxLength} characters`);
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${field} has an invalid format`);
        }
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(", ")}`);
      }
    }

    if (errors.length) {
      // Keep production responses minimal to avoid schema probing.
      if (env.EXPOSE_VALIDATION_DETAILS) {
        return res.status(400).json({ message: "Validation failed", errors });
      }
      return res.status(400).json({ message: "Invalid request payload" });
    }
    return next();
  };
}

export function validateUUIDParam(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!UUID_PATTERN.test(value ?? "")) {
      return res.status(400).json({ message: `${paramName} must be a valid UUID` });
    }
    return next();
  };
}
