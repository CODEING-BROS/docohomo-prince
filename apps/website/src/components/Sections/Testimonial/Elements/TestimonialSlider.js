import { useState, useEffect, useRef } from "react";
import Slider from "react-slick";
import classNames from "classnames";

import Rate from "../../../../components/Other/Rate";
// import data from "../../../../data/Testimonial/data.json";

export default function TestimonialSlider({
  showDots,
  showArrows,
  reverseLayout,
  children,
  data,
}) {
  const slider1 = useRef(null);
  const slider2 = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const slider1Settings = {
    slideToShow: 1,
    rows: 2,
    slidesPerRow: 4,
    arrow: false,
  };
  const slider2Settings = {
    slideToShow: 1,
    arrows: false,
    swipeToSlide: true,
    arrows: false,
    dots: showDots,
    dotsClass: showDots && "slider-dots",
    customPaging:
      showDots &&
      function (i) {
        return <div className="slider-dot"></div>;
      },
    afterChange: (index) => {
      setCurrentIndex(index);
    },
  };
  return (
    <div>
      <div className="testimonial-slider">
        <div className="row">
          <div
            className={`col-12 col-md-6 ${classNames({
              "order-2": reverseLayout,
            })}`}
          >
            <div className="slide-nav">
              <Slider ref={slider1} {...slider1Settings}>
                {data.map((item, index) => (
                  <div
                    key={index}
                    className={`${classNames({
                      active: currentIndex === index,
                    })} slide-nav__item`}
                    onClick={() => {
                      setCurrentIndex(index);
                      slider2.current.slickGoTo(index);
                    }}
                  >
                    <img style={{
                      width: '100%', height: '120px',objectFit:"cover"
                    }} src={item.image} alt="Customer avatar" />
                  </div>
                ))}
              </Slider>
            </div>
          </div>
          <div
            className={`col-12 col-md-6 ${classNames({
              "order-1": reverseLayout,
            })}`}
          >
            <div className="slide-for">
              <Slider ref={slider2} {...slider2Settings}>
                {data.map((item, index) => (
                  <div key={index} className="slide-for__item">
                    {children}
                    <div className="slide-for__item__header">
                      <div className="quote-icon">
                        <i className="fas fa-quote-right"></i>
                      </div>
                      <div className="customer__info">
                        <h3>{item.name}</h3>
                        {/* <h5>{item.city}</h5> */}
                      </div>
                      <Rate currentRate={item.rate} />
                    </div>
                    <p className="slide-for__item__content">{item.review}</p>
                  </div>
                ))}
              </Slider>
              {showArrows && (
                <div className="testimonial-one__slider-control">
                  <a
                    href={process.env.PUBLIC_URL + "#"}
                    onClick={(e) => {
                      e.preventDefault();
                      slider2.current.slickPrev();
                    }}
                  >
                    <i className="far fa-angle-left"></i>
                    Prev
                  </a>
                  <a
                    href={process.env.PUBLIC_URL + "#"}
                    onClick={(e) => {
                      e.preventDefault();
                      slider2.current.slickNext();
                    }}
                  >
                    Next
                    <i className="far fa-angle-right"></i>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
