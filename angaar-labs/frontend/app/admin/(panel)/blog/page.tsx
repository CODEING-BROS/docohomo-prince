"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderOpen, Newspaper, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import type { BlogCategory, PostStatus } from "@/components/admin/blog-form";
import { BulkActions, SelectPage, SelectRow, useSelection } from "@/components/admin/bulk";
import { EmptyState, PageHeader, PaginationBar, SearchInput, StatusBadge, Thumb } from "@/components/admin/parts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlState } from "@/hooks/use-url-state";
import { api } from "@/lib/api";
import { formatDate, formatNumber, titleCase } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { FilterChips } from "@/components/custom/filter-chips";
import { SectionCard } from "@/components/custom/section-card";
import { ButtonSpinner, Spinner } from "@/components/custom/loaders";

/** A post as the list shows it; the article itself is only loaded when the post is opened. */
type PostRow = {
  id: number; title: string; slug: string; excerpt: string | null; coverImageUrl: string | null; authorName: string | null;
  status: PostStatus; publishedAt: string | null; updatedAt: string; category: { id: number; name: string } | null;
};
type PostList = Paged<PostRow> & { statusCounts: Partial<Record<PostStatus, number>> };

const STATUSES: PostStatus[] = ["DRAFT", "PUBLISHED"];
const STATUS: Record<PostStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "DRAFT" },
  PUBLISHED: { label: "Published", tone: "ACTIVE" },
};

const postCount = (count: number) => `${formatNumber(count)} ${count === 1 ? "post" : "posts"}`;

