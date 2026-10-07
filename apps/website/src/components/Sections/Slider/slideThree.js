import React, { useState, useEffect } from "react";
import Slider from "react-slick";
import Button from "../../Control/Button";
import { PrevArrow, NextArrow } from "../../Other/SliderArrow";
import { bannerAltTag } from "../../../lib/constant/banner";

export const SlideThree = ({ data,showArrows,showDots }) => {
  const settings = {
    //pauseOnHover: true,
    //className: "",
    dots: false,
    infinite: true,
    autoplay: true,
    arrows: showArrows,
    focusOnSelect: true,
    //autoplaySpeed: 4000,
    speed: 2700,
   // cssEase: "linear",
    slidesToShow: 1,
    slidesToScroll: 1,
    // prevArrow: <PrevArrow />,
    // nextArrow: <NextArrow />,
    // dotsClass: "slider-dots container",
  };
  return (
    <div className="container">
      <div className="slidethree">
        <Slider {...settings}>
          {data.map((item, index) => {
            return (
              <div style={{
                width:"100%",
                display:"flex",
                justifyContent:"center"
              }} >
              <img
                style={{
                  width: "99%",
                  alignSelf:"center",
                  height: "auto",
                  objectFit: "cover",
                  paddingTop: "5%",
                }}
                src={item.image_url}
                alt={bannerAltTag[index] || "dochomoeo pathology ecommerce websites."}
              />
              </div>
            );
          })}
        </Slider>
      </div>
    </div>
  );
};
