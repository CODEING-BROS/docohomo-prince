import React, { useRef, useState, useEffect } from "react";
import Slider from "react-slick";
import { PrevArrow, NextArrow } from "../../Other/SliderArrow";

export default function ProductDetailSlideTwo({ data, product_images }) {
  const slider1Settings = {
    arrows: false,
    swipe: false,
    slidesToShow: 1,
  };

  const slider2Setting = {
    arrows: true,
    focusOnSelect: true,
    slidesToShow: data.images && data.images.length < 3 ? data.images.length : 3,
    arrows: true,
    centerMode: true,
    centerPadding: "80px",
    prevArrow: <PrevArrow />,
    nextArrow: <NextArrow />,
    // adaptiveHeight: true,
    // responsive: [
    //   {
    //     breakpoint: 992,
    //     settings: {
    //       slidesToShow: 1,
    //     },
    //   },
    //   {
    //     breakpoint: 768,
    //     settings: {
    //       centerPadding: "50px",
    //     },
    //   },
    //   {
    //     breakpoint: 576,
    //     settings: {
    //       slidesToShow: 1,
    //       centerPadding: "50px",
    //     },
    //   },
    // ],
  };
  // console.log(data.images);
  const [nav1, setNav1] = useState();
  const [nav2, setNav2] = useState();
  console.log("product_images", product_images);

  // const productImages = data.images
  // console.log("productImages",productImages)
  // const imageData =[
  //   {id:0,image_url:'https://firebasestorage.googleapis.com/v0/b/kozmo-cloud.appspot.com/o/kozmocloud%2Fproducts%2Fvesca220ch%2FMon%2C%2014%20Aug%202023%2007%3A25%3A30%20GMT--3943-1-1000.jpg?alt=media&token=75724c5d-ef48-45d2-a4ed-9fa5d182c63b'},
  //   {id:2,image_url:'https://firebasestorage.googleapis.com/v0/b/kozmo-cloud.appspot.com/o/kozmocloud%2Fproducts%2Fvesca220ch%2FMon%2C%2014%20Aug%202023%2007%3A25%3A30%20GMT--3943-1-1000.jpg?alt=media&token=75724c5d-ef48-45d2-a4ed-9fa5d182c63b'},
  //   {id:3,image_url:'https://firebasestorage.googleapis.com/v0/b/kozmo-cloud.appspot.com/o/kozmocloud%2Fproducts%2Fvesca220ch%2FMon%2C%2014%20Aug%202023%2007%3A25%3A30%20GMT--3943-1-1000.jpg?alt=media&token=75724c5d-ef48-45d2-a4ed-9fa5d182c63b'},
  //   {id:4,image_url:'https://firebasestorage.googleapis.com/v0/b/kozmo-cloud.appspot.com/o/kozmocloud%2Fproducts%2Fvesca220ch%2FMon%2C%2014%20Aug%202023%2007%3A25%3A30%20GMT--3943-1-1000.jpg?alt=media&token=75724c5d-ef48-45d2-a4ed-9fa5d182c63b'},
  //   {id:5,image_url:'https://firebasestorage.googleapis.com/v0/b/kozmo-cloud.appspot.com/o/kozmocloud%2Fproducts%2Fvesca220ch%2FMon%2C%2014%20Aug%202023%2007%3A25%3A30%20GMT--3943-1-1000.jpg?alt=media&token=75724c5d-ef48-45d2-a4ed-9fa5d182c63b'},
  //   {id:6,image_url:'https://firebasestorage.googleapis.com/v0/b/kozmo-cloud.appspot.com/o/kozmocloud%2Fproducts%2Fvesca220ch%2FMon%2C%2014%20Aug%202023%2007%3A25%3A30%20GMT--3943-1-1000.jpg?alt=media&token=75724c5d-ef48-45d2-a4ed-9fa5d182c63b'},

  // ]

  // console.log("imageDataimageData=",imageData)

  return (
    <div className="product-detail__slide-two">
      <div className="product-detail__slide-two__big">
        <Slider asNavFor={nav2} ref={(c) => setNav1(c)} {...slider1Settings}>
          {data &&
            data?.images.map((img, index) => (
              <div key={index} className="slider__item">
                <img src={img.image_url} alt="Product image" />
              </div>
            ))}
        </Slider>
      </div>
      {/* {data.images &&
            data.images.map((img, index) => (
              <div key={index} className="slider__item">
                <img src={img.image_url} alt="Product image" /> 
              </div>
            ))} */}
      <div className="product-detail__slide-two__small">
        {data.images.length !== 1 && (
          <Slider asNavFor={nav1} ref={(c) => setNav2(c)} {...slider2Setting}>
            {/* {
            product_images.map((val, index) => (
              <div key={index} className="slider__item" >
                <img  key={index} src={val.image_url} alt="Product image" /> 
              </div>
            ))} */}
            {data.images &&
              data.images.map((val, index) => (
                <div key={index} className="slider__item" >
                  <img key={index} src={val.image_url} alt="Product image" style={{
                  maxWidth: "60px",
                  maxHeight: "60px"
                }}/>
                </div>
              ))}
          </Slider>
        )}
      </div>
    </div>
  );
}
