-- DocHomoeo relational schema (PostgreSQL).
-- The staging tables the old site's data is first copied into (schema "legacy_import"), before it is turned into the new tables.
-- Every table keeps mongo_id (the original MongoDB _id) so rows can be traced back.


-- ---------------------------------------------------------------- people
CREATE TABLE admins (
  id            BIGSERIAL PRIMARY KEY,
  mongo_id      CHAR(24) UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,              -- bcrypt
  role          TEXT NOT NULL,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
);

CREATE TABLE users (
  id               BIGSERIAL PRIMARY KEY,
  mongo_id         CHAR(24) UNIQUE,
  user_code        TEXT,                    -- old "user_id"
  username         TEXT,
  first_name       TEXT,
  last_name        TEXT,
  email            TEXT,
  phone_number     TEXT NOT NULL UNIQUE,
  alternate_phone  TEXT,
  is_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  gender           TEXT,
  house_number     TEXT,
  address          TEXT,
  town             TEXT,
  city             TEXT,
  state            TEXT,
  country          TEXT,
  pincode          TEXT,
  business_name    TEXT,
  transport_detail TEXT,
  reward_points    INTEGER NOT NULL DEFAULT 0,
  orders_count     INTEGER NOT NULL DEFAULT 0,
  joined_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ
);
CREATE INDEX users_email_idx ON users (lower(email));

