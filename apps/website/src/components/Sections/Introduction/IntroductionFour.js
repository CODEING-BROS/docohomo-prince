import Link from "next/link";

export default function IntroductionFour() {
  return (
    <div className="introduction-four">
      <div className="container">
        <div className="row">
          <div className="col-12">
            <div className="row">
              <div className="col-12 col-md-6 col-lg-4">
                <div className="introduction-four__item -style-1">
                  <div className="introduction-four__item__content">
                    <h3>
                      Meet <span>trends</span>
                    </h3>
                    <h5>of the season</h5>
                    <Link
                      href={process.env.PUBLIC_URL + "/fullwidth-4col"}
                    >
                      <a className="btn -transparent -underline">Shop Now</a>
                    </Link>
                  </div>
                  <div className="introduction-four__item__image">
                    <img
                      src={
                        process.env.PUBLIC_URL +
                        "/assets/images/introduction/IntroductionFour/1.png"
                      }
                      alt="Meet trends of the season"
                    />
                  </div>
                </div>
              </div>
              <div className="col-12 col-md-6 mx-auto">
                <div className="introduction-four__item -style-2">
                  <div className="introduction-four__item__content">
                    <h3>
                      Skin <span>2.0</span>
                    </h3>
                    <h5>Your regimen upgraded</h5>
                    <Link
                      href={process.env.PUBLIC_URL + "/fullwidth-4col"}
                    >
                      <a className="btn -transparent -underline">Shop Now</a>
                    </Link>
                  </div>
                  <div className="introduction-four__item__image">
                    <img
                      src={
                        process.env.PUBLIC_URL +
                        "/assets/images/introduction/IntroductionFour/2.png"
                      }
                      alt="Meet trends of the season"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-12">
            <div className="row">
              <div className="col-12 col-md-6 col-lg-5">
                <div className="introduction-four__item -style-3">
                  <div className="introduction-four__item__content">
                    <h3>
                      <span>Alima</span>
                    </h3>
                    <h5>Matte Collection</h5>
                    <Link
                      href={process.env.PUBLIC_URL + "/fullwidth-4col"}
                    >
                      <a className="btn -transparent -underline">Shop Now</a>
                    </Link>
                  </div>
                  <div className="introduction-four__item__image">
                    <img
                      src={
                        process.env.PUBLIC_URL +
                        "/assets/images/introduction/IntroductionFour/3.png"
                      }
                      alt="Meet trends of the season"
                    />
                  </div>
                </div>
              </div>
              <div className="col-12 col-md-6 ml-auto">
                <div className="introduction-four__item -style-4">
                  <div className="introduction-four__item__content">
                    <h3>
                      Up to <span>70%</span> off
                    </h3>
                    <h5>Limited time only</h5>
                    <Link
                      href={process.env.PUBLIC_URL + "/fullwidth-4col"}
                    >
                      <a className="btn -transparent -underline">Shop Now</a>
                    </Link>
                  </div>
                  <div className="introduction-four__item__image">
                    <img
                      src={
                        process.env.PUBLIC_URL +
                        "/assets/images/introduction/IntroductionFour/4.png"
                      }
                      alt="Meet trends of the season"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
