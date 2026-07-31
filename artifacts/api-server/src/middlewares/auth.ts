import type { RequestHandler } from "express";
import { verifyAuthToken, type AuthTokenPayload } from "../lib/auth-tokens";
import { unauthorized } from "../lib/http-error";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    next(unauthorized());
    return;
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
};
