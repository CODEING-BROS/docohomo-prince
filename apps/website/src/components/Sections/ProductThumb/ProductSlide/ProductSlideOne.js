import SectionTitleOne from "../../SectionTitle/SectionTitleOne";
import Button from "../../../Control/Button";

import ProductSlider from "../Elements/ProductSlider";
import { PrevArrow, NextArrow } from "../../../Other/SliderArrow";

export default function ProductSlideOne({ data }) {
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
    <div className="product-slide">
      <div className="container">
        <SectionTitleOne align="center" spaceBottom="50px">
          Beauty Products
        </SectionTitleOne>
        <ProductSlider data={data} sliderSettings={settings} />
        <div className="text-center">
          <Button
            action={process.env.PUBLIC_URL + "/fullwidth-4col"}
            color="transparent"
            className="-underline"
            content="View all product"
          />
        </div>
      </div>
    </div>
  );
}
