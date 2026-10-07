import Link from "next/link";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import classNames from "classnames";
import Button from "../../Control/Button";

import { formatCurrency } from "../../../common/utils";
import { addToCart } from "../../../redux/actions/cartActions";
import { addToWishlist } from "../../../redux/actions/wishlistActions";
import ProductDetailController from "./ProductDetailController";
import ProductDetailInfoTab from "./ProductDetailInfoTab";
import Rate from "../../Other/Rate";
import { checkProductInWishList } from "../../../common/shopUtils";

export default function ProductDetailInfo({ data, onReviewSubmit, hideTab,original }) {
  const dispatch = useDispatch();
  const wishlistState = useSelector((state) => state.wishlistReducer);
  const [quantity, setQuantity] = useState();
  const [otherColor, setOtherColor] = useState();
  const getQuantity = (q) => {
    setQuantity(q);
  };
  const onAddToCart = (e) => {
    e.preventDefault();
    dispatch(addToCart(data, quantity, otherColor));
    toast.success("Product added to cart");
  };
  const onAddToWishList = (e) => {
    e.preventDefault();
    let product = checkProductInWishList(wishlistState, data._id);
    dispatch(addToWishlist(data));
    toast.dismiss();
    if (!product) {
      return toast.success("Product added to wishlist !");
    } else {
      return toast.error("Product removed from wishlist !");
    }
  };
  return (
    <div className="product-detail__content">
      <div className="product-detail__content__header">
        <h5>{data.category}</h5>
        <h2 className="m-0">{data.name}</h2>
        {data.product_sub_description && <p>{data.product_sub_description}</p>}
        {/* <div className="product-detail__content__header__comment-block">
          <Rate currentRate={data.rate} />
          <p>03 Reviews</p>
          <Link href={process.env.PUBLUC_URL + "#"}>
            <a>Write a reviews</a>
          </Link>
        </div> */}
        <div style={{
          display: 'flex', justifyContent:'space-between', marginTop: "14px"
        }} >
        <h3 className="product-price--main">
                {!data.discount && (
                  <h5 className="product-price--discount">
                    {formatCurrency(data?.regular_price)}
                  </h5>
                )}
                {!data.discount
                  ? formatCurrency(data?.price)
                  : formatCurrency(data?.price)}
              </h3>
              <h3>
                {(
                  ((data.regular_price - data.price) /
                    data.regular_price) *
                  100
                ).toFixed(0)}{" "}
                % OFF
              </h3>
        </div>
        {/* <h3>
          {formatCurrency(data.price)}
          {!data.discount
            ? formatCurrency(data.price)
            : formatCurrency(data.price)}
          {!data.discount && (
            <span>{formatCurrency(data.regular_price)}</span>
          )}
        </h3> */}
      </div>
      <div className="divider"></div>
      <div className="product-detail__content__footer">
        <ul>
          <li>
            Brand: <span>{data?.brand }</span>
          </li>
          <li>
            Product code: <span>{data.id}</span>
          </li>
          {/* <li>
            Reward point: <span>{data.product_reword_point}</span>
          </li> */}
          {/* <li>
            Availability:
            {data.quantity > 0 ? (
              <span className="in-stock"> In Stock</span>
            ) : (
              <span className="out-stock"> Out Stock</span>
            )}
          </li> */}
        </ul>
        {data.variation && (
          <div className="product-detail__colors">
            {/* <span>Color:</span>
            {data.variation.map((color, index) => (
              <div
                key={index}
                className={`product-detail__colors__item ${classNames({
                  active: otherColor === color.color,
                })}`}
                style={{ backgroundColor: color.colorCode }}
                onClick={() => setOtherColor(color.color)}
              />
            ))} */}
          </div>
        )}
        <ProductDetailController
          data={data}
          quan={data?.quantity}
          getQuantity={getQuantity}
          onAddToCart={onAddToCart}
          onAddToWishList={onAddToWishList}
          color={otherColor}
        />
        {/* <button className="btn -red">
          Make an enquiry
        </button> */}

        
   
      </div>
      {/* {!hideTab && (
        <>
            <ProductDetailInfoTab original={original} data={data} onReviewSubmit={onReviewSubmit} />
          <div className="divider"></div>
          <div className="product-detail__content__tab">
          </div>
        </>
      )} */}
    </div>
  );
}
