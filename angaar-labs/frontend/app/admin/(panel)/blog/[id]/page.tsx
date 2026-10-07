"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BlogForm, type BlogPost, type PostDraft } from "@/components/admin/blog-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const toDraft = (p: BlogPost): PostDraft => ({
  title: p.title, slug: p.slug, categoryId: p.category ? String(p.category.id) : "", excerpt: p.excerpt ?? "", content: p.content ?? "",
  coverImageUrl: p.coverImageUrl ?? "", authorName: p.authorName ?? "", authorBio: p.authorBio ?? "", authorImageUrl: p.authorImageUrl ?? "",
  status: p.status, publishedOn: p.publishedOn ?? "", seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "",
});

export default function EditBlogPostPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError } = useQuery({
    queryKey: ["blog-post", Number(id)],
    queryFn: () => api<BlogPost>(`/admin/blog/${id}`),
    // never start the form from a remembered copy: it must show what is saved right now
    gcTime: 0,
  });

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium">This post could not be found</p>
        <Button asChild variant="outline" className="mt-3"><Link href="/admin/blog">Back to blog</Link></Button>
      </div>
    );
  }
  if (isPending || !data) {
    return <div className="grid gap-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  }
  return <BlogForm key={data.id} postId={data.id} initial={toDraft(data)} />;
}
