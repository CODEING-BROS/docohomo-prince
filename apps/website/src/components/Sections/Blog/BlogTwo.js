import React from "react";
import SectionTitleOne from "../SectionTitle/SectionTitleOne";
import Slider from "react-slick";

import PostCardTwo from "../../Post/PostCardTwo";

export default function BlogTwo({ data }) {
  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 3,
    slidesToScroll: 1,
    arrows: false,
    dots: false,
    responsive: [
      {
        breakpoint: 992,
        settings: {
          slidesToShow: 2,
        },
      },
      {
        breakpoint: 768,
        settings: {
          slidesToShow: 1,
        },
      },
    ],
  };
  return (
    <div className="blog-two">
      <div className="container">
        <SectionTitleOne align="center" hideDecoration>
          Tips & tricks
        </SectionTitleOne>
        <div className="blog-two__content">
          <Slider {...settings}>
            {data.map((item, index) => (
              <div key={index} className="slider-item">
                <PostCardTwo data={item} />
              </div>
            ))}
          </Slider>
        </div>
      </div>
    </div>
  );
}
