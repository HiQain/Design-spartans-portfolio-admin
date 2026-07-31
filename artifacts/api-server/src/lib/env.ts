import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required but was not provided.`);
  return value;
}

export const env = {
  jwtSecret: required("JWT_SECRET"),
  uploadsDir: process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(process.cwd(), "uploads"),
  apiPublicBaseUrl: (process.env.API_PUBLIC_BASE_URL ?? "").replace(/\/+$/, ""),
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
