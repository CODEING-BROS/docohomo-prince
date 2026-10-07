import React, { useState } from "react";
import Link from "next/link";
import classNames from "classnames";

import { getProducts } from "../../../../common/productSelect";
import { NextArrow, PrevArrow } from "../../../Other/SliderArrow";
import Button from "../../../Control/Button";
import ProductSlider from "../Elements/ProductSlider";

const categories = ["All", "Eyes", "Face", "Lips"];

export default function ProductTabSlideOne({ data }) {
  const settings = {
    centerMode: true,
    centerPadding: "250px",
    slidesToShow: 4,
    prevArrow: <PrevArrow />,
    nextArrow: <NextArrow />,
    responsive: [
      {
        breakpoint: 1500,
        settings: {
          centerPadding: "200px",
          slidesToShow: 3,
        },
      },
      {
        breakpoint: 1140,
        settings: {
          centerPadding: "100px",
          slidesToShow: 3,
        },
      },
      {
        breakpoint: 992,
        settings: {
          centerPadding: "100px",
          slidesToShow: 2,
        },
      },
      {
        breakpoint: 600,
        settings: {
          // centerMode: false,
          centerPadding: "40px",
          slidesToShow: 1,
        },
      },
    ],
  };
  const [currentCategory, setCurrentCategory] = useState(
    categories ? categories[0] : "All"
  );
  let filteredProduct = getProducts(data, currentCategory, null, 8);

  return (
    <div className="product-tab-slide">
      <div className="container">
        <div className="product-tab-slide__header">
          <h5>New arrivals</h5>
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
      </div>
      <div className="product-tab-slide__content">
        <ProductSlider data={filteredProduct} sliderSettings={settings} />
      </div>
    </div>
  );
}
