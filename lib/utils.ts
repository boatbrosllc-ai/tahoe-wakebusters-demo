import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Rewrite Firebase Storage REST URL to GCS public URL so images load (firebasestorage.googleapis.com often 403s). */
export function getDisplayImageUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return url ?? "";
  try {
    const m = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
    if (m) {
      const bucket = m[1];
      const rawPath = decodeURIComponent(m[2]);
      const path = rawPath.replace(/^\/+|\/+$/g, ""); // avoid double slash in GCS URL
      const segments = path.split("/").map((s) => encodeURIComponent(s)).join("/");
      return `https://storage.googleapis.com/${bucket}/${segments}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

/** Normalize image URL for equality (e.g. decode %20 so same file matches). Use when excluding hero from gallery. */
export function normalizeImageUrlForComparison(url: string | null | undefined): string {
  if (url == null || url === "") return "";
  try {
    return decodeURIComponent(String(url)).replace(/\/+/g, "/").trim();
  } catch {
    return String(url);
  }
}
