import type { RequestHandler } from "express";
import { verifyAuthToken } from "../lib/auth-tokens";

/** Attaches req.user when a valid bearer token is present; never rejects the request. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (token) {
    try {
      req.user = verifyAuthToken(token);
    } catch {
      // Invalid/expired token on a public route just means "treat as anonymous".
    }
  }

  next();
};
