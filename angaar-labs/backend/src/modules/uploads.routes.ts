import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { HttpError } from "../lib/http";

// Uploads for the admin: images (brand logos, category and product images, doctor photos…)
// and, in the documents folder, PDF certificates.
// Files are kept on this server's disk under backend/uploads and served at /uploads/…
// To move to cloud storage later, only `store` below has to change.

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_BYTES = 5 * 1024 * 1024;

const FOLDERS = ["brands", "categories", "products", "doctors", "banners", "blog", "documents", "misc"] as const;

/** Recognises an image by its first bytes, so a renamed file cannot pass as one. */
export const imageType = (bytes: Buffer): "jpg" | "png" | "webp" | "gif" | null => {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a") return "gif";
  return null;
};

/** Saves the file and returns the address it can be loaded from. */
export const store = async (folder: string, extension: string, bytes: Buffer) => {
  const name = `${randomUUID()}.${extension}`;
  await mkdir(path.join(UPLOAD_DIR, folder), { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, folder, name), bytes);
  return `/uploads/${folder}/${name}`;
};

const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single("file");

export const uploadRoutes = Router();

uploadRoutes.post("/", (req, res, next) => {
  receive(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError) {
        throw new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? "The image is larger than 5 MB" : "Could not read the upload");
      }
      if (err) throw err;
      if (!req.file) throw new HttpError(400, "Choose an image to upload");

      const { folder } = z.object({ folder: z.enum(FOLDERS).default("misc") }).parse(req.body);
      const isPdf = folder === "documents" && req.file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
      const extension = isPdf ? "pdf" : imageType(req.file.buffer);
      if (!extension) {
        throw new HttpError(400, folder === "documents" ? "Upload a PDF, or a JPG, PNG or WebP image" : "Upload a JPG, PNG, WebP or GIF image");
      }

      res.status(201).json({ url: await store(folder, extension, req.file.buffer) });
    } catch (error) {
      next(error);
    }
  });
});
