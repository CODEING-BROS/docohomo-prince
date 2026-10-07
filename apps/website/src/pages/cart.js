import { useSelector, useDispatch } from "react-redux";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import LayoutFour from "../components/Layout/LayoutFour";
import LayoutOne from "../components/Layout/LayoutOne";
import Quantity from "../components/Control/Quantity";
import Button from "../components/Control/Button";
import { Breadcrumb, BreadcrumbItem } from "../components/Other/Breadcrumb";
import { formatCurrency } from "../common/utils";
import { calculateTotalPrice,calculateSubTotalPrice, calculateDiscountPrice } from "../common/shopUtils";
import {
  removeFromCart,
  removeAllFromCart,
  increaseQuantityCart,
  decreaseQuantityCart,
} from "../redux/actions/cartActions";
import InstagramTwo from "../components/Sections/Instagram/InstagramTwo";

export default function () {
  const dispatch = useDispatch();
  const { register, handleSubmit, watch, errors } = useForm();
  const cartState = useSelector((state) => state.cartReducer);
  const onSubmit = (data) => {

  };
  const removeAllProduct = (e) => {
    e.preventDefault();
    dispatch(removeAllFromCart());
    return toast.error("All product removed from cart");
  };
  const removeProduct = (e, cartId) => {
    e.preventDefault();
    dispatch(removeFromCart(cartId));
    return toast.error("Product removed from cart");
  };
  return (
    <LayoutOne title="Cart">
      <Breadcrumb title="Shopping cart">
        <BreadcrumbItem name="Home" />
        {/* <BreadcrumbItem name="Shop" /> */}
        <BreadcrumbItem name="Shopping cart" current />
      </Breadcrumb>
      <div className="cart">
        <div className="container">
          {!cartState || cartState.length === 0 ? (
            <div className="cart__empty">
              <h3>No product in cart</h3>
              <Button
                color="dark"
                action={process.env.PUBLIC_URL + "/"}
                content="Shopping now"
              />
            </div>
          ) : (
            <>
              <div className="cart__table">
                <div className="cart__table__wrapper">
                  <table>
                    <colgroup>
                      <col style={{ width: "40%" }} />
                      <col style={{ width: "17%" }} />
                      <col style={{ width: "17%" }} />
                      <col style={{ width: "17%" }} />
                      <col style={{ width: "9%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Price</th>
                        <th>Quantity</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cartState.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <div className="cart-product">
                              <div className="cart-product__image">
                                <img
                                  src={item.thumbImage[0].image_url}
                                  alt={item.name}
                                />
                              </div>
                              <div className="cart-product__content">
                                <h5>{item.category}</h5>
                                <Link
                                  href={
                                    process.env.PUBLIC_URL +
                                    "/product/[...slug]"
                                  }
                                  as={
                                    process.env.PUBLIC_URL +
                                    "/product/" +
                                    item.name.trim().replaceAll(" ","-") + "/" + item.productID
                                  }
                                >
                                  <a>{item.name}</a>
                                </Link>
                              </div>
                            </div>
                          </td>
                          <td>
                            <h3 className="product-price--main">
                              <h3 style={{
                                marginBottom:10
                              }} className="product-price--discount">
                                {formatCurrency(item.regular_price)}
                              </h3>
                              {formatCurrency(item.price)}
                            </h3>
                          </td>
                          <td>
                            <Quantity
                              defaultQuantity={item.cartQuantity}
                              onIncrease={() =>
                                dispatch(increaseQuantityCart(item.cartId))
                              }
                              onDecrease={() =>
                                dispatch(decreaseQuantityCart(item.cartId))
                              }
                              data={item}
                            />
                          </td>
                          <td>
                            {formatCurrency(item.price * item.cartQuantity)}
                          </td>
                          <td>
                            <a
                              href={process.env.PUBLIC_URL + "#"}
                              onClick={(e) => removeProduct(e, item.cartId)}
                            >
                              <i className="fal fa-times"></i>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="cart__table__footer">
                  <Link href={process.env.PUBLIC_URL + "/"}>
                    <a>
                      <i className="fal fa-long-arrow-left"></i>
                      Continue Shopping
                    </a>
                  </Link>

                  <Link href="#">
                    <a onClick={(e) => removeAllProduct(e)}>
                      <i className="fal fa-trash"></i>
                      Clear Shopping Cart
                    </a>
                  </Link>
                </div>
              </div>
              <div className="cart__total">
                <div className="row">
                  <div className="col-12 col-md-8">
                    {/* <div className="cart__total__discount">
                      <p>Enter coupon code. It will be applied at checkout.</p>
                      <div className="input-validator">
                        <form onSubmit={handleSubmit(onSubmit)}>
                          <input
                            type="text"
                            name="discountCode"
                            placeholder="Your code here"
                          //  ref={register({ required: true })}
                          />
                          <button className="btn -dark">Apply</button>
                        </form>
                        {errors.discountCode && (
                          <span className="input-error">
                            Please provide a discount code
                          </span>
                        )}
                      </div>
                    </div> */}
                  </div>
                  <div className="col-12 col-md-4">
                    <div className="cart__total__content">
                      <h3>Cart Total</h3>
                      <table>
                        <tbody>
                          <tr>
                            <th>Subtotal</th>
                            <td>{calculateSubTotalPrice(cartState, true)}</td>
                          </tr>
                          <tr>
                            <th>Discount</th>
                            <td> - {calculateDiscountPrice(cartState,true)} </td>
                          </tr>
                          <tr>
                            <th>Total</th>
                            <td className="final-price">
                              {calculateTotalPrice(cartState, true)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <Button
                        height={45 / 14 + "em"}
                        width="100%"
                        action={process.env.PUBLIC_URL + "/checkout"}
                        color="dark"
                        content="Proceed to checkout"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {/* <InstagramTwo /> */}
    </LayoutOne>
  );
}
