import React from "react";

import CategoryCard from "./Elements/CategoryCard";

export default function CategoriesOne({ data }) {
  return (
    <div className="category-one">
      <div className="container-fluid">
        <div className="row">
          {data.map((category, index) => (
            <div key={index} className="col-12 col-md-4">
              <CategoryCard data={category} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
