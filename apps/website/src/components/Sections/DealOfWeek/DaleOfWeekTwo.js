import React, { useRef, useEffect } from "react";
import Countdown, { zeroPad } from "react-countdown";
import Parallax from "parallax-js";

import Button from "../../Control/Button";

export default function DaleOfWeekTwo() {
  const img = useRef(null);
  useEffect(() => {
    let parallax1 = new Parallax(img.current);
    return () => {
      parallax1.disable();
    };
  }, []);
  return (
    <div className="dow-two">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-12 col-lg-6 order-lg-2">
            <div className="dow-two__image">
              <div ref={img} className="dow-two__image__parallax">
                <img
                  data-depth="0.4"
                  data-invert-x
                  data-invert-y
                  src={
                    process.env.PUBLIC_URL +
                    "/assets/images/deal_of_week/DOWTwo/1.png"
                  }
                  alt="Dale of the week image"
                />
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-6 order-lg-1">
            <div className="dow-two__content">
              <h5>Deal of the week</h5>
              <h3>Lip and liner</h3>
              <div className="special-price">
                <p>$20.00</p>
                <span>$30.00</span>
              </div>
              <Countdown
                date={Date.now() + 100000000}
                renderer={({ days, hours, minutes, seconds }) => {
                  return (
                    <div className="dow-two__content__countdown">
                      <div className="countdown__item">
                        <h6>{zeroPad(days)}</h6> <span>days</span>
                      </div>
                      <div className="countdown__item">
                        <h6>{zeroPad(hours)}</h6> <span>hours</span>
                      </div>
                      <div className="countdown__item">
                        <h6>{zeroPad(minutes)} </h6>
                        <span>minutes</span>
                      </div>
                      <div className="countdown__item">
                        <h6>{zeroPad(seconds)}</h6> <span>sec</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Button
                action={process.env.PUBLIC_URL + "#"}
                color="white "
                content="Shop now"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
