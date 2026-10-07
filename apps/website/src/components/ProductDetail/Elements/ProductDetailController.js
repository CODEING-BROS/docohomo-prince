import { useState } from "react";
import { useSelector } from "react-redux";
import ReactTooltip from "react-tooltip";
import classNames from "classnames";

import Quantity from "../../Control/Quantity";
import AddToCart from "../../Control/AddToCart";
import Button from "../../Control/Button";
import {
  getAvaiableQuantityInCart,
  checkProductInWishList,
} from "../../../common/shopUtils";
import { EnquiryForm } from "../../form/EnquiryForm";
import { useRouter } from "next/router";

export default function ProductDetailController({
  data,
  getQuantity,
  quan,
  onAddToCart,
  onAddToWishList,
  color,
}) {
  const [quantity, setQuantity] = useState();
  const cartState = useSelector((state) => state.cartReducer);
  const wishlistState = useSelector((state) => state.wishlistReducer);
  const [show, setShow] = useState(false);
  const router = useRouter()

  const avaiableProduct = getAvaiableQuantityInCart(
    cartState,
    data.id,
    data.quantity
  );

  console.log(quan);
  console.log(quan === 0);

  return (
    <>
      <div className="product-detail__controler">
        { data.quantity <= 0 ? (
          <div
            style={{
              fontWeight: "bold",
              color: "red",
            }}
          >
            This Product is currently out of stock
          </div>
        ) : (
          <Quantity
            className="-border -round"
            getQuantity={(q) => {
              setQuantity(q), getQuantity(q);
            }}
            maxValue={avaiableProduct}
            data={data}
            defaultQuantity={data.min_order_quantity}
          />
        )}

        <div className="flex-btn-product-detail w-100">
         
            <AddToCart
              className={`-dark ${classNames({
                "-disable": data.quantity === 0 ,
              })}`}
              onClick={onAddToCart}
            />
    
          {/* <div
            className={`add-to-cart `}
            onClick={() => {
              setShow(true);
            }}
          >
            <Button
              height="3.85em"
              width="3.85em"
              color="red"
              className="-round"
              action="#"
              content={<i className="fas fa-info"></i>}
            />
            <h5>Bulk Enquiry</h5>
          </div> */}
          {data.quantity > 0 && <div className="buy-now" onClick={(e)=>{
              onAddToCart(e);
              router.push("/cart")
            }} >
            <a 
            // href="/cart"
            >Buy Now</a>
          </div>}
        </div>
        {/* {(cartState && cartState.length > 0) && <div className="w-100 my-4">
            <a href="/cart" className="buy-now">Buy Now</a>
          </div>} */}
        <div className="product-detail__controler__actions">
          {/* <div data-tip data-for="add-wishlist">
          <Button
            action="#"
            height="3.85em"
            width="3.85em"
            className={`-round ${classNames({
              active: checkProductInWishList(wishlistState, data.id),
            })}`}
            onClick={onAddToWishList}
            color="white"
            content={<i className="fas fa-heart"></i>}
          />
        </div> */}
          {/* <ReactTooltip id="add-wishlist" type="dark" effect="solid">
          <span>Add to wishlist</span>
        </ReactTooltip> */}
        </div>
      </div>
      <EnquiryForm show={show} setShow={setShow} data={data} />
    </>
  );
}
