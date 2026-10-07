import React from "react";

import ProductDetailInfo from "./Elements/ProductDetailInfo";
import ProductDetailSlideOne from "./Elements/ProductDetailSlideOne";

export default function ProductQuickView({ data }) {
  return (
    <div className="product-quickview">
      <div className="row">
        <div className="col-12 col-md-6">
          <ProductDetailSlideOne data={data} />
        </div>
        <div className="col-12 col-md-6">
          <ProductDetailInfo data={data} hideTab />
        </div>
      </div>
    </div>
  );
}