-- ---------------------------------------------------------------- catalog
-- One tree instead of the old main_category / category / subcategory[] documents.
-- level 1 = main category, 2 = category, 3 = subcategory.
CREATE TABLE categories (
  id         BIGSERIAL PRIMARY KEY,
  parent_id  BIGINT REFERENCES categories (id) ON DELETE CASCADE,
  level      SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  image_name TEXT,
  image_url  TEXT,
  image_path TEXT,
  mongo_id   CHAR(24),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX categories_parent_name_idx ON categories (COALESCE(parent_id, 0), name);

CREATE TABLE brands (
  id         BIGSERIAL PRIMARY KEY,
  mongo_id   CHAR(24) UNIQUE,
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL,
  image_name TEXT,
  image_url  TEXT,
  image_path TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE products (
  id                 BIGSERIAL PRIMARY KEY,
  mongo_id           CHAR(24) UNIQUE,
  code               TEXT,                  -- old "product_id", e.g. prod_00467
  sku                TEXT,                  -- old "product_code"
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL,
  variant            TEXT,
  regular_price      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sale_price         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock_quantity     INTEGER NOT NULL DEFAULT 0,
  original_quantity  INTEGER NOT NULL DEFAULT 0,
  min_order_quantity INTEGER,
  max_order_quantity INTEGER,
  reward_points      INTEGER NOT NULL DEFAULT 0,
  is_new_arrival     BOOLEAN NOT NULL DEFAULT FALSE,
  is_trending        BOOLEAN NOT NULL DEFAULT FALSE,
  color              TEXT,
  size               TEXT,
  brand_id           BIGINT REFERENCES brands (id) ON DELETE SET NULL,
  category_id        BIGINT REFERENCES categories (id) ON DELETE SET NULL,  -- deepest matching node
  -- names exactly as stored on the product; some do not match any brand/category row
  brand_name         TEXT,
  main_category_name TEXT,
  category_name      TEXT,
  subcategory_name   TEXT,
  description        TEXT,
  sub_description    TEXT,
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
);
CREATE INDEX products_slug_idx ON products (slug);
CREATE INDEX products_brand_idx ON products (brand_id);
CREATE INDEX products_category_idx ON products (category_id);

CREATE TABLE product_images (
  id         BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  image_name TEXT,
  image_url  TEXT,
  image_path TEXT,
  mongo_id   CHAR(24)
);
CREATE INDEX product_images_product_idx ON product_images (product_id, position);

CREATE TABLE product_reviews (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  user_id     BIGINT REFERENCES users (id) ON DELETE SET NULL,
  user_ref    TEXT,                         -- reviewer id as stored
  username    TEXT,
  body        TEXT,
  rating      NUMERIC(3, 1),
  reviewed_on TEXT,                         -- free-text date as stored
  mongo_id    CHAR(24)
);
CREATE INDEX product_reviews_product_idx ON product_reviews (product_id);

-- ---------------------------------------------------------------- orders
CREATE TABLE orders (
  id                      BIGSERIAL PRIMARY KEY,
  mongo_id                CHAR(24) UNIQUE,
  order_code              TEXT NOT NULL,    -- old "order_id"
  user_id                 BIGINT REFERENCES users (id) ON DELETE SET NULL,
  customer_name           TEXT,
  customer_phone          TEXT,
  customer_email          TEXT,
  status                  TEXT NOT NULL,
  payment_method          TEXT NOT NULL,    -- 'cod' or 'prepaid'
  transaction_id          TEXT,             -- old "tid" for prepaid orders
  payment_type            TEXT,
  razorpay_payment_id     TEXT,
  total_amount            NUMERIC(12, 2),
  total_amount_raw        TEXT,             -- as stored (was a string)
  delivery_charges        NUMERIC(12, 2),
  shipping_address        TEXT,
  town                    TEXT,
  state                   TEXT,
  pincode                 TEXT,
  estimated_delivery_date DATE,
  created_at              TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ
);
CREATE INDEX orders_code_idx ON orders (order_code);
CREATE INDEX orders_user_idx ON orders (user_id);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_created_idx ON orders (created_at DESC);

CREATE TABLE order_items (
  id               BIGSERIAL PRIMARY KEY,
  order_id         BIGINT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id       BIGINT REFERENCES products (id) ON DELETE SET NULL,
  product_mongo_id TEXT,
  product_code     TEXT,
  sku              TEXT,
  name             TEXT,
  brand            TEXT,
  category         TEXT,
  unit_price       NUMERIC(12, 2),
  regular_price    NUMERIC(12, 2),
  quantity         INTEGER NOT NULL DEFAULT 1,
  rating           NUMERIC(3, 1),
  image_url        TEXT,
  is_delivered     BOOLEAN,
  mongo_id         CHAR(24)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);

CREATE TABLE coupons (
  id             BIGSERIAL PRIMARY KEY,
  mongo_id       CHAR(24) UNIQUE,
  code           TEXT NOT NULL,             -- old "title"
  description    TEXT,
  has_order_cap  BOOLEAN NOT NULL DEFAULT FALSE,
  order_cap      NUMERIC(12, 2),
  discount_type  TEXT,
  discount_value NUMERIC(12, 2),
  expires_at     TIMESTAMPTZ
);

-- delivery is charged when the order total is below order_cap
CREATE TABLE delivery_rules (
  id        BIGSERIAL PRIMARY KEY,
  mongo_id  CHAR(24) UNIQUE,
  order_cap NUMERIC(12, 2) NOT NULL,
  charge    NUMERIC(12, 2) NOT NULL
);

CREATE TABLE payment_history (
  id                  BIGSERIAL PRIMARY KEY,
  mongo_id            CHAR(24) UNIQUE,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  amount              NUMERIC(12, 2),
  user_ref            TEXT,
  created_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ
);

-- ---------------------------------------------------------------- content
CREATE TABLE banners (
  id         BIGSERIAL PRIMARY KEY,
  mongo_id   CHAR(24) UNIQUE,
  placement  TEXT NOT NULL CHECK (placement IN ('desktop', 'mobile')),
  image_name TEXT,
  image_url  TEXT,
  image_path TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE blog_categories (
  id         BIGSERIAL PRIMARY KEY,
  mongo_id   CHAR(24) UNIQUE,
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE blogs (
  id                 BIGSERIAL PRIMARY KEY,
  mongo_id           CHAR(24) UNIQUE,
  title              TEXT NOT NULL,
  slug               TEXT NOT NULL,
  meta_title         TEXT,
  meta_description   TEXT,
  category_id        BIGINT REFERENCES blog_categories (id) ON DELETE SET NULL,
  category_name      TEXT,
  author_name        TEXT,
  author_bio         TEXT,
  author_social_link TEXT,
  author_image_url   TEXT,
  body               TEXT,                  -- old "about_blog"
  image_name         TEXT,
  image_url          TEXT,
  image_path         TEXT,
  selected_products  JSONB NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ
);
CREATE INDEX blogs_slug_idx ON blogs (slug);

CREATE TABLE blog_sections (
  id       BIGSERIAL PRIMARY KEY,
  blog_id  BIGINT NOT NULL REFERENCES blogs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title    TEXT,
  body     TEXT,
  mongo_id CHAR(24)
);
CREATE INDEX blog_sections_blog_idx ON blog_sections (blog_id, position);

-- ---------------------------------------------------------------- doctors
CREATE TABLE doctors (
  id               BIGSERIAL PRIMARY KEY,
  mongo_id         CHAR(24) UNIQUE,
  doctor_code      TEXT,                    -- old "doctor_id"
  name             TEXT NOT NULL,
  experience_years NUMERIC(5, 1),
  specialization   TEXT,
  languages        TEXT,
  description      TEXT,
  image_name       TEXT,
  image_url        TEXT,
  image_path       TEXT,
  start_time       TEXT,
  end_time         TEXT,
  is_available     BOOLEAN NOT NULL DEFAULT TRUE,
  video_fee        NUMERIC(12, 2),
  call_fee         NUMERIC(12, 2),
  appointments     JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ
);

CREATE TABLE doctor_enquiries (
  id                BIGSERIAL PRIMARY KEY,
  mongo_id          CHAR(24) UNIQUE,
  doctor_id         BIGINT REFERENCES doctors (id) ON DELETE SET NULL,
  doctor_code       TEXT,
  doctor_name       TEXT,
  patient_name      TEXT,
  phone_number      TEXT,
  consultation_type TEXT,
  message           TEXT,
  created_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ
);

-- ---------------------------------------------------------------- enquiries
CREATE TABLE wholesale_enquiries (
  id           BIGSERIAL PRIMARY KEY,
  mongo_id     CHAR(24) UNIQUE,
  product_code TEXT,
  product_name TEXT,
  name         TEXT,
  phone_number TEXT,
  email        TEXT,
  country      TEXT,
  quantity     INTEGER,
  message      TEXT,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
);

CREATE TABLE contact_messages (
  id           BIGSERIAL PRIMARY KEY,
  mongo_id     CHAR(24) UNIQUE,
  name         TEXT,
  email        TEXT,
  phone_number TEXT,
  message      TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
);

CREATE TABLE order_enquiries (
  id           BIGSERIAL PRIMARY KEY,
  mongo_id     CHAR(24) UNIQUE,
  order_ref    TEXT,
  user_ref     TEXT,
  username     TEXT,
  phone_number TEXT,
  message      TEXT,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
);
