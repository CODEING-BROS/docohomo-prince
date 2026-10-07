import Slider from "react-slick";
import { PrevArrow, NextArrow } from "../../Other/SliderArrow";
import Link from "next/link";
import Loading from "../../Other/Loading";
// import styled from "styled-components";

// const Carousal = styled.div`
//   ${'' /* width: 90vw; */}
//   display: flex;
//   flex-direction: column;
//   justify-content: center;
//   ${'' /* @media only Screen and (max-width: 40em) {
//     width: 80vw;
//     .slick-slider .slick-arrow {
//       display: none;
//     }
//   } */}
//   .slick-slider .slick-arrow:before {
//     color: black;
//     font-size: 1.5rem;
//   }
//   .slick-slider .slick-dots button:before {
//     color: white;
//     font-size: 1rem;
//     @media only Screen and (max-width: 1068px) {
//     display:none;
//   }
//   }
//   .slick-slide.slick-active {
//     display: flex;
//     justify-content: center;
//     align-items: center;
//     flex-direction: column;
//     margin: 0;
//     padding: 0;
//     margin-bottom: 3rem;
//   }
// `;

export default function BrandsTwo({ data, mainHeading, description }) {
  const settings = {
    //pauseOnHover: true,
    //className: "",
    dots: false,
    infinite: true,
    autoplay: true,
    //focusOnSelect: true,
    //autoplaySpeed: 4000,
    speed: 800,
    cssEase: "ease-in",
    slidesToShow: 5,
    slidesToScroll: 2,
    prevArrow: <PrevArrow />,
    nextArrow: <NextArrow />,
    // dotsClass: "slider-dots container",
    responsive: [
      {
        breakpoint: 844,
        settings: {
          slidesToShow: 2,
          slidesToScroll: 1,
          infinite: true,
        },
      },
      {
        breakpoint: 1030,
        settings: {
          slidesToShow: 2,
          slidesToScroll: 1,
          infinite: true,
        },
      },
    ],
  };

  console.log(data);

  if (!data) return <Loading />;

  return (
    <div className="container">
      <div className="brand-two">
        <div className="two">
          <h1>
            {mainHeading}
            <span>{description}</span>
          </h1>
        </div>
        <div className="brand-two__wrapper">
          <Slider {...settings}>
            {data.map((brand) => {
              return (
                <Link
                  href={`${process.env.PUBLIC_URL}/[slug]`}
                  // href={`#`}
                  as={`${process.env.PUBLIC_URL}/${brand.main_category_name.trim().replaceAll(" ","-")}`}
                  // as={`#`}
                >
                  <img
                    src={brand.main_category_image?.image_url}
                    alt={brand.main_category_name + " logo" || "dochomoeo brand"}
                    className="card-img curselink"
                    // onClick={() => {
                    //   window.location.replace(`/search/${brand.main_category_name}`);
                    // }}
                  />
                </Link>
              );
            })}
          </Slider>
        </div>
      </div>
    </div>
  );
}
