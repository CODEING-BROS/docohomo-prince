// Seeds the LOCAL database: the two test logins always, and a small sample catalog
// only where a collection is still empty. Run from the repo root with `npm run seed`. Safe to re-run.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Utils = require("../utils/Utils");
const Admins = require("../modals/Admins");
const Users = require("../modals/Users");
const Categories = require("../modals/Brands"); // "Brands" collection holds the category tree
const Brands = require("../modals/Category"); // "Category" collection holds the brands
const Products = require("../modals/Products");
const Banners = require("../modals/Banners");
const Discount = require("../modals/Discount");

// local-only test logins
const ADMIN = { name: "local admin", email: "admin@local.test", password: "admin1234", user_type: "admin" };
const CUSTOMER_PHONE = 9999999999; // log in on the website with this number + LOCAL_OTP from .env

const ASSETS = `${process.env.CLIENT_URL || "http://localhost:3000"}/assets/images`;
const image = (file) => ({ image_name: file, image_url: `${ASSETS}/${file}`, path: file });

const CATEGORY_TREE = [
  { main: "homeopathy", sub: ["dilutions", "mother tinctures"], img: "category/CategoryTwo/1.png" },
  { main: "personal care", sub: ["hair care", "skin care"], img: "category/CategoryTwo/3.png" },
  { main: "nutrition", sub: ["supplements"], img: "category/CategoryTwo/5.png" },
];

const BRAND_NAMES = ["sbl", "dr reckeweg", "schwabe", "bakson"];

// [name, main category, subcategory, brand, regular price, sale price]
const PRODUCTS = [
  ["arnica montana 30 ch", "homeopathy", "dilutions", "sbl", 110, 95],
  ["nux vomica 200 ch", "homeopathy", "dilutions", "dr reckeweg", 160, 140],
  ["belladonna 30 ch", "homeopathy", "dilutions", "schwabe", 105, 90],
  ["calendula q", "homeopathy", "mother tinctures", "sbl", 220, 199],
  ["echinacea q", "homeopathy", "mother tinctures", "schwabe", 260, 235],
  ["arnica shampoo", "personal care", "hair care", "sbl", 180, 165],
  ["jaborandi hair oil", "personal care", "hair care", "bakson", 240, 210],
  ["aloe vera face wash", "personal care", "skin care", "bakson", 150, 135],
  ["calendula cream", "personal care", "skin care", "dr reckeweg", 130, 115],
  ["alfalfa tonic", "nutrition", "supplements", "sbl", 190, 170],
  ["vitamin c tablets", "nutrition", "supplements", "bakson", 210, 185],
];

const seedIfEmpty = async (Model, label, build) => {
  if (await Model.countDocuments()) return console.log(`skip  ${label} (already has data)`);
  const docs = await build();
  await Model.insertMany(docs);
  console.log(`added ${label}: ${docs.length}`);
};

const run = async () => {
  const uri = process.env.MONGODB_URI || "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) {
    throw new Error("Refusing to seed: MONGODB_URI is not a local database.");
  }
  await mongoose.connect(uri);

  // the two local test logins are always present, even next to copied production accounts
  if (!(await Admins.exists({ email: ADMIN.email }))) {
    await Admins.create({ ...ADMIN, password: await Utils.Hashing_Password(ADMIN.password) });
    console.log("added local test admin");
  }
  if (!(await Users.exists({ phone_number: CUSTOMER_PHONE }))) {
    await Users.create({
      user_id: "local_test_user",
      firstName: "Local",
      lastName: "Customer",
      username: "local customer",
      email: "customer@local.test",
      phone_number: CUSTOMER_PHONE,
      veifyedUser: true,
      joining_date: new Date(),
    });
    console.log("added local test customer");
  }

  await seedIfEmpty(Discount, "delivery charge rule", async () => [{ cap: 500, amount: 50 }]);

  await seedIfEmpty(Categories, "categories", async () =>
    CATEGORY_TREE.map((c) => ({
      main_category_name: c.main,
      main_category_slug: c.main,
      main_category_image: image(c.img),
      category_name: c.main,
      category_slug: c.main,
      category_image: image(c.img),
      subcategory: c.sub.map((name) => ({
        name,
        slug: name,
        image: image(c.img),
        parent_main_category: c.main,
        parent_category: c.main,
      })),
    }))
  );

  await seedIfEmpty(Brands, "brands", async () =>
    BRAND_NAMES.map((name, i) => ({
      main_category_name: name,
      main_category_slug: name,
      main_category_image: image(`brands/BrandsOne/${i + 1}.png`),
    }))
  );

  await seedIfEmpty(Products, "products", async () =>
    PRODUCTS.map(([name, main, sub, brand, regular, sale], i) => ({
      product_id: "prod_00" + (i + 1),
      product_code: "LOCAL-" + (i + 1),
      product_name: name,
      product_slug: name,
      product_regular_price: regular,
      product_sale_price: sale,
      quantity: 50,
      original_quantity: 50,
      new_arrival: i % 2 === 0,
      trending_product: i % 3 === 0,
      product_brand: brand,
      product_images: [image(`product/${i + 1}.png`)],
      product_main_category: main,
      product_main_category_slug: main,
      product_category: main,
      product_category_slug: main,
      product_subcategory: sub,
      product_subcategory_slug: sub,
      product_description: `sample description for ${name}. local seed data only.`,
      product_sub_description: "local seed data",
    }))
  );

  await seedIfEmpty(Banners, "banners", async () => [
    image("slider/SliderTwo/1.png"),
    image("slider/SliderTwo/2.png"),
  ]);

  await mongoose.disconnect();
  console.log("\nLocal seed done. Test logins are at the top of apps/api/scripts/seed-local.js");
};

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
