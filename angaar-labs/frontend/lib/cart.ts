"use client";

import { useSyncExternalStore } from "react";

// The cart lives in this browser, so people can fill it before they sign in.
// It holds only which pack and how many; prices always come fresh from the server.

export type CartLine = { variantId: number; quantity: number };

// the doctor's wholesale cart and a customer's own cart are kept apart, even in the same browser
const area = () => (typeof window !== "undefined" && window.location.pathname.split("/")[1] === "doctor" ? "" : "_patient");
const cartKey = () => `dh_cart${area()}`;
const couponKey = () => `dh_coupon${area()}`;
const EMPTY: CartLine[] = [];
const listeners = new Set<() => void>();
let lines: CartLine[] = EMPTY;
let couponCode = "";
let loaded = false;

const read = (): CartLine[] => {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(cartKey()) ?? "[]");
    if (!Array.isArray(saved)) return EMPTY;
    return saved.filter((l): l is CartLine => Number.isInteger(l?.variantId) && Number.isInteger(l?.quantity) && l.quantity > 0);
  } catch {
    return EMPTY; // storage blocked or the saved text is damaged: start empty
  }
};

const load = () => {
  if (loaded) return;
  loaded = true;
  lines = read();
  try {
    couponCode = window.localStorage.getItem(couponKey()) ?? "";
  } catch {
    couponCode = "";
  }
  // another tab changed the cart
  window.addEventListener("storage", (event) => {
    if (event.key !== cartKey()) return;
    lines = read();
    listeners.forEach((listener) => listener());
  });
};

const save = (next: CartLine[]) => {
  lines = next;
  try {
    window.localStorage.setItem(cartKey(), JSON.stringify(next));
  } catch {
    // the cart still works for this visit
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => {
  load();
  return lines;
};

export const cart = {
  add(variantId: number, quantity = 1) {
    load();
    const found = lines.find((l) => l.variantId === variantId);
    save(found ? lines.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + quantity } : l)) : [...lines, { variantId, quantity }]);
  },
  setQuantity(variantId: number, quantity: number) {
    load();
    save(quantity <= 0 ? lines.filter((l) => l.variantId !== variantId) : lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
  },
  remove(variantIds: number[]) {
    load();
    save(lines.filter((l) => !variantIds.includes(l.variantId)));
  },
  clear() {
    cart.setCoupon("");
    save(EMPTY);
  },
  /** The coupon code typed on the cart page, remembered until the order is placed. */
  setCoupon(code: string) {
    load();
    couponCode = code.trim().toUpperCase();
    try {
      if (couponCode) window.localStorage.setItem(couponKey(), couponCode);
      else window.localStorage.removeItem(couponKey());
    } catch {
      // kept for this visit only
    }
    listeners.forEach((listener) => listener());
  },
};

export function useCoupon() {
  return useSyncExternalStore(subscribe, () => (load(), couponCode), () => "");
}

/** The cart's lines; empty while the page is still being prepared on the server. */
export function useCart() {
  const current = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  return { lines: current, count: current.reduce((sum, l) => sum + l.quantity, 0), quantityOf: (variantId: number) => current.find((l) => l.variantId === variantId)?.quantity ?? 0 };
}
