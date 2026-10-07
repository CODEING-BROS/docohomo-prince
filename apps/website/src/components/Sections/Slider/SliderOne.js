import React, { useState, useEffect } from "react";
import classNames from "classnames";
import { CSSTransition } from "react-transition-group";

import Button from "../../Control/Button";

export default function SliderOne({ data, className }) {
  const [contentShow, setContentShow] = useState(false);
  useEffect(() => {
    setContentShow(true);
  }, []);
  return (
    <div className={`slider ${classNames(className)}`}>
      <img
        className="slider-background"
        src={process.env.PUBLIC_URL + data.image}
        alt="Slider background"
      />
      <div className="container">
        <div className="slider-content">
          <div className="slider-animation-wrapper">
            <CSSTransition
              in={contentShow}
              timeout={2000}
              classNames={classNames(data.animationClass.title)}
              unmountOnExit
            >
              <h5 className="slider-content__subtitle">{data.subTitle}</h5>
            </CSSTransition>
          </div>
          <div className="slider-animation-wrapper">
            <CSSTransition
              in={contentShow}
              timeout={2000}
              classNames={classNames(data.animationClass.subtitle)}
              unmountOnExit
            >
              <h1 className="slider-content__title">{data.title}</h1>
            </CSSTransition>
          </div>

          {data.description && (
            <div className="slider-animation-wrapper">
              <CSSTransition
                in={contentShow}
                timeout={2000}
                classNames={classNames(data.animationClass.description)}
                unmountOnExit
              >
                <p className="slider-content__description">
                  {data.description}
                </p>
              </CSSTransition>
            </div>
          )}
          <div className="slider-animation-wrapper">
            <CSSTransition
              in={contentShow}
              timeout={2000}
              classNames={classNames(data.animationClass.button)}
              unmountOnExit
            >
              <div>
                <Button
                  action="/homepages/homepage1"
                  content={data.btn.content}
                  color={data.btn.color}
                />
              </div>
            </CSSTransition>
          </div>
        </div>
      </div>
    </div>
  );
}
