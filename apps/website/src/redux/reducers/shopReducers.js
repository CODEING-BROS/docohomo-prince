import { SHOP } from "../variables";

const initialState = {
  filter: {
    category: "all",
    priceRange: {},
    brand: "",
  },
};

export default function shopReducer(state = initialState, action) {
  switch (action.type) {
    case SHOP.SET_FILTER_CATEGORY:
      return {
        ...initialState,
        filter: {
          ...state.filter,
          category: action.category,
        },
      };
    case SHOP.SET_FILTER_BRAND:
      return {
        ...initialState,
        filter: {
          ...state.filter,
          brand: action.brand,
        },
      };
    case SHOP.SET_FILTER_PRICE_RANGE:
      return {
        ...initialState,
        filter: {
          ...state.filter,
          priceRange: action.priceRange,
        },
      };
    case SHOP.RESET_FILTER:
      return {
        ...initialState,
        filter: {
          category: "all",
          priceRange: {},
          brand: "",
        },
      };
    default:
      return state;
  }
}
