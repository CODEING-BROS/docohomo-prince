// What search engines and shared links show for a page: a title and a short description.
// Staff can type their own for any product or blog post. When they leave them empty, good ones are
// written automatically from the product's or post's own details, so nothing is ever missing and
// nothing goes stale when a name or description changes.

export const SEO_TITLE_MAX = 60; // longer titles are cut off in search results
export const SEO_DESCRIPTION_MAX = 155;
const SITE = "DocHomoeo";

const titleCase = (value: string) => value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const tidy = (text: string | null | undefined) => (text ?? "").replace(/<[^>]+>/g, " ").replace(/[•\n\r\t]+/g, " ").replace(/\s+/g, " ").trim();

/** Shortens text at a word, never in the middle of one. */
const clip = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).replace(/[\s,;:.-]+$/, "")}…`;
};

export type Seo = { title: string; description: string; titleIsAutomatic: boolean; descriptionIsAutomatic: boolean };

export const productSeo = (product: {
  name: string; seoTitle?: string | null; seoDescription?: string | null; shortDescription?: string | null; description?: string | null;
  indications?: string | null; form?: string | null; brandName?: string | null;
}): Seo => {
  const name = titleCase(product.name.trim());
  const brand = product.brandName ? titleCase(product.brandName.trim()) : null;
  const typedTitle = product.seoTitle?.trim();
  const typedDescription = product.seoDescription?.trim();

  // the fullest title that fits: name + what to do + shop name, dropping the middle part first
  const candidates = [`${name} - Buy Online at Best Price | ${SITE}`, `${name} - Buy Online | ${SITE}`, `${name} | ${SITE}`];
  const title = typedTitle || candidates.find((c) => c.length <= SEO_TITLE_MAX) || clip(name, SEO_TITLE_MAX);

  const about = tidy(product.shortDescription) || tidy(product.indications) || tidy(product.description);
  const opening = `Buy ${name} online at ${SITE}${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `, by ${brand}` : ""}.`;
  const description = typedDescription
    || clip(about.length >= 50 ? `${opening} ${about}` : `${opening} Genuine ${product.form ? product.form.toLowerCase() : "homeopathic medicine"}, best price, delivered across India.`, SEO_DESCRIPTION_MAX);

  return { title, description, titleIsAutomatic: !typedTitle, descriptionIsAutomatic: !typedDescription };
};

export const blogSeo = (post: { title: string; seoTitle?: string | null; seoDescription?: string | null; excerpt?: string | null; content?: string | null }): Seo => {
  const typedTitle = post.seoTitle?.trim();
  const typedDescription = post.seoDescription?.trim();
  const heading = post.title.trim();
  const title = typedTitle || (`${heading} | ${SITE}`.length <= SEO_TITLE_MAX ? `${heading} | ${SITE}` : clip(heading, SEO_TITLE_MAX));
  const description = typedDescription || clip(tidy(post.excerpt) || tidy(post.content) || heading, SEO_DESCRIPTION_MAX);
  return { title, description, titleIsAutomatic: !typedTitle, descriptionIsAutomatic: !typedDescription };
};
