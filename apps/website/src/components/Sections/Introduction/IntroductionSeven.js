import { useState } from "react";
import { Accordion, Card } from "react-bootstrap";

import Button from "../../Control/Button";
import SectionTitleOne from "../SectionTitle/SectionTitleOne";
import Quantity from "../../../components/Control/Quantity";

export default function IntroductionSeven({ data }) {
  const [currentAccordionIndex, setCurrentAccordionIndex] = useState(1);
  const [quantity, setQuantity] = useState();
  return (
    <div className="introduction-seven">
      <div className="introduction-seven__wrapper -top">
        <div className="introduction-seven__wrapper__content">
          <div className="container">
            <div className="row no-gutters">
              <div className="col-12 col-lg-9 col-xl-6">
                <div className="introduction-seven__wrapper__content__detail">
                  <h5>Put it in Neutral</h5>
                  <SectionTitleOne hideDecoration spaceBottom="1.2em">
                    Enlightened Beauty
                  </SectionTitleOne>
                  <h3>$125.00</h3>
                  <p>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed
                    do eiusmod tempor incididunt ut labore et dolore magna
                    aliqua. Quis ipsum suspendisse ultrices gravida lacus vel
                    facilisis.{" "}
                  </p>
                  <Button
                    action={process.env.PUBLIC_URL + "#"}
                    color="dark"
                    content="More info"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="introduction-seven__wrapper__image">
          <img
            src={
              process.env.PUBLIC_URL +
              "/assets/images/introduction/IntroductionSeven/1.png"
            }
            alt="Section image"
          />
        </div>
      </div>
      <div className="introduction-seven__wrapper -bottom">
        <div className="introduction-seven__wrapper__image">
          <img
            src={
              process.env.PUBLIC_URL +
              "/assets/images/introduction/IntroductionSeven/2.png"
            }
            alt="Section image"
          />
        </div>
        <div className="introduction-seven__wrapper__content">
          <div className="container">
            <div className="row no-gutters">
              <div className="col-12 col-lg-9 col-xl-6 ml-auto">
                <div className="introduction-seven__wrapper__content__detail">
                  <SectionTitleOne hideDecoration spaceBottom="1.2em">
                    User Instructions
                  </SectionTitleOne>
                  <Accordion
                    defaultActiveKey={parseInt(currentAccordionIndex)}
                    onSelect={(i) => setCurrentAccordionIndex(i)}
                  >
                    {data &&
                      data.map((item, index) => (
                        <Card key={index}>
                          <Accordion.Toggle as={Card.Header} eventKey={item.id}>
                            {item.header}
                            <i
                              className={`fa fa-angle-${
                                parseInt(currentAccordionIndex) === item.id
                                  ? "up"
                                  : "down"
                              }`}
                            />
                          </Accordion.Toggle>
                          <Accordion.Collapse eventKey={item.id}>
                            <Card.Body>
                              <p>{item.body}</p>
                            </Card.Body>
                          </Accordion.Collapse>
                        </Card>
                      ))}
                  </Accordion>
                  <div className="quantity-group">
                    <div className="quantity-group__controller">
                      <span>Quantity:</span>
                      <Quantity getQuantity={setQuantity} />
                    </div>
                    <Button
                      action={process.env.PUBLIC_URL + "#"}
                      color="dark"
                      content="Purchase"
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
