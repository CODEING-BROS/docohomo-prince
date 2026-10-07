import React, { useState, useEffect } from "react";
import classNames from "classnames";

import { product } from "../../common/variables";
import { Tooltip } from "@mui/material";

export default function Quantity({
  data,
  className,
  defaultQuantity,
  getQuantity,
  onDecrease,
  onIncrease,
  maxValue,
}) {
  const [quantity, setQuantity] = useState(
    defaultQuantity || product.DEFAULT_QUANTITY
  );
  useEffect(() => {
    getQuantity && getQuantity(quantity);
  }, [quantity]);
  return (
    <div className={`quantity-controller ${classNames(className)}`}>
      <Tooltip
        slotProps={{
          tooltip: {
            sx:{
                backgroundColor: "#c50000",
                color: "white"
              }
          }
        }}
        title={quantity<=data.min_order_quantity ? `You can add at least ${quantity} items.` : ""}
        arrow
      >
        <div
          className="quantity-controller__btn -descrease"
          onClick={() => {
            if (quantity < 2 || quantity <= data.min_order_quantity) {
              return;
            }
            setQuantity(quantity - 1);
            onDecrease && onDecrease();
          }}
        >
          -
        </div>
      </Tooltip>
      <h5 className="quantity-controller__number">{quantity}</h5>
      <Tooltip 
        slotProps={{
          tooltip: {
            sx:{
                backgroundColor: "#c50000",
                color: "white"
              }
            
          }
        }}
        title={quantity>=data.max_order_quantity ? `You can add up to ${quantity} items maximum.` : ""}
        arrow
      >
        <div
          className="quantity-controller__btn -increase"
          onClick={() => {
            if (quantity >= maxValue || quantity>=data.max_order_quantity) {
              return;
            }
            setQuantity(quantity + 1);
            onIncrease && onIncrease();
          }}
        >
          +
        </div>
      </Tooltip>
    </div>
  );
}
