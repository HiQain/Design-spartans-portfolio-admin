import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { signAuthToken } from "../lib/auth-tokens";
import { unauthorized } from "../lib/http-error";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts count - a legitimate user logging in repeatedly
  // (multiple tabs, after a token expires, etc.) should never get locked out.
  skipSuccessfulRequests: true,
});

router.post("/auth/login", loginLimiter, async (req, res, next) => {
  const { email, password } = LoginBody.parse(req.body);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    next(unauthorized("Invalid email or password"));
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    next(unauthorized("Invalid email or password"));
    return;
  }

  const token = signAuthToken({ userId: user.id, email: user.email });
  res.json(LoginResponse.parse({ token, user: { id: user.id, email: user.email } }));
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json(GetMeResponse.parse({ id: req.user!.userId, email: req.user!.email }));
});

export default router;
