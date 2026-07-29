import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import { generateId } from "@workspace/db";
import { env } from "../lib/env";
import { requireAuth } from "../middlewares/auth";
import { badRequest } from "../lib/http-error";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);

const storage = multer.diskStorage({
  destination: env.uploadsDir,
  filename: (_req, file, cb) => {
    cb(null, `${generateId()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_EXTENSIONS.has(path.extname(file.originalname).toLowerCase()));
  },
});

const router: IRouter = Router();

router.post("/uploads", requireAuth, upload.single("file"), (req, res, next) => {
  if (!req.file) {
    next(badRequest("No file uploaded (or file type not allowed)"));
    return;
  }

  res.status(201).json({ url: `${env.apiPublicBaseUrl}/uploads/${req.file.filename}` });
});

export default router;
