import Link from "next/link";

import SocialIcons from "../../components/Other/SocialIcons";
import SubscribeEmail from "../Other/SubcribeEmail";

export default function FooterTwo() {
  return (
    <div className="footer-two">
      <div className="container">
        <div className="row">
          <div className="col-12 col-md-8 col-xl-6 mx-auto">
            <div className="footer-two__content">
              <Link href={process.env.PUBLIC_URL + "/homepages/homepage1"}>
                <a className="footer-two__content__logo">
                  <img
                    src={process.env.PUBLIC_URL + "/assets/images/logo.png"}
                    alt="Logo"
                  />
                </a>
              </Link>
              <p className="footer-two__content__description">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
                eiusmod tempor incididunt ut labore et dolore magna aliqua. Quis
                ipsum suspendisse ultrices gravida. Risus commodo viverra
                maecenas accumsan lacus vel facilisis.
              </p>
              <SubscribeEmail
                mailchimpUrl="https://jster.us7.list-manage.com/subscribe/post?u=ed40c0084a0c5ba31b3365d65&id=ec6f32bf5e"
                placeholder="Enter your email"
                btnContent="Subcribe"
                className="footer-two-newsletter"
              />
              <SocialIcons className="-border -border--light-bg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
