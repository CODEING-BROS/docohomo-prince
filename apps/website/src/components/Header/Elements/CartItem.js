import { useDispatch } from "react-redux";

import { formatCurrency } from "../../../common/utils";
import { removeFromCart } from "../../../redux/actions/cartActions";
import Link from "next/link";
import { toast } from "react-toastify";

function CartItem(props) {
  const dispatch = useDispatch();
  const { prid,image, name, price, quantity, cartId, slug, regular_price } = props;
  const removeProductHandle = (e) => {
    e.preventDefault();
    dispatch(removeFromCart(cartId));
    toast.error("Product removed from card");
  };
  return (
    <div className="cart-item">
      <div className="cart-item__image">
        <img src={process.env.PUBLIC_URL + image} alt="Product image" />
      </div>
      <div className="cart-item__info">
        <Link
          href={process.env.PUBLIC_URL + "/product/[prid]"}
          as={process.env.PUBLIC_URL + "/product/" + prid}
        >
          <a>{name}</a>
        </Link>
        {/* <h5>{formatCurrency(price)}</h5> */}
        <h5 className="product-price--main">
          {!false && (
            <h6 style={{
              marginBottom:10
            }} className="product-price--discount">
              {formatCurrency(regular_price)}
            </h6>
          )}
          {!true ? formatCurrency(price) : formatCurrency(price)}
        </h5>
        <p>
          Quantity: <span>{quantity}</span>
        </p>
      </div>
      <a className="cart-item__remove" href="#" onClick={removeProductHandle}>
        <i className="fal fa-times"></i>
      </a>
    </div>
  );
}

export default CartItem;
