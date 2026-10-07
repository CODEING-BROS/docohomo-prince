import Slider from "react-slick";
import { PrevArrow, NextArrow } from "../../Other/SliderArrow";
import styled from "styled-components";

const Carousal = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  ${'' /* @media only Screen and (max-width: 40em) {
    width: 80vw;
    .slick-slider .slick-arrow {
      display: none;
    }
  } */}
  .slick-slider .slick-arrow:before {
    color: black;
    font-size: 1.5rem;
  }
  .slick-slider .slick-dots button:before {
    color: white;
    font-size: 1rem;
    @media only Screen and (max-width: 1068px) {
    display:none;
  }
  }
  .slick-slide.slick-active {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    margin: 0;
    padding: 0;
    margin-bottom: 3rem;
  }
`;

export default function ProductCategories({ data }) {
  const settings = {
    pauseOnHover: true,
    //className: "",
    dots: false,
    infinite: true,
    autoplay: false,
    focusOnSelect: true,
    autoplaySpeed: 4000,
    speed: 1000,
    cssEase: "linear",
    slidesToShow: 4,
    slidesToScroll: 2,
    prevArrow: <PrevArrow />,
    nextArrow: <NextArrow />,
   // dotsClass: "slider-dots container",
    responsive: [
      {
        breakpoint: 844,
        settings: {
          slidesToShow: 1,
          slidesToScroll: 1,
          infinite: true,
          dots: true,
        },
      },
      {
        breakpoint: 1030,
        settings: {
          slidesToShow: 2,
          slidesToScroll: 1,
          infinite: true,
          dots: true,
        },
      },
    ],
  };

  return (
    <div>
      <div className="product-categories">
        {/* <div className="two">
          <h1>
            Our Brands
            <span>The Brands you can count upon</span>
          </h1>
        </div> */}
        <div className="product-categories__wrapper">
        <Carousal>
          <Slider {...settings}>
            {data.map((brand) => {
              return (
                <section className="card">
                  <img
                    src="https://download.logo.wine/logo/Dabur/Dabur-Logo.wine.png"
                    alt="Yummix cup cake"
                    className="card-img"
                  />
                </section>
              );
            })}
          </Slider>
        </Carousal>
        </div>
        </div>
    </div>
  );
}
