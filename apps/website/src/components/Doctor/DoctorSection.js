import React, { useState } from "react";
import Slider from "react-slick";
import { PrevArrow, NextArrow } from "../Other/SliderArrow";
import Link from "next/link";
import { DoctorForm } from "../form/DoctorForm";

export default function DoctorSection({ data }) {
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
    slidesToScroll: 1,
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

  const [show, setShow] = useState(false);
  const [doctorData, setDoctorData] = useState([]);

  return (
    <>
      <div className="container">
        <div className="doctorsection">
          {/* <div className="three">
          <h1>Our Doctors</h1>
        </div> */}

          {/* <div className="two">
            <h2>
             
              <span>Consult with our experienced doctors</span>
            </h2>
          </div> */}

          <div className="doctorsection__wrapper">
            {data.map((item) => {
              const len = item?.languages?.split(",").length;
              const leg = item?.languages?.split(",").slice(0, 3);
              let t = 0;
              leg?.map((item) => {
                t += item.length;
              });
              return (
                <main className="qr-container pb-3">
                  <div className="img-block">
                    <div>
                      <img
                        src={
                          item?.image?.image_url
                            ? item.image.image_url
                            : "https://www.woodlandshospital.in/images/doctor-img/Soutik-Panda-New1.jpg"
                        }
                        alt="QR code"
                      />
                    </div>
                  </div>
                  <div className="rectangle mt-0">
                    <p className="text1 mt-0">{item.name}</p>
                    <p className="text2">{item.Specialization}</p>
                  </div>
                  <article className="info-block pt-1">
                    <span className="docinfo">
                      {item.experience} + years of experience <br />
                      {/* {item?.languages?.slice(0, t + 2)} { (len - leg.length) === 0 ? "" : <>
                       + {(len - leg.length)}
                      </> } */}
                    </span>
                    <div className="docinfo">
                      {/* {item.experience} + years of experience <br /> */}
                      <span>
                        {item?.languages?.slice(0, t + 2)}{" "}
                        {len - leg.length === 0 ? (
                          ""
                        ) : (
                          <>+ {len - leg.length}</>
                        )}
                      </span>
                    </div>

                    <br />
                    {/* <Link
                      href={`${process.env.PUBLIC_URL}/doctors/[slug]`}
                      // href={`#`}
                      as={`${process.env.PUBLIC_URL}/doctors/${item._id}`}
                      // as={`#`}
                    > */}
                    <button
                      className="button-24"
                      onClick={() => {
                        setDoctorData(item);
                        console.log(item);
                        setShow(true);
                      }}
                    >
                      Consult Doctor
                    </button>
                    {/* </Link> */}
                  </article>
                </main>
              );
            })}
          </div>

          {/* <div className="doctorsection__wrapper">
          {data.slice(4,8).map((item) => {
            return (
              <main className="qr-container">
                <div className="img-block">
                  <div>
                    <img src={item.image.image_url} alt="QR code" />
                  </div>
                </div>
                <div className="rectangle">
                  <p className="text1">{item.name}</p>
                  <p className="text2">{item.Specialization}</p>
                </div>
                <article className="info-block">
                  <h4>{item.experience} + years of experience</h4>
                  <Link
                    href={`${process.env.PUBLIC_URL}/doctors/[slug]`}
                    // href={`#`}
                    as={`${process.env.PUBLIC_URL}/doctors/${item._id}`}
                    // as={`#`}
                  >
                    <button className="button-24">Consult Doctor</button>
                  </Link>
                </article>
              </main>
            );
          })}
        </div> */}

          {/* </div> */}
        </div>
        <DoctorForm show={show} setShow={setShow} data={doctorData} />
      </div>
    </>
  );
}
