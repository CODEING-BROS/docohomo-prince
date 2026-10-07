import React, { useState } from "react";
import classNames from "classnames";
import Link from "next/link";

import SectionTitleOne from "../../SectionTitle/SectionTitleOne";
import Product from "../../../Product";
import Button from "../../../Control/Button";
import { getProducts } from "../../../../common/productSelect";

export default function ProductTabOne({ data, categories }) {
  const [currentCategory, setCurrentCategory] = useState(
    categories ? categories[0] : "All"
  );
  let filteredProduct = getProducts(data, currentCategory, null, 8);

  return (
    <div className="product-tab -style-1">
      <div className="container">
        <SectionTitleOne align="center">New arrivals</SectionTitleOne>
        <div className="product-tab__header">
          <ul>
            {categories.map((category, index) => (
              <li
                className={classNames({ active: currentCategory === category })}
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
        </div>
        <div className="product-tab__content">
          {!filteredProduct || filteredProduct.length === 0 ? (
            <div className="product-tab__content__empty">
              <h3>No product found</h3>
            </div>
          ) : (
            <>
              <div className="product-tab__content__wrapper">
                <div className="row">
                  {filteredProduct.map((p, index) => (
                    <div
                      key={index}
                      className="col-12 col-sm-6 col-md-4 col-lg-3"
                    >
                      <Product data={p} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <Button
                  action={process.env.PUBLIC_URL + "/fullwidth-4col"}
                  color="transparent"
                  className="-underline"
                  content="View all product"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
