"use client";

import { ProductForm, emptyProduct } from "@/components/admin/product-form";

export default function NewProductPage() {
  return <ProductForm initial={emptyProduct()} />;
}
