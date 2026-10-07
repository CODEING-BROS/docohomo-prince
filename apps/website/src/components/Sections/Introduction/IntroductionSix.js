import React from "react";
import SectionTitleOne from "../SectionTitle/SectionTitleOne";
import Link from "next/link";

export default function IntroductionSix({ data }) {
  return (
    <div className="introduction-six">
      <div className="container">
        <SectionTitleOne align="center">What Ingredients?</SectionTitleOne>
        <div className="introduction-six__wrapper">
          <div className="row">
            {data.map((item, index) => (
              <div key={index} className="col-12 col-md-6 col-lg-4">
                <div className="introduction-six__wrapper__item">
                  <div className="introduction-six__wrapper__item__image">
                    <img src={item.image} alt={item.title} />
                  </div>
                  <div className="introduction-six__wrapper__item__content">
                    <Link href={process.env.PUBLIC_URL + "#"}>
                      <a>{item.title}</a>
                    </Link>
                    <p>{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
