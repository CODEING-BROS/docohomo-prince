import LayoutFour from "../../components/Layout/LayoutOne";
import { Breadcrumb, BreadcrumbItem } from "../../components/Other/Breadcrumb";
import IntroductionOne from "../../components/Sections/Introduction/IntroductionOne";
import introductionOneData from "../../data/introduction/introductionOne.json";
// import IntroductionTwo from "../../components/Sections/Introduction/IntroductionTwo";
// import introductionTwoData from "../../data/pages/about.json";
// import TestimonialOne from "../../components/Sections/Testimonial/TestimonialOne";
// import testimonialOneData from "../../data/testimonial/data.json";
// import Benefits from "../../components/Other/Benefits";
// import IntroductionNine from "../../components/Sections/Introduction/IntroductionNine";
// import InstagramTwo from "../../components/Sections/Instagram/InstagramTwo";

export default function () {
  return (
    <LayoutFour title="Shipping Policy">
      <Breadcrumb title="Shipping Policy">
        <BreadcrumbItem name="Home" />
        <BreadcrumbItem name="Shipping Policy" current />
      </Breadcrumb>
      <div className="introduction-one">
        <div className="container">
          <div className="row align-items-center">
            <div className="container">
              <div className="introduction-one__content">
                {/* <h5>Our Services</h5> */}
                <ol
                  style={{
                    lineHeight: "150%",
                    textAlign: "justify",
                    listStyle:"none"
                  }}
                  className="p-0"
                >
                  <li>
                    <span
                      style={{
                        fontWeight: "bold",
                        color: "black",
                      }}
                    >
                     1. Where do you ship from?
                    </span>
                    <br />
                    We ship from our warehouse in Prayagraj Uttar Pradesh
                  </li>
                  <li className="mt-4">
                    <span
                      style={{
                        fontWeight: "bold",
                        color: "black",
                      }}
                    >
                     2. What shipping service do you use?
                    </span>
                    <br />
                    Most packages are shipped via Ship rocket, but some
                    locations we utilize India Post to ensure the fastest
                    delivery possible.
                  </li>
                  <li className="mt-4">
                    <span
                      style={{
                        fontWeight: "bold",
                        color: "black",
                      }}
                    >
                     3. When will I receive my shipment?
                    </span>
                    <br />
                    We ship all packages by 12pm IST Monday through Sunday. We
                    do not ship on weekends. All packages placed over the
                    weekend will be shipped Monday morning. Packages typically
                    take 3-7 days to arrive for Indian residents, and 7-14 days
                    for international customers. *Please note that weather
                    issues such as storms, blizzards etc can affect delivery
                    times. Such events are out of our control and may effect
                    delivery speed. Updates on emergency events and delivery
                    delays can be viewed on the carriers website
                    (www.shiprocket.com).
                  </li>
                  <li className="mt-4">
                    <span
                      style={{
                        fontWeight: "bold",
                        color: "black",
                      }}
                    >
                     4. How much does shipping cost?
                    </span>
                    <br />
                    Currently shipping for above 399/- shipping is free.
                    International orders may see $8-12 USD in shipping costs.
                  </li>
                  <li className="mt-4">
                    <span
                      style={{
                        fontWeight: "bold",
                        color: "black",
                      }}
                    >
                     5. How do I track my package?
                    </span>
                    <br />
                    You can check on the status of your order at any time by
                    visiting our "track my package" page and inserting your
                    tracking number.
                  </li>
                  <li className="mt-4">
                    <span
                      style={{
                        fontWeight: "bold",
                        color: "black",
                      }}
                    >
                     6. Can I cancel my shipment?
                    </span>
                    <br />
                    Packages cannot be cancelled once they are in transit.
                    Packages can only be cancelled if a shipping label has not
                    been created yet.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LayoutFour>
  );
}
