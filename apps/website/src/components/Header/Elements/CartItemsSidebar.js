import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { CSSTransition } from "react-transition-group";

import CartItem from "./CartItem";
import ClientOnlyPortal from "../../../common/ClientOnlyPortal";
import Button from "../../Control/Button";
import { calculateTotalPrice } from "../../../common/shopUtils";

function CartItemsSidebar({ showCart, setShowCart }) {
  const cartState = useSelector((state) => state.cartReducer);
  return (
    <>
      <ClientOnlyPortal selector="#cart-sidebar">
        <CSSTransition
          in={showCart}
          unmountOnExit
          timeout={200}
          classNames="cart-sidebar"
        >
          <div className="cart-items__wrapper">
            <h2>Shopping cart</h2>
            {cartState.length === 0 ? (
              <h3 className="empty-noti">No product in cart</h3>
            ) : (
              <>
                {cartState.length !== 0 &&
                  cartState.map((item) => (
                    <CartItem
                      key={item.productID}
                      prid={item.productID}
                      image={item.thumbImage[0].image_url }
                      name={item.name}
                      regular_price={item.regular_price}
                      price={item.price}
                      quantity={item.cartQuantity}
                      cartId={item.cartId}
                      slug={item.slug}
                    />
                    // console.log(item)
                  ))}
                <div className="cart-items__total">
                  <div className="cart-items__total__price">
                    <h5>Total</h5>
                    <span>{calculateTotalPrice(cartState, true)}</span>
                  </div>
                  <div className="cart-items__total__buttons">
                    <Button
                      width="100%"
                      action={"/cart"}
                      color="dark"
                      content="View cart"
                    />
                    <Button
                      width="100%"
                      action={"/checkout"}
                      color="red"
                      content="Checkout"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </CSSTransition>
      </ClientOnlyPortal>
      {showCart && (
        <ClientOnlyPortal selector="#overlay">
          <div className="overlay" onClick={() => setShowCart(false)}></div>
        </ClientOnlyPortal>
      )}
    </>
  );
}

export default CartItemsSidebar;
