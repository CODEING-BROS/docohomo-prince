import Button from "./Button";
import classNames from "classnames";

export default function AddToCart({ onClick, className }) {
  return (
    <div className={`add-to-cart ${classNames(className)}`} onClick={onClick}>
      <Button
        height="3.85em"
        width="3.85em"
        color="red"
        className="-round"
        action="#"
        content={
          <>
            <i className="fas fa-shopping-bag"></i>
          </>
        }
      />

      <h5 style={{
        color:"white",
        fontWeight:"bold",
      }} >Add to cart</h5>
    </div>
  );
}