/** Add, rename and delete the categories posts are filed under. */
function CategoriesDialog({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: BlogCategory[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState<BlogCategory | null>(null);

  const refresh = () => ["blog-categories", "blog-posts"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const add = useMutation({
    mutationFn: () => api("/admin/blog/categories", { method: "POST", body: { name } }),
    onSuccess: () => { toast.success("Category added"); setName(""); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const rename = useMutation({
    mutationFn: (category: { id: number; name: string }) => api(`/admin/blog/categories/${category.id}`, { method: "PATCH", body: { name: category.name } }),
    onSuccess: () => { toast.success("Category renamed"); setRenaming(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: (category: BlogCategory) => api(`/admin/blog/categories/${category.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Category deleted"); setDeleting(null); refresh(); },
    onError: (err) => toast.error(err.message),
  });

  const close = () => { setRenaming(null); setDeleting(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Blog categories</DialogTitle>
          <DialogDescription>Readers use these to find posts on one subject.</DialogDescription>
        </DialogHeader>

        {categories.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No categories yet. Add the first one below.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {categories.map((category) => (
              <li key={category.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5 text-sm">
                {renaming?.id === category.id ? (
                  <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); rename.mutate(renaming); }}>
                    <Input autoFocus required maxLength={80} className="h-8" aria-label={`New name for ${category.name}`} value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
                    <Button type="submit" size="icon-sm" aria-label="Save the new name" disabled={rename.isPending}>{rename.isPending ? <Spinner size="sm" /> : <Check />}</Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel renaming" onClick={() => setRenaming(null)}><X /></Button>
                  </form>
                ) : deleting?.id === category.id ? (
                  <>
                    <p className="flex-1">
                      Delete {titleCase(category.name)}?
                      <span className="block text-xs text-muted-foreground">
                        {category.postCount ? `Its ${postCount(category.postCount)} are kept, without a category.` : "No posts are in it."}
                      </span>
                    </p>
                    <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(category)}>
                      {remove.isPending ? <ButtonSpinner /> : null}Delete
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>Keep</Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{titleCase(category.name)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground ledger">{postCount(category.postCount)}</span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Rename ${category.name}`} onClick={() => { setDeleting(null); setRenaming({ id: category.id, name: category.name }); }}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${category.name}`} onClick={() => { setRenaming(null); setDeleting(category); }}><Trash2 /></Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <Input required maxLength={80} className="h-9" placeholder="New category, for example: Skin care" aria-label="Name of the new category" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" className="h-9" disabled={add.isPending || !name.trim()}>
            {add.isPending ? <Spinner size="sm" /> : <Plus />}
            Add
          </Button>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlogView() {
  const url = useUrlState();
  const queryClient = useQueryClient();
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState<PostRow | null>(null);

  const filters = {
    q: url.get("q"), categoryId: url.get("categoryId"), status: url.get("status"),
    page: url.get("page") || "1", pageSize: url.get("pageSize") || "20",
  };
  const { data, isPending, isError } = useQuery({
    queryKey: ["blog-posts", filters],
    queryFn: () => api<PostList>("/admin/blog", { query: filters }),
    placeholderData: (previous) => previous,
  });
  const { data: categoryData } = useQuery({ queryKey: ["blog-categories"], queryFn: () => api<{ items: BlogCategory[] }>("/admin/blog/categories") });
  const categories = categoryData?.items ?? [];
  const selection = useSelection((data?.items ?? []).map((post) => post.id));

  const remove = useMutation({
    mutationFn: (post: PostRow) => api(`/admin/blog/${post.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Post deleted");
      setDeleting(null);
      ["blog-posts", "blog-categories"].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err) => toast.error(err.message),
  });

  const counts = data?.statusCounts ?? {};
  const tabs = [
    { value: "", label: "All", count: Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0) },
    ...STATUSES.map((s) => ({ value: s as string, label: STATUS[s].label, count: counts[s] ?? 0 })),
  ];

  return (
    <>
      <PageHeader title="Blog" description="Articles on the store's blog. A draft stays hidden from shoppers until you publish it.">
        <Button variant="outline" className="h-9" onClick={() => setManaging(true)}><FolderOpen /> Categories</Button>
        <Button asChild className="h-9"><Link href="/admin/blog/new"><Plus /> Add post</Link></Button>
      </PageHeader>

      <FilterChips ariaLabel="Status" className="mb-3" value={filters.status || "all"} onChange={(v) => url.set({ status: v === "all" ? "" : v })} options={tabs.map((tab) => ({ value: tab.value || "all", label: tab.label, count: tab.count }))} />

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-foreground/18 bg-surface-2 px-3 py-2">
          <SearchInput value={filters.q} onChange={(q) => url.set({ q })} placeholder="Title, author or summary" className="w-full sm:w-72" />
          <Select value={filters.categoryId || "all"} onValueChange={(v) => url.set({ categoryId: v === "all" ? "" : v })}>
            <SelectTrigger className="h-9 w-48" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{titleCase(category.name)}</SelectItem>)}
            </SelectContent>
          </Select>
          {url.hasAny ? <Button variant="ghost" className="h-9" onClick={url.clear}>Clear filters</Button> : null}
          <BulkActions table="blog" noun="posts" selection={selection} filters={filters} refresh={["blog-posts", "blog-categories"]} />
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load the blog. Check that the backend is running.</p>
        ) : isPending || !data ? (
          <div className="grid gap-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title={url.hasAny ? "No posts match" : "No posts yet"}
            description={url.hasAny ? "Try a different search, or clear the filters." : "Write the first post and it will appear on the store's blog once you publish it."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4"><SelectPage selection={selection} noun="posts" /></TableHead>
                <TableHead>Post</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="w-24 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((post) => (
                <TableRow key={post.id} data-state={selection.has(post.id) ? "selected" : undefined}>
                  <TableCell className="pl-4"><SelectRow selection={selection} id={post.id} label={post.title} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Thumb src={post.coverImageUrl} name={post.title} className="w-16" />
                      <div className="min-w-0">
                        <Link href={`/admin/blog/${post.id}`} className="block max-w-96 truncate font-medium hover:underline" title={post.title}>{post.title}</Link>
                        <div className="max-w-96 truncate text-xs text-muted-foreground">{post.excerpt || "No summary"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{post.category ? titleCase(post.category.name) : <span className="text-muted-foreground">None</span>}</TableCell>
                  <TableCell className="max-w-40 truncate">{post.authorName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><StatusBadge status={STATUS[post.status].tone} label={STATUS[post.status].label} /></TableCell>
                  <TableCell className="text-muted-foreground">{post.status === "PUBLISHED" && post.publishedAt ? formatDate(post.publishedAt) : "—"}</TableCell>
                  <TableCell className="pr-4 text-right whitespace-nowrap">
                    <Button asChild variant="ghost" size="icon-sm" aria-label={`Edit ${post.title}`}><Link href={`/admin/blog/${post.id}`}><Pencil /></Link></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${post.title}`} onClick={() => setDeleting(post)}><Trash2 /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {data ? (
          <PaginationBar
            page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} noun="posts"
            onPage={(page) => url.set({ page })} onPageSize={(pageSize) => url.set({ pageSize })}
          />
        ) : null}
      </SectionCard>

      <CategoriesDialog open={managing} onClose={() => setManaging(false)} categories={categories} />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              “{deleting?.title}” is removed from the store straight away and cannot be brought back. To take it off the store for a while, edit it and set it to Draft instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!deleting || remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending ? <ButtonSpinner /> : null}Delete post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function BlogPage() {
  return (
    <Suspense>
      <BlogView />
    </Suspense>
  );
}
