import { panelHeaders } from "@/lib/api";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadFolder = "brands" | "categories" | "products" | "doctors" | "banners" | "blog" | "documents" | "misc";

const send = async (file: File, folder: UploadFolder): Promise<string> => {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 5 MB`);
  const body = new FormData();
  body.append("folder", folder); // before the file, so the server knows the folder while reading it
  body.append("file", file);
  const response = await fetch("/api/admin/uploads", { method: "POST", body, credentials: "include" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Upload failed");
  return data.url as string;
};

/** Sends one image to the backend and returns the address it is now stored at. Throws with a readable message. */
export async function uploadImage(file: File, folder: UploadFolder): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
  return send(file, folder);
}

/** Sends a certificate or other proof: a PDF or an image. */
export async function uploadDocument(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) throw new Error(`${file.name} must be a PDF or an image`);
  return send(file, "documents");
}

/** A doctor uploading their own certificate while registering. */
export async function uploadMyDocument(file: File): Promise<string> {
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) throw new Error(`${file.name} must be a PDF or an image`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 5 MB`);
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/me/documents", { method: "POST", body, credentials: "include", headers: panelHeaders() });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Upload failed");
  return data.url as string;
}

/** A doctor's own profile photo. Shown to patients, so it is stored with the public images. */
export async function uploadMyPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} must be a JPG or PNG photo`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 5 MB`);
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/me/photo", { method: "POST", body, credentials: "include", headers: panelHeaders() });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Upload failed");
  return data.url as string;
}

/** A customer's photo of what arrived, attached to a return request. */
export async function uploadReturnPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} must be a JPG or PNG photo`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 5 MB`);
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/me/return-photo", { method: "POST", body, credentials: "include", headers: panelHeaders() });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Upload failed");
  return data.url as string;
}

/** A report or photo added while booking a consultation. Kept privately: only the patient, their doctor and staff can open it. */
export async function uploadConsultationFile(file: File): Promise<{ id: number; fileName: string; kind: string; size: number }> {
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) throw new Error(`${file.name} must be a PDF or a photo`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 5 MB`);
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/me/consultation-files", { method: "POST", body, credentials: "include", headers: panelHeaders() });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? "Upload failed");
  return data;
}
