import React, { useState } from "react";
import classNames from "classnames";
import Link from "next/link";

import { getProducts } from "../../../../common/productSelect";
import Product from "../../../Product";
import Button from "../../../Control/Button";

const categories = ["All", "Eyes", "Face", "Lips"];

export default function ProductTabTwo({
  data,
  disableFeaturedProduct,
  title,
  titleSize,
  numberOfProducts,
}) {
  const [currentCategory, setCurrentCategory] = useState(
    categories ? categories[0] : "All"
  );

  let filteredProduct = getProducts(
    data,
    currentCategory,
    null,
    numberOfProducts || 8
  );

  return (
    <div className="product-tab -style-2">
      <div className="container">
        <div className="product-tab__header">
          <h5 style={{ fontSize: titleSize }}>{title || "New arrivals"}</h5>
          <div className="product-tab-slide__header__controller">
            <ul>
              {categories.map((category, index) => (
                <li
                  className={classNames({
                    active: currentCategory === category,
                  })}
                  key={index}
                >
                  <Link href={process.env.PUBLIC_URL + "#"}>
                    <a
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentCategory(category);
                      }}
                    >
                      {category}
                    </a>
                  </Link>
                </li>
              ))}
            </ul>
            <Button
              action={process.env.PUBLIC_URL + "/fullwidth-4col"}
              color="white"
              content="View all"
            />
          </div>
        </div>
        <div className="product-tab__content">
          {!filteredProduct || filteredProduct.length === 0 ? (
            <div className="product-tab__content__empty">
              <h3>No product found</h3>
            </div>
          ) : (
            <>
              <div className="product-tab__content__wrapper">
                {disableFeaturedProduct ? (
                  <div className="row">
                    {filteredProduct.map((p, index) => (
                      <div key={index} className="col-12 col-sm-6 col-md-3 ">
                        <Product data={p} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="row">
                    <div className="col-12 col-md-6">
                      {filteredProduct.slice(0, 1).map((p, index) => (
                        <Product
                          key={index}
                          className="-inline-content"
                          data={p}
                        />
                      ))}
                    </div>
                    <div className="col-12 col-md-6">
                      <div className="row">
                        {filteredProduct.slice(1, 5).map((p, index) => (
                          <div key={index} className="col-12 col-sm-6">
                            <Product className="-height-limit" data={p} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
