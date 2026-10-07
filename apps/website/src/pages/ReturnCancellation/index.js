import React from "react";
import LayoutFour from "../../components/Layout/LayoutOne";
import { Breadcrumb, BreadcrumbItem } from "../../components/Other/Breadcrumb";

export default function ReturnsAndCancellations() {
  return (
    <LayoutFour title="Returns & Cancellations">
      <Breadcrumb title="Returns & Cancellations">
        <BreadcrumbItem name="Home" />
        <BreadcrumbItem name="Returns & Cancellations" current />
      </Breadcrumb>

      <div className="returns-cancellations">
        <div className="container">
          <div className="row">
            <div className="col-12">
              <h3 className="returns-cancellations-title">
                Return / Replacement Policy
              </h3>

              <h4 style={{
                marginTop:10,
                marginBottom:10
              }} >Return</h4>
              <p className="policy-description">
                'Return' is defined as the action of giving back the item
                purchased by the Buyer to the DocHomoeo on the DocHomoeo
                website.
              </p>

              <h4 style={{
                marginTop:10,
                marginBottom:10
              }}>Replacement</h4>
              <p className="policy-description">
                'Replacement' is the action or process of replacing something in
                place of another. A Buyer can request for replacement whenever
                he is not happy with the item, reason being damaged in shipping,
                Defective item, Item(s) missing, wrong item shipped, and the
                like.
              </p>

              <p className="policy-description">
                Buyer is asked for 'Reason for Return/Replacement'. Among
                others, the following are the leading reasons:
              </p>

              <ul className="policy-list">
                <li>Item was defective</li>
                <li>Item was damaged during Shipping</li>
                <li>Products were missing</li>
                <li>Wrong item was sent by the Seller</li>
                <li>Item delivered had a size mismatch issue</li>
                <li>Item was expired</li>
              </ul>

              <p className="policy-description">
                Return could also result in a refund of money in most of the
                cases, either 'approval' or 'rejection' of the return/replacement
                request.
              </p>

              <h4 style={{
                marginTop:10,
                marginBottom:10
              }}>Return Acceptance Conditions</h4>
              <p className="policy-description">
                Conveniently place your return request online by raising an issue
                in your DocHomoeo account or by mailing us at:
                <a style={{
                  textDecoration: "none"
                }} href="mailto:contact.dochomoeo@gmail.com">
                contact@dochomoeo.com
                </a>
              </p>

              <p className="policy-description">
                In case of a Wrong Product/Size Exchange issue can be raised
                within 7 days of order delivery along with photographs (of the
                parcel box as well as other products received) or other relevant
                proofs.
              </p>

              <p className="policy-description">
                If after opening the package, the customer discovers that the
                item is missing, the return request should be filed within 2 days
                of delivery along with photographs (of the parcel box as well as
                other products received) on our email.
              </p>

              <p className="policy-description">
                In case of damaged packaging, do not accept the delivery of that
                particular package. In case you have received it and later, after
                opening the package, discover that the item(s) are
                Damaged/Defective or the product is leaked, the return request
                should be filed within 2 days of delivery along with photographs
                (of the received parcel box as well as the product) on our
                e-mail.
              </p>

              <p className="policy-description">
                In case products delivered are past or near their expiry date
                (medicines with an expiry date of less than 6 months shall be
                considered as near expiry), return request can be raised within 7
                days of order delivery along with photographs of products (Expiry
                date must be clearly visible in the attached photographs).
              </p>
            </div>
          </div>
        </div>
      </div>
    </LayoutFour>
  );
}
