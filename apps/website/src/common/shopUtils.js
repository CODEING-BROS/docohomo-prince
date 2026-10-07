import { formatCurrency } from "./utils";

export const checkProductInCart = (cartArr, pid, color) => {
  if (cartArr || cartArr.length > 0) {
    if (color && color !== "") {
      return cartArr.find(
        (item) =>
          item.id === pid && item.selectedColor && item.selectedColor === color
      );
    }
    return cartArr.find((item) => item.id === pid);
  }
};

export const getAvaiableQuantityInCart = (cartArr, pid, quantity) => {
  let arr = cartArr.filter((item) => item.id === pid);
  if (cartArr || cartArr.length > 0) {
    if (arr.length > 0) {
      let result =
        arr.length > 0 &&
        arr.reduce((total, num) => total + num.cartQuantity, 0);
      return result && quantity - result;
    } else {
      return quantity;
    }
  }
  return quantity;
};

export const checkProductInWishList = (wishlistArr, productId) => {
  return wishlistArr.find((item) => item.id === productId);
};

export const calculateTotalPrice = (cartArr, isformatCurrency) => {
  let total = 0;
  cartArr.forEach((item) => (total += item.price * item.cartQuantity));
  return isformatCurrency ? formatCurrency(total) : total;
};

export const calculateTotalPriceAfterCoupon = (
  cartArr,
  isformatCurrency,
  coupon,
  type
) => {
  let total = 0;

  cartArr.forEach((item) => (total += item.price * item.cartQuantity));

  if (coupon === 0) {
    return isformatCurrency ? formatCurrency(total) : total;
  } else {
    if (type === 'percentage') {
      const discount = (total * coupon) / 100;
      const discountedTotal = total - discount;
      return isformatCurrency ? formatCurrency(discountedTotal) : discountedTotal;
    } else if (type === 'amount') {
      const discountedTotal = total - coupon;
      return isformatCurrency ? formatCurrency(discountedTotal) : discountedTotal;
    }
  }
};

export const calculateDiscountPriceAfterCoupon = (
  cartArr,
  isformatCurrency,
  coupon,
  type
) => {
  let totalDiscount = 0;
  let total = 0;

  cartArr.forEach((item) => (total += item.price * item.cartQuantity));

  cartArr.forEach(
    (item) => (totalDiscount += (item.regular_price) * item.cartQuantity)
  );

  if (coupon === 0) {
    return isformatCurrency ? formatCurrency(totalDiscount) : totalDiscount;
  } else {
    if (type === 'percentage') {
      const discount = (total * coupon) / 100;
      const discountedTotal = discount;
      return isformatCurrency ? formatCurrency(discountedTotal) : discountedTotal;
    } else if (type === 'amount') {
      const discountedTotal = coupon;
      return isformatCurrency ? formatCurrency(discountedTotal) : discountedTotal;
    }
  }
};

export const calculateSubTotalPrice = (cartArr, isformatCurrency) => {
  let total = 0;
  cartArr.forEach((item) => (total += item.regular_price * item.cartQuantity));
  return isformatCurrency ? formatCurrency(total) : total;
};

export const calculateDiscountPrice = (cartArr, isformatCurrency) => {
  let total = 0;
  cartArr.forEach(
    (item) => (total += (item.regular_price - item.price) * item.cartQuantity)
  );
  return isformatCurrency ? formatCurrency(total) : total;
};
