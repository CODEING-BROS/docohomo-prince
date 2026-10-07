import LayoutFour from "../../components/Layout/LayoutOne";
import { Breadcrumb, BreadcrumbItem } from "../../components/Other/Breadcrumb";

export default function () {
  return (
    <LayoutFour title="Refund Policy">
      <Breadcrumb title="Refund Policy">
        <BreadcrumbItem name="Home" />
        <BreadcrumbItem name="Refund Policy" current />
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
                    In case we do not have the product at all,we will provide refund to the buyer and buyer shall be obligated to accept the refund in Lieu of replacement in his or her bank account.<br/><br/>
                    In case of online consultation, a customer will be eligible to raise a request for Refund only in case the consultation query is not replied within specified timeline.<br/><br/>
                    The customer is required to raise the Refund request with DocHomoeo customer care within 100 hours from the time of submission of query or receiving of response. The request for the Refund will be validated by DocHomoeo team.<br/><br/>
                    In case of valid Refund, the same will be done by crediting the bank account of the customer. Refund process shall be completed within 30 (thirty) days from the date of submission of the request for Refund.
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
