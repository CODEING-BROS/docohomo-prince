"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Combobox } from "@/components/admin/combobox";
import { ImageField } from "@/components/admin/image-field";
import { RichText } from "@/components/admin/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PostStatus = "DRAFT" | "PUBLISHED";
export type BlogCategory = { id: number; name: string; slug: string; postCount: number };

/** A blog post as the backend returns it for editing. `publishedOn` is a calendar day (yyyy-MM-dd) in India time. */
export type BlogPost = {
  id: number; title: string; slug: string; excerpt: string | null; content: string | null; coverImageUrl: string | null;
  authorName: string | null; authorBio: string | null; authorImageUrl: string | null;
  status: PostStatus; publishedAt: string | null; publishedOn: string | null; seoTitle: string | null; seoDescription: string | null;
  category: { id: number; name: string } | null;
};

export type PostDraft = {
  title: string; slug: string; categoryId: string; excerpt: string; content: string; coverImageUrl: string;
  authorName: string; authorBio: string; authorImageUrl: string;
  status: PostStatus; publishedOn: string; seoTitle: string; seoDescription: string;
};

export const emptyPost: PostDraft = {
  title: "", slug: "", categoryId: "", excerpt: "", content: "", coverImageUrl: "",
  authorName: "", authorBio: "", authorImageUrl: "",
  status: "DRAFT", publishedOn: "", seoTitle: "", seoDescription: "",
};

const STATUSES: { value: PostStatus; label: string; hint: string }[] = [
  { value: "DRAFT", label: "Draft", hint: "Only staff can see it. Shoppers do not." },
  { value: "PUBLISHED", label: "Published", hint: "Shown on the store's blog." },
];

const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Write a new blog post, or edit one. */
export function BlogForm({ postId, initial }: { postId?: number; initial: PostDraft }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [today] = useState(todayInIndia);
  const set = <K extends keyof PostDraft>(key: K, value: PostDraft[K]) => setForm((current) => ({ ...current, [key]: value }));

  const isNew = !postId;
  const { data: categoryData } = useQuery({ queryKey: ["blog-categories"], queryFn: () => api<{ items: BlogCategory[] }>("/admin/blog/categories") });
  const categories = (categoryData?.items ?? []).map((c) => ({ value: String(c.id), label: titleCase(c.name) }));

  const save = useMutation({
    mutationFn: () => {
      const { slug, categoryId, publishedOn, ...rest } = form;
      return api<BlogPost>(isNew ? "/admin/blog" : `/admin/blog/${postId}`, {
        method: isNew ? "POST" : "PATCH",
        body: {
          ...rest,
          categoryId: categoryId ? Number(categoryId) : null,
          publishedOn: publishedOn || null,
          // a new post gets its web address from the title
          ...(isNew ? {} : { slug }),
        },
      });
    },
    onSuccess: (post) => {
      toast.success(isNew ? (post.status === "PUBLISHED" ? "Post published" : "Post saved as a draft") : "Post saved");
      ["blog-posts", "blog-post", "blog-categories"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      router.push("/admin/blog");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to blog"><Link href="/admin/blog"><ArrowLeft /></Link></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{isNew ? "Add post" : "Edit post"}</h1>
          <p className="text-sm text-muted-foreground">An article for the store&apos;s blog. Save it as a draft until it is ready to be read.</p>
        </div>
        <Button asChild variant="outline" className="h-9"><Link href="/admin/blog">Cancel</Link></Button>
        <Button type="submit" className="h-9" loading={save.isPending}>{isNew ? (form.status === "PUBLISHED" ? "Publish post" : "Save draft") : "Save changes"}
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="grid min-w-0 gap-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Post</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Title"><Input required autoFocus={isNew} maxLength={200} value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label="Summary" hint="One or two lines that tell a reader what the post is about. Leave empty to use the opening lines of the article.">
                <Textarea rows={2} maxLength={1000} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
              </Field>
              <Field label="Article" hint="Text pasted from elsewhere keeps its headings, bold text, lists and links. Fonts and colours are left behind.">
                <RichText label="Article" value={form.content} onChange={(content) => set("content", content)} placeholder="Write the article here…" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Author</CardTitle><CardDescription>Shown with the post. Leave empty if the post has no named author.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><Input maxLength={120} value={form.authorName} placeholder="Dr. Asha Verma" onChange={(e) => set("authorName", e.target.value)} /></Field>
              <div className="sm:row-span-2">
                <ImageField label="Photo" folder="blog" value={form.authorImageUrl} onChange={(authorImageUrl) => set("authorImageUrl", authorImageUrl)} />
              </div>
              <Field label="About the author"><Textarea rows={3} maxLength={2000} value={form.authorBio} onChange={(e) => set("authorBio", e.target.value)} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>In search results</CardTitle><CardDescription>How the post appears on Google. Both are optional.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Title for search results"><Input maxLength={300} value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></Field>
              <Field label="Description for search results"><Textarea rows={2} maxLength={1000} value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} /></Field>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader><CardTitle>Publishing</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Status" hint={STATUSES.find((s) => s.value === form.status)?.hint}>
                <Select value={form.status} onValueChange={(v) => set("status", v as PostStatus)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date on the post" hint="Leave empty to use the day it is published. Days are counted in India time.">
                <Input type="date" max={today} value={form.publishedOn} onChange={(e) => set("publishedOn", e.target.value)} />
              </Field>
              <Field label="Category">
                <Combobox value={form.categoryId} onChange={(v) => set("categoryId", v)} options={categories} allLabel="No category" searchPlaceholder="Search categories…" className="w-full" />
              </Field>
              {isNew ? null : (
                <Field label="Web address" hint="The last part of the post's link. Changing it breaks links people have already shared.">
                  <Input required maxLength={160} className="font-mono text-xs" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
                </Field>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cover image</CardTitle><CardDescription>The picture at the top of the post and on the blog page.</CardDescription></CardHeader>
            <CardContent>
              <ImageField label="Image" folder="blog" value={form.coverImageUrl} onChange={(coverImageUrl) => set("coverImageUrl", coverImageUrl)} hint="A wide picture works best. JPG, PNG, WebP or GIF, up to 5 MB" />
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
