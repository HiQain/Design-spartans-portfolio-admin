import jwt from "jsonwebtoken";
import { env } from "./env";

const TOKEN_TTL = "24h";

export interface AuthTokenPayload {
  userId: number;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}
