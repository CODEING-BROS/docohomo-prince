import React, { useRef, useEffect } from "react";
import Parallax from "parallax-js";

import Button from "../../Control/Button";

export default function IntroductionThree() {
  const bg1 = useRef(null);
  const bg2 = useRef(null);
  useEffect(() => {
    let parallax1 = new Parallax(bg1.current);
    let parallax2 = new Parallax(bg2.current);
    return () => {
      parallax1.disable();
      parallax2.disable();
    };
  }, []);
  return (
    <div className="introduction-three">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-12 col-md-6">
            <div className="introduction-three__image">
              <div className="introduction-three__image__background">
                <img
                  src="/assets/images/introduction/IntroductionThree/bg.png"
                  alt="background"
                />
              </div>

              <div className="introduction-three__image__detail">
                <div className="image__item">
                  <div ref={bg1} className="wrapper">
                    <img
                      data-depth="0.3"
                      src="/assets/images/introduction/IntroductionThree/img-1.png"
                      alt="image"
                    />
                  </div>
                </div>
                <div className="image__item">
                  <div ref={bg2} className="wrapper">
                    <img
                      data-depth="0.8"
                      data-invert-x
                      data-invert-y
                      src="/assets/images/introduction/IntroductionThree/img-2.png"
                      alt="image"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-6">
            <div className="introduction-three__content">
              <h5>About Dochomoeo</h5>
              <h3>
                <span>Natural </span>
                skin care
                <br />
                professional
              </h3>
              <div className="more-description">
                <img
                  src={
                    process.env.PUBLIC_URL +
                    "/assets/images/introduction/IntroductionThree/decoration.png"
                  }
                  alt="Decoration"
                />
                <span>
                  Best treatment for curing stubborn whiteheads. Your skin loves
                  it
                </span>
              </div>
              <p>
                Dolor sit amet, consectetur adipiscing elit, sed do eiusmod
                tempor incididunt ut labore et dolore magna aliqua. Quis
                pendisse ultrices gravida. Risus commodo viverra lacus vel
                facilisis.
              </p>
              <Button color="dark" content="Read more" action="#" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
