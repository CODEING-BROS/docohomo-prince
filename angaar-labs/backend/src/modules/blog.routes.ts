import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { type Column, EXPORT_LIMIT, idsBody, idsQuery, sendCsv, stamp } from "../lib/bulk";
import { HttpError, getPage, idParam, notFound, optionalInt, optionalString, paged } from "../lib/http";
import { prisma } from "../lib/prisma";
import { htmlToText } from "../lib/text";
import { DEFAULT_ZONE, dayInZone, dayStart, isoDay, zoneParam } from "../lib/time";
import { freeSlug, slugify } from "./catalog.routes";

// The store's blog: posts and the categories they are filed under.
export const blogRoutes = Router();

const blank = (v: unknown) => (v === "" ? undefined : v);
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number, what: string) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Keep ${what} under ${max} characters`).nullable().optional());
const imageAddress = z.union([z.url(), z.string().regex(/^\/uploads\/[\w./-]+$/)], "Upload an image, or enter a full link starting with https://");
const optionalImage = z.preprocess(emptyToNull, imageAddress.nullable().optional());

/** Reads a form; what is wrong is said in words the page can show as they are. */
const read = <T>(schema: z.ZodType<T>, body: unknown, fallback: string): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? fallback, result.error.issues);
  return result.data;
};

// ─────────────────────────────────────────────── categories

const categoryInput = z.object({ name: z.string().trim().min(1, "Give the category a name").max(80, "Keep the name under 80 characters") });

blogRoutes.get("/categories", async (_req, res) => {
  const categories = await prisma.blogCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { posts: true } } } });
  res.json({ items: categories.map(({ _count, ...c }) => ({ ...c, postCount: _count.posts })) });
});

blogRoutes.post("/categories", async (req, res) => {
  const { name } = read(categoryInput, req.body, "Check the category name");
  if (await prisma.blogCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) {
    throw new HttpError(400, "A category with this name already exists");
  }
  const slug = await freeSlug(slugify(name), async (s) => Boolean(await prisma.blogCategory.findUnique({ where: { slug: s } })));
  res.status(201).json(await prisma.blogCategory.create({ data: { name, slug } }));
});

// Renaming keeps the web address, so links to the category keep working.
blogRoutes.patch("/categories/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { name } = read(categoryInput, req.body, "Check the category name");
  if (!(await prisma.blogCategory.findUnique({ where: { id } }))) throw notFound("Category");
  if (await prisma.blogCategory.findFirst({ where: { id: { not: id }, name: { equals: name, mode: "insensitive" } } })) {
    throw new HttpError(400, "Another category already has this name");
  }
  res.json(await prisma.blogCategory.update({ where: { id }, data: { name } }));
});

// The posts in a deleted category are kept; they are simply left without a category.
blogRoutes.delete("/categories/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!(await prisma.blogCategory.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Category");
  await prisma.blogCategory.delete({ where: { id } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "blog-category.delete", entity: "BlogCategory", entityId: String(id) } });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────── posts

const POST_STATUSES = ["DRAFT", "PUBLISHED"] as const;
const SUMMARY_LENGTH = 200;

const postInput = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(200, "Keep the title under 200 characters"),
  // the last part of the post's address on the store; made from the title when left out
  slug: optionalText(160, "the web address"),
  categoryId: z.number().int().positive().nullable().optional(),
  excerpt: optionalText(1000, "the summary"),
  content: z.preprocess(emptyToNull, z.string().max(300_000, "The article is too long to save").nullable().optional()),
  coverImageUrl: optionalImage,
  authorName: optionalText(120, "the author's name"),
  authorBio: optionalText(2000, "the note about the author"),
  authorImageUrl: optionalImage,
  status: z.enum(POST_STATUSES, "Choose draft or published"),
  // a calendar day in the store's own timezone; left out, a post is dated the day it is published
  publishedOn: z.preprocess(emptyToNull, isoDay.nullable().optional()),
  seoTitle: optionalText(300, "the search title"),
  seoDescription: optionalText(1000, "the search description"),
});

/** Text pasted from other places can carry scripts; they are dropped before the article is saved. */
const safeHtml = (html: string) =>
  html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|style)\b[^>]*>/gi, "")
    // inside each remaining tag: nothing that runs on a click or on load, and no links that run code
    .replace(/<[a-z][^>]*>/gi, (tag) =>
      tag
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\b(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*/gi, "$1=$2#"),
    );

/** The opening of the article as plain text, used as the summary when none was written. */
const summaryOf = (content: string | null) => {
  const text = (htmlToText(content) ?? "").replace(/•/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= SUMMARY_LENGTH) return text || null;
  return `${text.slice(0, SUMMARY_LENGTH).replace(/\s+\S*$/, "")}…`;
};

const dayOf = (at: Date | null) => (at ? dayInZone(at, DEFAULT_ZONE) : null);
/** The moment a post dated on this day counts as published: now for today, otherwise the start of that day. */
const publishedAtFor = (day: string) => (day === dayInZone(new Date(), DEFAULT_ZONE) ? new Date() : dayStart(day, DEFAULT_ZONE));

const postInclude = { category: { select: { id: true, name: true } } } as const;
type PostRecord = Prisma.BlogPostGetPayload<{ include: typeof postInclude }>;

const postOut = (post: PostRecord) => ({ ...post, publishedOn: dayOf(post.publishedAt) });

const postFilters = z.object({
  q: optionalString,
  categoryId: optionalInt,
  status: z.preprocess(blank, z.enum(POST_STATUSES).optional()),
});

const postWhere = (filters: z.infer<typeof postFilters>) => {
  const base: Prisma.BlogPostWhereInput = {};
  if (filters.q) {
    base.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { authorName: { contains: filters.q, mode: "insensitive" } },
      { excerpt: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.categoryId) base.categoryId = filters.categoryId;
  const where: Prisma.BlogPostWhereInput = { ...base, ...(filters.status ? { status: filters.status } : {}) };
  return { base, where };
};

// drafts first, as they are still being worked on; then the newest posts
const postOrder: Prisma.BlogPostOrderByWithRelationInput[] = [{ status: "asc" }, { publishedAt: { sort: "desc", nulls: "first" } }, { id: "desc" }];

blogRoutes.get("/", async (req, res) => {
  const { page, pageSize, skip, take } = getPage(req);
  const { base, where } = postWhere(postFilters.parse(req.query));

  const [total, items, statusCounts] = await Promise.all([
    prisma.blogPost.count({ where }),
    prisma.blogPost.findMany({
      where,
      orderBy: postOrder,
      skip,
      take,
      // the article itself is left out; it is only needed when a post is opened
      select: {
        id: true, title: true, slug: true, excerpt: true, coverImageUrl: true, authorName: true, status: true,
        publishedAt: true, updatedAt: true, category: postInclude.category,
      },
    }),
    prisma.blogPost.groupBy({ by: ["status"], where: base, _count: true }),
  ]);

  res.json({
    ...paged(items, total, page, pageSize),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
  });
});

blogRoutes.get("/export", async (req, res) => {
  const filters = postFilters.extend({ ids: idsQuery, tz: zoneParam }).parse(req.query);
  const rows = await prisma.blogPost.findMany({
    where: filters.ids ? { id: { in: filters.ids } } : postWhere(filters).where,
    orderBy: postOrder,
    take: EXPORT_LIMIT,
    include: postInclude,
  });
  const columns: Column<(typeof rows)[number]>[] = [
    { header: "Title", value: (p) => p.title },
    { header: "Category", value: (p) => p.category?.name },
    { header: "Author", value: (p) => p.authorName },
    { header: "Status", value: (p) => p.status },
    { header: `Published (${filters.tz})`, value: (p) => stamp(p.publishedAt, filters.tz) },
    { header: "Web address", value: (p) => p.slug },
    { header: "Summary", value: (p) => p.excerpt },
    { header: "Cover image", value: (p) => p.coverImageUrl },
  ];
  sendCsv(res, "blog-posts", columns, rows);
});

blogRoutes.post("/bulk-delete", async (req, res) => {
  const { ids } = idsBody.parse(req.body);
  const deleted = await prisma.blogPost.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "blog-post.bulk-delete", entity: "BlogPost", changes: { ids } } });
  res.json({ deleted: deleted.count, skipped: ids.length - deleted.count });
});

blogRoutes.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const post = await prisma.blogPost.findUnique({ where: { id }, include: postInclude });
  if (!post) throw notFound("Post");
  res.json(postOut(post));
});

/** Checks shared by adding and editing. `newCategoryId` and `newDay` are only given when they are being set. */
const checkPost = async (post: { status: string; content: string | null; newCategoryId?: number | null; newDay?: string | null }) => {
  if (post.newCategoryId && !(await prisma.blogCategory.findUnique({ where: { id: post.newCategoryId }, select: { id: true } }))) {
    throw new HttpError(400, "That category no longer exists. Choose another one.");
  }
  if (post.status === "PUBLISHED" && !htmlToText(post.content)) throw new HttpError(400, "Write the article before publishing it, or save it as a draft");
  if (post.newDay && post.newDay > dayInZone(new Date(), DEFAULT_ZONE)) throw new HttpError(400, "The publish date cannot be in the future");
};

const slugTaken = (exceptId?: number) => async (slug: string) =>
  Boolean(await prisma.blogPost.findFirst({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } }));

blogRoutes.post("/", async (req, res) => {
  const { publishedOn, slug: wanted, ...input } = read(postInput, req.body, "Check the post details");
  const content = input.content ? safeHtml(input.content) : null;
  const categoryId = input.categoryId ?? null;
  await checkPost({ status: input.status, content, newCategoryId: categoryId, newDay: publishedOn });

  // a web address typed by hand must be free; one made from the title gets a number added if needed
  let slug = wanted ? slugify(wanted) : "";
  if (slug && (await slugTaken()(slug))) throw new HttpError(400, "Another post already uses this web address");
  if (!slug) slug = await freeSlug(slugify(input.title), slugTaken());

  const post = await prisma.blogPost.create({
    data: {
      ...input, slug, content, categoryId,
      excerpt: input.excerpt ?? summaryOf(content),
      publishedAt: publishedOn ? publishedAtFor(publishedOn) : input.status === "PUBLISHED" ? new Date() : null,
    },
    include: postInclude,
  });
  res.status(201).json(postOut(post));
});

blogRoutes.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { publishedOn, slug: wanted, ...input } = read(postInput.partial(), req.body, "Check the post details");
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw notFound("Post");

  const status = input.status ?? existing.status;
  const content = input.content === undefined ? existing.content : input.content ? safeHtml(input.content) : null;
  const categoryId = input.categoryId === undefined ? existing.categoryId : input.categoryId;
  const dateChanged = publishedOn !== undefined && publishedOn !== dayOf(existing.publishedAt);
  await checkPost({ status, content, newCategoryId: input.categoryId, newDay: dateChanged ? publishedOn : null });

  // the web address only changes when a new one is typed; renaming a post keeps links to it working
  const slug = wanted && wanted !== existing.slug ? slugify(wanted) : existing.slug;
  if (slug !== existing.slug && (await slugTaken(id)(slug))) throw new HttpError(400, "Another post already uses this web address");

  // the time of day is kept unless the day itself was changed
  let publishedAt = !dateChanged ? existing.publishedAt : publishedOn ? publishedAtFor(publishedOn) : null;
  if (status === "PUBLISHED" && !publishedAt) publishedAt = new Date();

  const data: Prisma.BlogPostUncheckedUpdateInput = { ...input, slug, content, categoryId, publishedAt };
  if (input.excerpt === null) data.excerpt = summaryOf(content);
  res.json(postOut(await prisma.blogPost.update({ where: { id }, data, include: postInclude })));
});

blogRoutes.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!(await prisma.blogPost.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Post");
  await prisma.blogPost.delete({ where: { id } });
  await prisma.auditLog.create({ data: { actorId: req.user!.id, action: "blog-post.delete", entity: "BlogPost", entityId: String(id) } });
  res.json({ ok: true });
});
