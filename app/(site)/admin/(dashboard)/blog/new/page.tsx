"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";

export default function NewBlogPostPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: "Untitled post",
          slug: "untitled-" + Date.now().toString(36),
          excerpt: "",
          content: [{ id: "b-" + Date.now().toString(36), type: "paragraph", content: "" }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data.error as string) || res.statusText;
        const field = data.field as string | undefined;
        throw new Error(field ? `${field}: ${msg}` : msg);
      }
      const id = (data.id as string) ?? (data as { id?: string }).id;
      if (id) {
        router.replace(`/admin/blog/${id}`);
        return;
      }
      throw new Error("No post id returned");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-2xl bg-white border border-brand-dark/10 shadow-soft p-8 sm:p-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-primary/10 text-brand-primary mb-6">
          <FileText className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-brand-dark">New post</h1>
        <p className="mt-2 text-sm text-brand-muted">
          This creates a draft and opens the editor. You can set the title, slug, excerpt, cover image, and add content blocks there.
        </p>
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm" role="alert">
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-6">
          <Button onClick={handleCreate} disabled={loading} className="gap-2 min-h-[48px]" size="lg">
            {loading ? "Creating…" : (
              <>
                Start writing
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          <Link href="/admin/blog">
            <Button variant="outline" className="min-h-[48px]" size="lg">
              Cancel
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
