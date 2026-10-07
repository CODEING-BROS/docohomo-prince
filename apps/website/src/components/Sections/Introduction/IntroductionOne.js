import React, { useRef, useEffect } from "react";
import Parallax from "parallax-js";

import Button from "../../Control/Button";
import SectionTitleOne from "../SectionTitle/SectionTitleOne";

export default function IntroductionOne({ data }) {
  // const bg1 = useRef(null);
  // const bg2 = useRef(null);
  // useEffect(() => {
  //   let parallax1 = new Parallax(bg1.current);
  //   let parallax2 = new Parallax(bg2.current);
  //   return () => {
  //     parallax1.disable();
  //     parallax2.disable();
  //   };
  // }, []);

  return (
    <div className="introduction-one">
      <div className="container">
        <div className="row align-items-center">
          
          <div className="container">
            <div className="introduction-one__content">
              <h5>About DocHomoeo</h5>
              <p
                style={{
                  textAlign: "justify",
                  color: "black",
                }}
              >
                At DocHomoeo we are dedicated to revolutionizing healthcare by
                bridging the gap between patients and homoeopathic medicine. Our
                mission is to provide convenient access to high-quality
                homoeopathic medicines, expert medical consultations, and
                unparalleled service to people worldwide.
              </p>
              <h5>Our Services</h5>
              <ol
                style={{
                  lineHeight: "3em",
                  textAlign: "justify",
                }}
                className="p-0"
              >
                <li>
                  Online Homoeopathic Medicine Delivery: We understand the
                  importance of timely access to medicine. That's why we offer
                  door-to-door delivery of homoeopathic remedies, ensuring you
                  receive the care you need when you need it, no matter where
                  you are in the world.
                </li>
                <li>
                  Online Doctor Consultations: Access to experienced
                  homoeopathic doctors has never been easier. Our platform
                  connects patients with skilled practitioners from around the
                  world. Get personalized consultations from the comfort of your
                  home.
                </li>
                <li>
                  Bulk Inquiry for Doctors: We value the work of healthcare
                  professionals. To support doctors in their practice, we offer
                  a bulk inquiry service with attractive discounts. Ensure your
                  patients receive the best care with quality homoeopathic
                  medicines.
                </li>
                <li>
                  Job Opportunities for Doctors: We believe in creating
                  opportunities for talented doctors globally. Join our team of
                  dedicated healthcare professionals and expand your practice
                  while helping patients on a global scale.
                </li>
              </ol>
              <p
                style={{
                  color: "black",
                  fontWeight: "bold",
                }}
              >
                Email us on Contact.dochomoeo.com
              </p>
              <h5>Our Commitment</h5>
              <ul
                style={{
                  lineHeight: "2em",
                  textAlign: "justify",
                }}
              >
                <li>
                  <strong>Quality Assurance:</strong> We adhere to strict
                  quality standards to ensure the efficacy and safety of the
                  products we deliver.
                </li>
                <li>
                  <strong>Global Reach:</strong> Our services are accessible to
                  patients and doctors worldwide, promoting homoeopathic
                  healthcare on a global scale.
                </li>
                <li>
                  <strong>Customer Satisfaction:</strong> Your health and
                  satisfaction are our top priorities. We are here to serve you
                  24/7.
                </li>
              </ul>
              <p
                style={{
                  textAlign: "justify",
                  color: "black",
                }}
              >
                At Doc Homoeo, we're not just a healthcare platform; we're a
                community dedicated to holistic well-being. Join us in your
                journey towards a healthier life, supported by the expertise of
                homoeopathic doctors and the convenience of online services.
                Discover the world of homoeopathy with Doc Homoeo today!
              </p>
              {/* <Button
                color={data.btn.color}
                content={data.btn.content}
                action="#"
              /> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
