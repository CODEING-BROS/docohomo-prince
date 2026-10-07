import Link from "next/link";
import SubcribeEmail from "../Other/SubcribeEmail";

import SocialIcons from "../Other/SocialIcons";
import footerLinks from "../../data/footer/links.json";
import footerInfomation from "../../data/footer/info.json";

export default function FooterOne() {
  return (
    <div className="footer-one">
      <div className="container">
        <div className="footer-one__header">
          
          <div className="footer-one__header__logo">
            {/* <Link href={process.env.PUBLIC_URL + "/homepages/homepage1"}> */}
            
            <a>
              <img src={process.env.PUBLIC_URL + "/doc.png"} alt="Logo" />
            </a>

            {/* </Link> */}
          </div>
          {/* <div className="footer-one__header__newsletter">
            <span>Subscribe Newletter:</span>
            <SubcribeEmail
              mailchimpUrl="https://jster.us7.list-manage.com/subscribe/post?u=ed40c0084a0c5ba31b3365d65&id=ec6f32bf5e"
              placeholder="Enter your email"
              btnContent={<i className="fas fa-paper-plane" />}
              className="footer-one-newsletter"
            />
          </div> */}
          <div className="footer-one__header__social">
            <SocialIcons className="-border" />
          </div>
        </div>
        <div className="footer-one__body">
          <div className="row">
            <div className="col-12 col-md-6 col-lg-4">
              <div className="footer__section -info">
                <h5 className="footer-title">About us</h5>
                <p style={{}}>
                  This Website is owned and managed by JYOTI HOMEO CENTRE . At
                  DocHomoeo we are dedicated to revolutionizing healthcare by
                  bridging the gap between patients and homoeopathic medicine.
                  Our mission is to provide convenient access to high-quality
                  homoeopathic medicines, expert medical consultations, and
                  unparalleled service to people worldwide.
                </p>
                {/* <h5 className="footer-title">Contact info</h5>
                <p>
                  Address: <span>{footerInfomation.address}</span>
                </p>
                <p>
                  Phone: <span>{footerInfomation.phone}</span>
                </p>
                <p>
                  Email: <span>{footerInfomation.email}</span>
                </p>
                <p>
                  Opentime: <span>{footerInfomation.open}</span>
                </p> */}
              </div>
            </div>
            <div className="col-12 col-md-6 col-lg-4">
              <div className="footer__section -links">
                <div className="row">
                  {/* <div className="col-12 col-sm-6">
                    <h5 className="footer-title">Account</h5>
                    <ul>
                      {footerLinks.accountLinks.map((link, index) => (
                        <li key={index}>
                          <Link href={link.to}>
                            <a>{link.name}</a>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div> */}
                  <div className="col-12 col-sm-6">
                    <h5 className="footer-title">Infomation</h5>
                    <ul>
                      {footerLinks.informationLinks.map((link, index) => (
                        <li key={index}>
                          <Link href={link.to}>
                            <a
                              style={{
                                textAlign: "left",
                                width: "max-content",
                              }}
                            >
                              {link.name}
                            </a>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-12 col-lg-4">
              <div className="footer__section -payment">
                <h5 className="footer-title">Payment methods</h5>
                <p>
                  Experience Hassle-Free Payments with Our Secure and Convenient
                  Methods.
                </p>
                <div className="payment-methods d-flex space-between">
                <img height="56.38px" className="payemnt1 mr-2"
                    src={
                      process.env.PUBLIC_URL +
                      "/assets/images/footer/phonepe.png"
                    }
                    alt="Payment methods"
                  />
                  <img height="100%"  className="payemnt2"
                    src={
                      process.env.PUBLIC_URL +
                      "/assets/images/footer/payment.png"
                    }
                    alt="Payment methods"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="footer-one__footer">
        <div className="container">
          <div className="footer-one__footer__wrapper">
            <p>© Copyright 2023 Dochomoeo</p>
            <ul>
              {footerLinks.creditLinks.map((link, index) => (
                <li key={index}>
                  <Link href={link.to}>
                    <a>{link.name}</a>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
