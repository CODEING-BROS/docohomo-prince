import { useState, useEffect } from "react";
import { useDispatch } from "react-redux";
import SectionTitleOne from "../Sections/SectionTitle/SectionTitleOne";
import { resetFilter } from "../../redux/actions/shopActions";

export default function ShopSidebar({
  categoriesData,
  filterData,
  setFilter,
  filter,
  fetchData,
  setCurrentPage,
  setPrice,
  price,
  brandsData,
  setC,
  c,
}) {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(resetFilter());
  }, []);

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [isOptionMenuActive, setOptionMenuActive] = useState(false);
  const toggleOptionMenu = () => {
    setOptionMenuActive(!isOptionMenuActive);
  };

  const handleCategoryChange = async (e) => {
    const selectedCategory = e.target.value;
    setSelectedCategory(selectedCategory);
    setCurrentPage(0);
    setC(1);
    if (selectedCategory === "all") {
      await fetchData(0, "all");
    } else {
      await filterData(0, selectedCategory, 0, 1);
    }
  };

  const handleBrandChange = async (e) => {
    e.preventDefault();
    const selectedBrand = e.target.value;
    setSelectedBrand(selectedBrand);
    setCurrentPage(0);
    await setPrice(0); // Reset the price filter
    setC(0);
    if (selectedBrand === "all") {
      await fetchData(0, "all");
    } else {
      await filterData(0, selectedBrand);
    }
  };

  useEffect(() => {
    if (price !== null) {
      if (filter === "all") {
        fetchData(0, "all", price, false);
      } else if (c === 1) {
        filterData(0, filter, price, 1);
      } else {
        filterData(0, filter, price, false);
      }
    }
  }, [price]);

  return (
    <div className={`select-menu ${isOptionMenuActive ? "active" : ""}`}>
      <div onClick={toggleOptionMenu} className="select-btn">
        <span className="sBtn-text">Filter by Categories</span>
        <i className="fa fa-angle-down"></i>
      </div>
     {isOptionMenuActive?
     <>
      <div className="shop-sidebar">
        <div className="shop-sidebar__content">
          <div className="shop-sidebar__section -categories">
            {/* <SectionTitleOne className="-medium" spaceBottom={30 / 16 + "em"}>
              Filter Products
            </SectionTitleOne> */}
          

            <ul className="option">
              <li key={5345}>
                <button
                  style={{ background: "none", border: "none" }}
                  onClick={(e) => {
                    e.preventDefault();

                    setFilter("all");
                    setCurrentPage(0);
                    fetchData(0);
                  }}
                >
                  <a>Reset Filters</a>
                </button>
              </li>
              <li className="filter-item" key={5340}>
                <select
                  className="dropdwn"
                  value={selectedCategory}
                  onChange={handleCategoryChange}
                >
                  <option value="all">All Categories</option>
                  {categoriesData.map((it, index) => (
                    <option key={index} value={it.main_category_name}>
                      {it.main_category_name}
                    </option>
                  ))}
                </select>
              </li>
              <li className="filter-item" key={5341}>
                <select
                  className="dropdwn"
                  value={selectedBrand}
                  onChange={handleBrandChange}
                >
                  <option value="all">All Brands</option>
                  {brandsData.map((brand, index) => (
                    <option key={index} value={brand.main_category_name}>
                      {brand.main_category_name}
                    </option>
                  ))}
                </select>
              </li>
              <li key={5346}>
                <button
                  style={{ background: "none", border: "none" }}
                  onClick={async (e) => {
                    e.preventDefault();
                    await setPrice(-1);
                  }}
                >
                  <a>Price: Low to high</a>
                </button>
              </li>
              <li key={5347}>
                <button
                  style={{ background: "none", border: "none" }}
                  onClick={async (e) => {
                    e.preventDefault();
                    await setPrice(1);
                  }}
                >
                  <a>Price: High to low</a>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
      </>
      :""
   }
    </div>
  );
}

// import React, { useState } from "react";
// import {
//   setFilterCategory,
//   setFilterBrand,
//   setFilterPriceRange,
//   resetFilter,
// } from "../../redux/actions/shopActions";
// import { useEffect } from "react";
// import { useSelector, useDispatch } from "react-redux";

// export const MobileSidebar = ({
//   categoriesData,
//   filterData,
//   setFilter,
//   filter,
//   fetchData,
//   setCurrentPage,
//   setPrice,
// }) => {
//   const [isOptionMenuActive, setOptionMenuActive] = useState(false);

//   const toggleOptionMenu = () => {
//     setOptionMenuActive(!isOptionMenuActive);
//   };

//   const dispatch = useDispatch();
//   // const filterData = useSelector((state) => state.shopReducers.filter);
//   useEffect(() => {
//     dispatch(resetFilter());
//   }, []);

//   return (
//     <div className={`select-menu ${isOptionMenuActive ? "active" : ""}`}>
//       <div onClick={toggleOptionMenu} className="select-btn">
//         <span className="sBtn-text">Filter by Categories</span>
//         <i className="fa fa-angle-down"></i>
//       </div>
//       <ul className="options">
//         <li className="option">
//           <button
//             style={{ background: "none", border: "none" }}
//             onClick={(e) => {
//               e.preventDefault();
//               // dispatch(resetFilter());
//               setFilter("all");
//               setCurrentPage(0);
//               fetchData(0, "all");
//             }}
//           >
//             <span className="option-text">All</span>
//           </button>
//         </li>
//         <li className="option">
//           <button
//             style={{ background: "none", border: "none" }}
//             onClick={async (e) => {
//               e.preventDefault();
//               // dispatch(resetFilter());
//               //  setFilter("all");
//               //  setCurrentPage(0);
//               // fetchData(0,"all");
//               await setPrice(-1);
//               await new Promise((resolve) => setTimeout(resolve, 300));
//               if (filter === "all") {
//                 fetchData(0, "all", -1);
//               } else {
//                 filterData(0, filter, -1);
//               }
//             }}
//           >
//             <span className="option-text">Price: Low to high</span>
//           </button>
//         </li>
//         <li className="option">
//           <button
//             style={{ background: "none", border: "none" }}
//             onClick={async (e) => {
//               e.preventDefault();
//               // dispatch(resetFilter());
//               //  setFilter("all");
//               //  setCurrentPage(0);
//               //  fetchData(0,"all");
//               await setPrice(1);
//               await new Promise((resolve) => setTimeout(resolve, 300));
//               if (filter === "all") {
//                 fetchData(0, "all", 1);
//               } else {
//                 filterData(0, filter, 1);
//               }
//             }}
//           >
//             <span className="option-text">Price: High to low</span>
//           </button>
//         </li>
//         {categoriesData.map((it, index) => (
//           <li className="option" key={index}>
//             <button
//               style={{ background: "none", border: "none" }}
//               onClick={(e) => {
//                 e.preventDefault();
//                 // dispatch(setFilterCategory(it.main_category_name));
//                 setFilter(it.main_category_name);
//                 setCurrentPage(0);
//                 filterData(0, it.main_category_name);
//               }}
//             >
//               <span className="option-text">{it.main_category_name}</span>
//             </button>
//           </li>
//         ))}
//       </ul>
//     </div>
//   );
// };
