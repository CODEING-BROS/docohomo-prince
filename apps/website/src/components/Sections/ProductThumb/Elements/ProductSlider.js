import Slider from "react-slick";

import Product from "../../../Product";

export default function ProductSlider({ data, sliderSettings }) {
  return (
    <div className="product-slider">
      <Slider {...sliderSettings}>
        {data.map((p, index) => (
          <div key={index} className="product-slide__item">
            <Product data={p} />
          </div>
        ))}
      </Slider>
    </div>
  );
}
