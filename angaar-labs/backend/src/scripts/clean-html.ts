// Converts descriptions saved as HTML by the old admin into plain text, in place.
// Safe to run again: rows without HTML are left alone.   npm run db:clean-html
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { htmlToText, looksLikeHtml, tidyBullets } from "../lib/text";

const PRODUCT_FIELDS = ["description", "shortDescription", "composition", "indications", "directions", "safetyInfo"] as const;

const run = async () => {
  let products = 0;
  const rows = await prisma.product.findMany({ select: { id: true, description: true, shortDescription: true, composition: true, indications: true, directions: true, safetyInfo: true } });
  for (const row of rows) {
    const changes: Partial<Record<(typeof PRODUCT_FIELDS)[number], string | null>> = {};
    for (const field of PRODUCT_FIELDS) {
      const value = row[field];
      if (value && looksLikeHtml(value)) changes[field] = htmlToText(value);
      else if (value && value.includes("\n\n• ")) changes[field] = tidyBullets(value);
    }
    if (Object.keys(changes).length) {
      await prisma.product.update({ where: { id: row.id }, data: changes });
      products++;
    }
  }

  let doctors = 0;
  for (const doctor of await prisma.doctorProfile.findMany({ select: { id: true, bio: true } })) {
    if (doctor.bio && looksLikeHtml(doctor.bio)) {
      await prisma.doctorProfile.update({ where: { id: doctor.id }, data: { bio: htmlToText(doctor.bio) } });
      doctors++;
    }
  }

  let others = 0;
  for (const category of await prisma.category.findMany({ select: { id: true, description: true } })) {
    if (category.description && looksLikeHtml(category.description)) {
      await prisma.category.update({ where: { id: category.id }, data: { description: htmlToText(category.description) } });
      others++;
    }
  }
  for (const enquiry of await prisma.enquiry.findMany({ select: { id: true, message: true } })) {
    if (enquiry.message && looksLikeHtml(enquiry.message)) {
      await prisma.enquiry.update({ where: { id: enquiry.id }, data: { message: htmlToText(enquiry.message) } });
      others++;
    }
  }

  console.log(`cleaned: ${products} products, ${doctors} doctor profiles, ${others} other records`);
};

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
