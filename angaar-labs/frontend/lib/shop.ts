// Shapes used by the shop pages.

export type ProductCard = {
  id: number; name: string; slug: string; brandName: string | null; imageUrl: string | null;
  variantId: number; variantTitle: string; variantCount: number;
  price: number; mrp: number; discountPercent: number; inStock: boolean;
  rating: number; ratingCount: number; requiresPrescription: boolean;
  wholesalePrice?: number; // only for a doctor with an approved wholesale account
};

export type ShopHome = {
  banners: { id: number; title: string | null; imageUrl: string; linkUrl: string | null; platform: "DESKTOP" | "MOBILE" }[];
  categories: { id: number; name: string; slug: string; imageUrl: string | null; productCount: number }[];
  brands: { id: number; name: string; slug: string; logoUrl: string | null; productCount: number }[];
  rails: { key: string; title: string; href: string; items: ProductCard[] }[];
  wholesale: boolean;
};

export type FacetOption<V = string> = { value: V; count: number; selected: boolean };

export type Listing = {
  items: ProductCard[]; total: number; page: number; pageSize: number; pageCount: number; sort: string;
  category: { name: string; slug: string; trail: { name: string; slug: string }[] } | null;
  facets: {
    categories: { id: number; parentId: number | null; name: string; slug: string; count: number }[];
    brands: (FacetOption & { label: string })[];
    forms: FacetOption[];
    potencies: FacetOption[];
    packs: FacetOption[];
    prices: { key: string; label: string; min: number; max: number | null; count: number }[];
    priceRange: { min: number; max: number };
    discounts: { value: number; count: number }[];
    ratings: { value: number; count: number }[];
  };
  wholesale: boolean;
};

export type ProductVariant = {
  id: number; sku: string; title: string; packSize: string | null; potency: string | null; isDefault: boolean;
  mrp: number; price: number; discountPercent: number; inStock: boolean; stockLeft: number | null;
  minQuantity: number; maxQuantity: number;
  wholesale: { unitPrice: number; source: string } | null;
};

export type ProductDetail = {
  id: number; name: string; slug: string; form: string | null; shortDescription: string | null; description: string | null;
  composition: string | null; indications: string | null; directions: string | null; safetyInfo: string | null;
  manufacturer: string | null; countryOfOrigin: string | null; requiresPrescription: boolean; ratingAverage: number; ratingCount: number;
  brand: { name: string; slug: string; logoUrl: string | null } | null;
  images: { url: string; altText: string | null; variantId: number | null }[];
  variants: ProductVariant[];
  reviews: { id: number; authorName: string | null; rating: number; title: string | null; body: string | null; isVerifiedBuyer: boolean; createdAt: string }[];
  trail: { name: string; slug: string }[];
  related: ProductCard[];
  wholesale: boolean;
};

export type QuoteLine = {
  variantId: number; productName: string; slug: string; variantTitle: string; brandName: string | null; imageUrl: string | null;
  quantity: number; mrp: number; retailPrice: number; unitPrice: number; lineTotal: number; priceNote: string | null;
  minQuantity: number; maxQuantity: number; problem: string | null;
};

export type Quote = {
  channel: "D2C" | "B2B"; lines: QuoteLine[]; removed: number[]; itemCount: number;
  mrpTotal: number; subtotal: number; savings: number;
  coupon: { code: string; discount: number; description: string | null } | null; couponError: string | null;
  shippingCharge: number; freeDeliveryFrom: number | null; codAvailable: boolean; codCharge: number; grandTotal: number;
  wholesale: { businessName: string; tier: string | null; creditLimit: number; creditDays: number } | null;
  onlinePayment: boolean; onlineTest: boolean; // onlineTest: the gateway is not connected, payments are pretend
};

export type SavedAddress = { id: number; fullName: string | null; phone: string | null; line1: string; landmark: string | null; city: string | null; state: string | null; pincode: string | null; isDefault: boolean };

export type OrderDetail = {
  id: number; orderNumber: string; channel: "D2C" | "B2B"; status: string; paymentMethod: string; paymentStatus: string; placedAt: string; estimatedDelivery: string | null;
  subtotal: number; couponCode: string | null; couponDiscount: number; shippingCharge: number; codCharge: number; grandTotal: number;
  customerName: string | null; customerPhone: string | null; shippingAddress: string | null; shippingCity: string | null; shippingState: string | null; shippingPincode: string | null;
  billingName: string | null; billingGstNumber: string | null; cancelReason: string | null;
  items: { id: number; productName: string; variantTitle: string | null; brandName: string | null; imageUrl: string | null; quantity: number; mrp: number | null; unitPrice: number; lineTotal: number; slug: string | null }[];
  history: { status: string; note: string | null; createdAt: string }[];
  shipments: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string }[];
  canCancel: boolean; canPay: boolean;
  invoiceNumber: string | null; // set once the GST invoice is made
};

export const PAYMENT_LABEL: Record<string, string> = { COD: "Pay on delivery", ONLINE: "Paid online", CREDIT: "On credit", BANK_TRANSFER: "Bank transfer" };
