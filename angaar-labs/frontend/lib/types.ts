// Shapes returned by the backend's /api/admin endpoints.

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; pageCount: number };

/** The signed-in staff member. `permissions` lists what their role allows, like "orders.view" and "orders.manage". */
export type SessionUser = { id: number; role: string; name: string | null; email: string | null; roleName?: string; permissions?: string[] };

export type OrderStatus =
  | "PENDING" | "CONFIRMED" | "PROCESSING" | "PACKED" | "SHIPPED" | "OUT_FOR_DELIVERY"
  | "DELIVERED" | "CANCELLED" | "UNDELIVERED" | "RETURN_REQUESTED" | "RETURNED" | "REFUNDED";

export type Channel = "D2C" | "B2B";

export type Metric = { value: number; change: number | null };

export type Dashboard = {
  range: { from: string; to: string; unit: "day" | "month"; firstOrderDay: string };
  totals: { revenue: Metric; orders: Metric; averageOrderValue: Metric; newCustomers: Metric };
  series: { date: string; d2c: number; b2b: number; orders: number }[];
  ordersByStatus: { status: OrderStatus; count: number }[];
  salesByChannel: { channel: Channel; orders: number; revenue: number }[];
  salesByPaymentMethod: { method: string; orders: number; revenue: number }[];
  topProducts: { productId: number | null; name: string; units: number; revenue: number }[];
  topBrands: { name: string; units: number; revenue: number }[];
  recentOrders: OrderRow[];
  counters: {
    activeProducts: number; activeVariants: number; outOfStock: number; lowStock: number;
    openOrders: number; doctorsToVerify: number; b2bToApprove: number;
  };
};

export type OrderRow = {
  id: number; orderNumber: string; customerName: string | null; customerPhone?: string | null;
  channel: Channel; status: OrderStatus; paymentStatus?: string; paymentMethod: string;
  grandTotal: number; placedAt: string; itemCount: number; shippingCity?: string | null; shippingState?: string | null;
};

export type OrderDetail = OrderRow & {
  customerEmail: string | null; shippingAddress: string | null; shippingPincode: string | null;
  subtotal: number; discountTotal: number; couponCode: string | null; couponDiscount: number;
  shippingCharge: number; codCharge: number; taxTotal: number; legacyStatus: string | null;
  customerNote: string | null; adminNote: string | null; billingName: string | null; billingGstNumber: string | null;
  invoiceNumber: string | null; invoicedAt: string | null;
  items: {
    id: number; productName: string; variantTitle: string | null; sku: string | null; brandName: string | null;
    imageUrl: string | null; quantity: number; mrp: number | null; unitPrice: number; lineTotal: number;
  }[];
  history: { id: number; status: OrderStatus; note: string | null; createdAt: string }[];
  payments: { id: number; provider: string; providerRef: string | null; amount: number; status: string; paidAt: string | null }[];
  b2bAccount: { id: number; businessName: string; type: string } | null;
  shipments: Shipment[];
};

export type ShipmentStatus = "PENDING" | "PICKUP_SCHEDULED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RTO" | "LOST" | "CANCELLED";

export type Shipment = {
  id: number; orderId: number; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null;
  providerRef: string | null; providerOrderId: string | null; labelUrl: string | null; lastCheckedAt: string | null;
  problem: string | null; status: ShipmentStatus; weightGrams: number | null; shippingCost: number | null;
  estimatedDelivery: string | null; shippedAt: string | null; deliveredAt: string | null;
  trackingEvents: { at: string; status: string; place: string | null }[] | null; createdAt: string;
};

export type ShippingSettings = {
  mode: "off" | "manual" | "auto"; bookCourier: boolean; pickupPlace: string; pickupPincode: string;
  weightKg: number; lengthCm: number; breadthCm: number; heightCm: number;
};

export type ShiprocketStatus = {
  connected: boolean; testMode?: boolean; settings: ShippingSettings;
  pickupPlaces: { name: string; city: string; pincode: string; verified: boolean }[]; error: string | null;
};

export type ProductRow = {
  id: number; name: string; slug: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; form: string | null;
  brand: { id: number; name: string } | null; category: { id: number; name: string } | null;
  imageUrl: string | null; variantCount: number; variantTitles: string[]; sku: string | null;
  priceMin: number; priceMax: number; stock: number; createdAt: string; updatedAt: string;
};

export type ProductDetail = {
  id: number; name: string; slug: string; status: string; form: string | null;
  shortDescription: string | null; description: string | null; legacyCode: string | null;
  brand: { id: number; name: string } | null;
  category: { id: number; name: string; parent: { id: number; name: string } | null } | null;
  images: { id: number; url: string; variantId: number | null }[];
  variants: {
    id: number; sku: string; title: string; packSize: string | null; potency: string | null;
    mrp: number; sellingPrice: number; b2bPrice: number | null; stockQuantity: number; lowStockThreshold: number; isDefault: boolean;
  }[];
  _count: { reviews: number; orderItems: number };
};

export type Lookups = {
  brands: { id: number; name: string }[];
  categories: { id: number; name: string; parentId: number | null }[];
};

export type CustomerRow = {
  id: number; name: string | null; phone: string | null; email: string | null; isActive: boolean;
  phoneVerifiedAt: string | null; createdAt: string; city: string | null; state: string | null;
  orderCount: number; totalSpent: number; lastOrderAt: string | null;
  b2bAccount: { id: number; type: string; status: string } | null;
};

export type VerificationStatus = "DRAFT" | "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";

export type DoctorRow = {
  id: number; displayName: string; photoUrl: string | null; qualification: string | null; specialization: string | null;
  experienceYears: number | null; languages: string[]; registrationNumber: string | null;
  verificationStatus: VerificationStatus; acceptsConsultations: boolean; videoFee: number | null; audioFee: number | null;
  phone: string | null; email: string | null; documentCount: number; appointmentCount: number; createdAt: string;
  wholesaleStatus: VerificationStatus | null;
};

export type PriceTier = { id: number; name: string; description: string | null; isActive: boolean; defaultDiscountPercent: number; accountCount: number };

/** A wholesale (B2B) account: a doctor who registered to buy at trade prices. */
export type B2BAccountRow = {
  id: number; type: string; name: string; businessName: string; city: string | null; state: string | null;
  registrationNumber: string | null; registrationCouncil: string | null; gstNumber: string | null;
  status: VerificationStatus; approvedAt: string | null; rejectionReason: string | null; createdAt: string;
  creditLimit: number; creditDays: number; phone: string | null; email: string | null;
  tier: { id: number; name: string; discountPercent: number } | null;
  documentCount: number; specialRuleCount: number; orderCount: number; totalSpent: number;
};

export type BrandRow = {
  id: number; name: string; slug: string; logoUrl: string | null; description: string | null;
  isActive: boolean; productCount: number;
};

export type CategoryRow = {
  id: number; parentId: number | null; name: string; slug: string; imageUrl: string | null;
  fallbackImageUrl: string | null; // a product photo, shown when the category has no image of its own
  isActive: boolean; sortOrder: number; productCount: number; childCount: number;
};
