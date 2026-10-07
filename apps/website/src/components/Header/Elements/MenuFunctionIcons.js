import React, { useState, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import classNames from "classnames";
import Link from "next/link";
import SearchBox from "./SearchBox";
import CartItemsSidebar from "./CartItemsSidebar";
import MobileNavSidebar from "./MobileNavSidebar";
import { formatCurrency } from "../../../common/utils";

export default function MenuFunctionIcons(props) {
  const cartState = useSelector((state) => state.cartReducer);
  const hide = props.hide || "";
  const [showSearch, setShowSearch] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  function calcalateTotal(arr) {
    let total = 0;
    arr.forEach((item) => (total += item.price * item.cartQuantity));
    return total;
  }
  return (
    <>
      <div
        className={`menu__wrapper__functions ${classNames(props.className)}`}
      >
        {!hide.includes("search") && (
          <a
            href="#"
            className="menu-icon -search"
            onClick={(e) => {
              e.preventDefault();
              setShowSearch(true);
            }}
            style={{ marginRight: hide.includes("cart") && 0 }}
          >
            <img
              src={
                props.white
                  ? process.env.PUBLIC_URL +
                    "/assets/images/header/search-icon-white.png"
                  : process.env.PUBLIC_URL +
                    "/assets/images/header/search-icon.png"
              }
              alt="Search icon"
            />
          </a>
        )}
        {!hide.includes("cart") && (
          <>
            {/* <Link href={process.env.PUBLIC_URL + "/wishlist"}>
              <a className="menu-icon -wishlist">
                <img
                  src={
                    props.white
                      ? process.env.PUBLIC_URL +
                        "/assets/images/header/wishlist-icon-white.png"
                      : process.env.PUBLIC_URL +
                        "/assets/images/header/wishlist-icon.png"
                  }
                  alt="Wishlist icon"
                />
              </a>
            </Link> */}
            <div className="menu__cart menu_search"
              onClick={(e) => {
                e.preventDefault();
                setShowSearch(!showSearch);
                console.log("search")
              }}
            >
              <img
                src={
                  props.white
                    ? process.env.PUBLIC_URL +
                      "/assets/images/header/search-icon-white.png"
                    : process.env.PUBLIC_URL +
                      "/assets/images/header/search-icon.png"
                }
                alt="Search icon"
              />
            </div>
            <div className="menu__cart">
              <a
                href="/cart"
                className="menu-icon -cart"
                // onClick={(e) => {
                //   e.preventDefault();
                //   setShowCart(!showCart);
                // }}
              >
                <img
                  src={
                    props.white
                      ? process.env.PUBLIC_URL +
                        "/assets/images/header/cart-icon-white.png"
                      : process.env.PUBLIC_URL +
                        "/assets/images/header/cart-icon.png"
                  }
                  alt="Cart icon"
                />
                <span className="cart__quantity strong">{cartState.length}</span>
              </a>
              <h5>
                Cart: <span>{formatCurrency(calcalateTotal(cartState))}</span>
              </h5>
            </div>
            {/* <div className="menu__cart"> */}
            {/* <Link
              href={`${process.env.PUBLIC_URL}/profile`}
              // href={`#`}
              as={`${process.env.PUBLIC_URL}/profile`}
            >
                <img
                  style={{
                    width: "30px",
                    height: "auto",
                    borderRadius: "12%",
                    marginLeft: "10px",
                    cursor:"pointer"
                  }}
                  src={
                    props.white
                      ? process.env.PUBLIC_URL + "/user.png"
                      : process.env.PUBLIC_URL + "/user.png"
                  }
                />
              </Link> */}
            {/* </div> */}
            <a
              href="#"
              className="menu-icon -navbar"
              onClick={(e) => {
                e.preventDefault();
                setShowMobileNav(!showMobileNav);
              }}
            >
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
            </a>
          </>
        )}
      </div>
      {/* Search input */}
      <SearchBox showSearch={showSearch} setShowSearch={setShowSearch} />
      {/* Cart sidebar */}
      <CartItemsSidebar showCart={showCart} setShowCart={setShowCart} />
      {/* Mobile navigation sidebar */}
      <MobileNavSidebar
        showMobileNav={showMobileNav}
        setShowMobileNav={setShowMobileNav}
      />
      {/* <div className="search-box">
        <SearchBox showSearch={true} setShowSearch={setShowSearch} />
      </div> */}
    </>
  );
}
