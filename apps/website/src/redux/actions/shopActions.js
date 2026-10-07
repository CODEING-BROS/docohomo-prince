import { SHOP } from "../variables";

export const setFilterCategory = (category) => ({
  type: SHOP.SET_FILTER_CATEGORY,
  category,
});
export const setFilterBrand = (brand) => ({
  type: SHOP.SET_FILTER_BRAND,
  brand,
});
export const setFilterPriceRange = (priceRange) => ({
  type: SHOP.SET_FILTER_PRICE_RANGE,
  priceRange,
});

export const resetFilter = () => ({
  type: SHOP.RESET_FILTER,
});
