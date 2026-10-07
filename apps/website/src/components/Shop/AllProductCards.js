import React from "react";
import Product from "../Product";
import classNames from "classnames";

export default function AllProductsCard(props) {
  const { gridColClass, listColClass, fiveCol, view, data } = props;
  let arr = [5];
  for (var i = 0; i < Math.round(data.length / 5); i++) {
    arr.push(arr[i] + 6);
  }

  console.log(data);
  return (
    <div className="">
        <div className="row">
              {data.map((item, index) => {
                
                return (
                  <div
                    key={index}
                    className="col-6 col-sm-6 col-md-4 col-lg-3" style={{padding:"15px 2px"}}
                  >
                    <Product data={item} />
                  </div>
                );
              })}
        </div>
    </div>
  );
}

{/* <div
                    key={index}
                    className={classNames(gridColClass, {
                      "five-col": fiveCol,
                    })}
                  > */}