"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Upload, X, FolderOpen, Link2, GripVertical } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_SIZE_MB = 8;

/** Rewrite Firebase Storage REST URL to GCS public URL so images load (firebasestorage.googleapis.com often 403s). */
function imageDisplayUrl(url: string): string {
  try {
    const m = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
    if (m) {
      const bucket = m[1];
      const path = decodeURIComponent(m[2]);
      const segments = path.split("/").map((s) => encodeURIComponent(s)).join("/");
      return `https://storage.googleapis.com/${bucket}/${segments}`;
    }
  } catch {
    /* ignore */
  }
  return url;
}

export interface PhotoUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  maxPhotos?: number;
  /** Prefix for list API and upload path (e.g. "boats/", "experiences/gallery/") */
  listPrefix?: string;
  /** Allow drag-and-drop reorder of photos */
  reorderable?: boolean;
  /** Label for the main/first image badge (e.g. "Main", "Hero"); hidden if falsy */
  mainLabel?: string;
  className?: string;
}

export function PhotoUploader({
  value,
  onChange,
  maxPhotos = 20,
  listPrefix = "boats/",
  reorderable = false,
  mainLabel = "Main",
  className,
}: PhotoUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [showFileManager, setShowFileManager] = useState(false);
  const [showPasteUrl, setShowPasteUrl] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInputId = "photo-upload-input";
  const uploadPrefix = listPrefix || "boats/";

  const addUrl = useCallback(
    (url: string) => {
      if (!url.trim()) return;
      if (value.length >= maxPhotos) return;
      if (value.includes(url.trim())) return;
      onChange([...value, url.trim()]);
      setPasteUrl("");
      setShowPasteUrl(false);
    },
    [value, maxPhotos, onChange]
  );

  const remove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= value.length) return;
      const next = [...value];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      onChange(next);
      setDragIndex(null);
      setDropIndex(null);
    },
    [value, onChange]
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/") && f.size <= MAX_SIZE_MB * 1024 * 1024);
      if (fileArray.length === 0) {
        setError("No valid images (JPEG, PNG, WebP, GIF; max 8 MB each).");
        return;
      }
      if (value.length + fileArray.length > maxPhotos) {
        setError(`Max ${maxPhotos} photos. You have ${value.length}; adding ${fileArray.length} would exceed.`);
        return;
      }
      setError(null);
      setUploading(true);
      const newUrls: string[] = [];
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const key = `${file.name}-${i}`;
        setUploadProgress((p) => ({ ...p, [key]: 0 }));
        try {
          const form = new FormData();
          form.append("file", file);
          form.append("prefix", uploadPrefix);
          const res = await fetch("/api/admin/upload", { method: "POST", credentials: "include", body: form });
          const data = await res.json().catch(() => ({}));
          setUploadProgress((p) => ({ ...p, [key]: 100 }));
          if (!res.ok) {
            throw new Error(data.error || res.statusText);
          }
          if (data.url) newUrls.push(data.url);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Upload failed");
          setUploadProgress((p) => ({ ...p, [key]: -1 }));
        }
      }
      setUploading(false);
      setUploadProgress({});
      if (newUrls.length) onChange([...value, ...newUrls]);
    },
    [value, maxPhotos, onChange, uploadPrefix]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    },
    [uploadFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files?.length) uploadFiles(files);
      e.target.value = "";
    },
    [uploadFiles]
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Current photos grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {value.map((url, i) => (
            <div
              key={`${url}-${i}`}
              draggable={reorderable}
              onDragStart={() => reorderable && setDragIndex(i)}
              onDragOver={(e) => {
                if (!reorderable || dragIndex === null) return;
                e.preventDefault();
                setDropIndex(i);
              }}
              onDragLeave={() => setDropIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (reorderable && dragIndex !== null) reorder(dragIndex, i);
                setDragIndex(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
              className={cn(
                "relative aspect-[4/3] rounded-xl overflow-hidden bg-brand-dark/5 border border-brand-dark/10 group",
                reorderable && "cursor-grab active:cursor-grabbing",
                dropIndex === i && "ring-2 ring-brand-primary ring-offset-2"
              )}
            >
              <img
                src={imageDisplayUrl(url)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                draggable={false}
              />
              {reorderable && (
                <div className="absolute top-1 left-1 flex items-center gap-1">
                  <span className="p-1 rounded bg-black/50 text-white" aria-hidden>
                    <GripVertical className="h-4 w-4" />
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 h-9 w-9 rounded-full bg-white/90 hover:bg-white text-brand-dark"
                  onClick={() => remove(i)}
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {mainLabel && i === 0 && (
                <span className="absolute bottom-1 left-1 text-[10px] font-medium bg-black/60 text-white px-1.5 py-0.5 rounded">
                  {mainLabel}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {value.length < maxPhotos && (
        <>
          {/* Drop zone: only the "browse" control opens the file dialog; clicking elsewhere does nothing */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "rounded-xl border-2 border-dashed min-h-[140px] flex flex-col items-center justify-center gap-2 p-6 transition-colors",
              dragging ? "border-brand-primary bg-brand-primary/5" : "border-brand-dark/20 hover:border-brand-dark/40 bg-brand-dark/[0.02]"
            )}
          >
            <input
              ref={inputRef}
              id={uploadInputId}
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              onChange={onInputChange}
              disabled={uploading}
              aria-label="Upload photos"
            />
            <Upload className="h-10 w-10 text-brand-muted" aria-hidden />
            <p className="text-sm font-medium text-brand-dark">
              Drag photos here or{" "}
              <label
                htmlFor={uploadInputId}
                className="cursor-pointer text-brand-primary hover:underline"
              >
                browse
              </label>
            </p>
            <p className="text-xs text-brand-muted">JPEG, PNG, WebP, GIF · max {MAX_SIZE_MB} MB each</p>
            {uploading && (
              <p className="text-xs text-brand-primary font-medium">Uploading…</p>
            )}
          </div>

          {/* Actions: Browse uploads, Paste URL */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowFileManager(true)}
              className="gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              Browse uploads
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPasteUrl(!showPasteUrl)}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" />
              Paste URL
            </Button>
          </div>

          {showPasteUrl && (
            <div className="flex gap-2">
              <input
                type="url"
                value={pasteUrl}
                onChange={(e) => setPasteUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-h-[44px] rounded-lg border border-brand-dark/20 px-3 py-2 text-sm text-brand-dark focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUrl(pasteUrl))}
                aria-label="Paste image URL"
              />
              <Button type="button" size="sm" onClick={() => addUrl(pasteUrl)}>
                Add
              </Button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </>
      )}

      {value.length >= maxPhotos && (
        <p className="text-sm text-brand-muted">Maximum {maxPhotos} photos. Remove one to add more.</p>
      )}

      {/* File manager modal */}
      {showFileManager && (
        <FileManagerModal
          prefix={listPrefix}
          onSelect={(url) => {
            addUrl(url);
            setShowFileManager(false);
          }}
          onClose={() => setShowFileManager(false)}
        />
      )}
    </div>
  );
}

function FileManagerModal({
  prefix,
  onSelect,
  onClose,
}: {
  prefix: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    fetch(`/api/admin/upload?prefix=${encodeURIComponent(prefix)}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data.files) setFiles(data.files);
        else setErr(data.error || "Failed to load");
      })
      .catch(() => setErr("Failed to load"))
      .finally(() => setLoading(false));
  }, [prefix]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Browse uploads"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-brand-dark/10">
          <h2 className="text-lg font-semibold text-brand-dark">Uploaded files</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-brand-muted text-sm">Loading…</p>}
          {err && <p className="text-red-600 text-sm">{err}</p>}
          {!loading && !err && files.length === 0 && (
            <p className="text-brand-muted text-sm">No uploads yet. Upload photos above first.</p>
          )}
          {!loading && files.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {files.map((f) => (
                <button
                  type="button"
                  key={f.name}
                  onClick={() => onSelect(f.url)}
                  className="aspect-square rounded-lg overflow-hidden border border-brand-dark/10 hover:border-brand-primary hover:ring-2 hover:ring-brand-primary/30 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  aria-label={`Select ${f.name.split("/").pop() || "image"}`}
                >
                  <img
                    src={imageDisplayUrl(f.url)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
