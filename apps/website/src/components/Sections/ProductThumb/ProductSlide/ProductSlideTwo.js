import React from "react";
import SectionTitleOne from "../../SectionTitle/SectionTitleOne";
import { PrevArrow, NextArrow } from "../../../Other/SliderArrow";
import ProductSlider from "../Elements/ProductSlider";

export default function ProductSlideTwo({ data }) {
  const settings = {
    speed: 500,
    slidesToShow: 4,
    slidesToScroll: 1,
    className: "product-slide__wrapper",
    prevArrow: <PrevArrow />,
    nextArrow: <NextArrow />,
    responsive: [
      {
        breakpoint: 1170,
        settings: {
          slidesToShow: 4,
        },
      },
      {
        breakpoint: 992,
        settings: {
          slidesToShow: 3,
        },
      },
      {
        breakpoint: 768,
        settings: {
          slidesToShow: 2,
        },
      },
      {
        breakpoint: 576,
        settings: {
          slidesToShow: 1,
        },
      },
    ],
  };
  return (
    <div className="product-slide -style-2">
      <div className="container">
        <SectionTitleOne align="center" hideDecoration>
          Related Products
        </SectionTitleOne>
        <ProductSlider data={data} sliderSettings={settings} />
      </div>
    </div>
  );
}
