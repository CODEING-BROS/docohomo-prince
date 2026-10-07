"use client";

import { BlogForm, emptyPost } from "@/components/admin/blog-form";

export default function NewBlogPostPage() {
  return <BlogForm initial={emptyPost} />;
}
