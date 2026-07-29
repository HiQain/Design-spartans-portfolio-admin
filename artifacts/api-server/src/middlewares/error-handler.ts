import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod/v4";
import { HttpError } from "../lib/http-error";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request body", issues: err.issues });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
};
