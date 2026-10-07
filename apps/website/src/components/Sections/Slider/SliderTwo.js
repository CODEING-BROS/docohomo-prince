import React, { useState, useEffect } from "react";
import { CSSTransition } from "react-transition-group";
import classNames from "classnames";
import Slider from "react-slick";

import Button from "../../Control/Button";
import { PrevArrow, NextArrow } from "../../Other/SliderArrow";
import { bannerAltTag } from "../../../lib/constant/banner";

export default function SliderTwo({ className, data, showArrows, showDots }) {
  const [sliderIndex, setSliderIndex] = useState();
  const [sliderReady, setSliderReady] = useState();
  useEffect(() => {
    setSliderIndex(0);
  }, []);
  const settings = {
    dots: showDots,
    arrows: showArrows,
    infinite: true,
    speed: 1000,
    autoplay: true,
    slidesToShow: 1,
    slidesToScroll: 1,
    fade: true,
    prevArrow: <PrevArrow />,
    nextArrow: <NextArrow />,
    dotsClass: "slider-dots container",
    customPaging: (i) => {
      return <div className="slider-dot"></div>;
    },
    onInit: () => {
      setSliderReady(true);
    },
    beforeChange: (oldIndex, newIndex) => {
      setTimeout(() => {
        setSliderReady(false);
      }, 10);
    },
    afterChange: (index) => {
      setSliderIndex(index);
      setSliderReady(true);
    },
  };
  return (
    <div className={`slider ${classNames(className)} bannerwala`}>
      <div className="slider__carousel">
        <Slider {...settings}>
          {data.map((slide, index) => (
            <div
              className={"slider__carousel__item " + `slider-${index + 1}`}
              key={index}
            >
              <div className="container">
                <div className="slider-background">
                  <CSSTransition
                    in={sliderIndex === index && sliderReady}
                    timeout={2000}
                    classNames="slider-zoom-in"
                    unmountOnExit
                  >
                    <img
                      src={slide?.image_url}
                      alt={bannerAltTag[index] || "dochomoeo pathology ecommerce websites."}
                    />
                  </CSSTransition>
                 
                </div>
                <div className="slider-content">
                  {slide?.subTitle && (
                    <div className="slider-animation-wrapper">
                      <CSSTransition
                        in={sliderIndex === index && sliderReady}
                        timeout={2000}
                        classNames={classNames(slide.animationClass.subtitle)}
                        unmountOnExit
                      >
                        <h5 className="slider-content__subtitle">
                          {slide.subTitle}
                        </h5>
                      </CSSTransition>
                    </div>
                  )}
                  <div className="slider-animation-wrapper">
                    <CSSTransition
                      in={sliderIndex === index && sliderReady}
                      timeout={2000}
                      classNames={classNames(slide?.animationClass?.title)}
                      unmountOnExit
                    >
                      <h1 className="slider-content__title">
                        {slide?.title?.span && (
                          <>
                            <span>{slide.title.span} </span>
                            <br />
                          </>
                        )}

                        {slide?.title?.main}
                      </h1>
                    </CSSTransition>
                  </div>
                  {slide.description && (
                    <div className="slider-animation-wrapper">
                      <CSSTransition
                        in={sliderIndex === index && sliderReady}
                        timeout={2000}
                        classNames={classNames(
                          slide.animationClass.description
                        )}
                        unmountOnExit
                      >
                        <p className="slider-content__description">
                          {slide.description}
                        </p>
                      </CSSTransition>
                    </div>
                  )}
                  <div className="slider-animation-wrapper">
                    <CSSTransition
                      in={sliderIndex === index && sliderReady}
                      timeout={2000}
                      classNames={classNames(slide?.animationClass?.button)}
                      unmountOnExit
                    >
                      <div>
                        <Button
                          action={process.env.PUBLIC_URL + "#"}
                          content={slide?.btn?.content}
                          color={slide?.btn?.color}
                        />
                      </div>
                    </CSSTransition>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </Slider>
      </div>
    </div>
    
  );
}
