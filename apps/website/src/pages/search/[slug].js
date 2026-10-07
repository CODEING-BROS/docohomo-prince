import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import Paginator from "react-hooks-paginator";
import { useRouter } from "next/router";
import {
  Breadcrumb,
  BreadcrumbItem,
} from "../../components/Other/Breadcrumb";
import { getProductbyFilter } from "../../common/productSelect";
import LayoutOne from "../../components/Layout/LayoutOne";
// import productData from "../../data/products.json";
import ShopProducts from "../../components/Shop/ShopProducts";
import ShopHeader from "../../components/Shop/ShopHeader";
import Product from "../../components/Product";
import InstagramTwo from "../../components/Sections/Instagram/InstagramTwo";
import ShopSidebar from "../../components/Shop/ShopSidebar";
import AllProductsCard from "../../components/Shop/AllProductCards";
import { baseUrl } from "../../../config";
import Loading from "../../components/Other/Loading";
import axios from "axios";
import CustomPagination from "../../common/customPagination";

export default function () {
  const router = useRouter();
  const { slug } = router.query;
  const filterData = useSelector((state) => state.shopReducers.filter);
  const pageLimit = 12;
  const [offset, setOffset] = useState(0);
  const [currentView, setCurrentView] = useState();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentSort, setCurrentSort] = useState();
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [currentData, setCurrentData] = useState([]);
  const [productData, setProductData] = useState([]);
  const [categoriesData, setCategoriesData] = useState([]);
  let page = router?.query?.page?parseInt(router.query.page):1;

  const fetchData = async () => {
    try {
      setLoading(true);
      if (slug.length !== 0) {
        const url = `${baseUrl}/api/search/in/products?page=${page}&size=12&search=${slug}`;
        const res = await axios.get(url, { withCredentials: true });
        console.log(res);
        setLoading(false);
        setTotalPages(Math.ceil(res.data?.count/12));
        setCount(res.data?.count);
        setProductData(res.data?.result);
      } else {
        const url_pro = `${baseUrl}/api/all/products`;
        const res_pro = await axios.get(url_pro, { withCredentials: true });
        setProductData(res_pro.data.allProducts);
      }
      const url = `${baseUrl}/api/get/all/brands`;
      const res = await axios.get(url, { withCredentials: true });
      setCategoriesData(res.data);
      //  console.log("productData---",res_pro.data.allProducts);
    } catch (err) {
      setLoading(false);
      console.log(err);
    }
  };

  useState(() => {
    fetchData();
  }, [slug, fetchData]);

  async function PageData(page) {
    try {
      setLoading(true);
      const url = `${baseUrl}/api/search/in/products?page=${page}&size=12&search=${slug}`;
      const res = await axios.get(url, { withCredentials: true });
      console.log(res);
      setCount(res.data?.count);
      setProductData(res.data?.result);
      //  setCurrentPage(parseInt(res_pro?.data?.page));
      setLoading(false);
    } catch (err) {
      console.log(err);
      setLoading(false);
    }
  }
  const handlePageRoute = (page)=>{
    router.push(`/search/${slug}?page=${page}`)
  }

  // const categoriesData =[
  //   {id:0,title:'All'},
  //   {id:1,title:'Dilutions'},
  //   {id:2,title:'Unani'},
  //   {id:3,title:'Ayurveda'},
  //   {id:4,title:'Trituration'},
  //   {id:5,title:'Lm Potencies'},
  //   {id:6,title:'Homoeopathic Medicines'},
  // ]

  useEffect(() => {
    let sortedProduct = getProductbyFilter(
      productData,
      currentSort,
      filterData.category,
      filterData.priceRange.from,
      filterData.priceRange.to,
      filterData.brand
    );
    console.log(sortedProduct);
    setCurrentData(sortedProduct);
  }, [offset, currentSort, filterData]);
  return (
    // <LayoutOne title="Shop Fullwidth Left Sidebar" container="wide">
    <>
      <LayoutOne title="Shop Fullwidth Left Sidebar">
        <Breadcrumb title="Shop Products">
          <BreadcrumbItem name="Home" />
          <BreadcrumbItem name="Shop" current />
        </Breadcrumb>

        <div className="container">
          {" "}
          <div
            style={{
              margin: 10,
              fontWeight: "bold",
              color: "black",
              fontSize: 20,
            }}
          >
            Showing total products : {count}
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : (
          <div className="container">
            <div
              className=""
              style={{ justifyContent: "center", alignItems: "center" }}
            >
              <div className="shop -five-col">
                <div className="container-full-half">
                  <div className="row">
                    {/* <div className="col-12 col-md-4 col-lg-3 col-xl-2">
              <ShopSidebar categoriesData={categoriesData} />
            </div>
            <div className="col-12 col-md-8 col-lg-9 col-xl-10">
              {/* <ShopHeader
                view={currentView}
                getCurrentSort={setCurrentSort}
                getCurrentView={(view) => setCurrentView(view)}
              /> */}
                    {!productData || productData.length === 0 ? (
                      <h1>No product found</h1>
                    ) : (
                      <>
                        <AllProductsCard
                          gridColClass="col-12 col-sm-6 col-lg-4 col-xl-3"
                          listColClass="col-12 col-xl-6"
                          view="grid"
                          data={
                            currentData.length === 0 ? productData : currentData
                          }
                        />
                        <CustomPagination slug={slug} page={page} totalPages={totalPages} handlePageRoute={handlePageRoute}  />
                      {/* { count >= 12 &&
                        <div id="app" class="container">
                          {Math.round(count / 12) < 8 ? (
                            <ul class="page">
                              <li class="page__btn">
                                <i
                                  className="fas fa-angle-left"
                                  onClick={() => {
                                    setCurrentPage(currentPage - 1);
                                    PageData(currentPage - 1);
                                  }}
                                />
                              </li>
                              {[0 + 1, 1 + 1, 2 + 1, 3 + 1, 4 + 1, 5 + 1].map(
                                (i) => {
                                  if (currentPage === i) {
                                    return (
                                      <li class="page__numbers active">{i}</li>
                                    );
                                  } else {
                                    return (
                                      <li
                                        class="page__numbers"
                                        onClick={() => {
                                          setCurrentPage(i);
                                          PageData(i);
                                        }}
                                      >
                                        {i}
                                      </li>
                                    );
                                  }
                                }
                              )}

                              <li
                                class="page__btn"
                                onClick={() => {
                                  setCurrentPage(currentPage + 1);
                                  PageData(currentPage + 1);
                                }}
                              >
                                <i className="fas fa-angle-right"></i>
                              </li>
                            </ul>
                          ) : (
                            <ul class="page">
                              <li class="page__btn">
                                <i
                                  className="fas fa-angle-left"
                                  onClick={() => {
                                    setCurrentPage(currentPage - 1);
                                    PageData(currentPage - 1);
                                  }}
                                />
                              </li>
                              {currentPage === Math.round(count / 12)
                                ? [
                                    currentPage - 5,
                                    currentPage - 4,
                                    currentPage - 3,
                                    currentPage - 2,
                                    currentPage - 1,
                                  ].map((i) => {
                                    if (currentPage === i) {
                                      return (
                                        <li class="page__numbers active">
                                          {i}
                                        </li>
                                      );
                                    } else {
                                      return (
                                        <li
                                          class="page__numbers"
                                          onClick={() => {
                                            setCurrentPage(i);
                                            PageData(i);
                                          }}
                                        >
                                          {i}
                                        </li>
                                      );
                                    }
                                  })
                                : [
                                    currentPage + 0,
                                    currentPage + 1,
                                    currentPage + 2,
                                    currentPage + 3,
                                    currentPage + 4,
                                    currentPage + 5,
                                  ].map((i) => {
                                    if (currentPage === i) {
                                      return (
                                        <li class="page__numbers active">
                                          {i}
                                        </li>
                                      );
                                    } else {
                                      return (
                                        <li
                                          class="page__numbers"
                                          onClick={() => {
                                            setCurrentPage(i);
                                            PageData(i);
                                          }}
                                        >
                                          {i}
                                        </li>
                                      );
                                    }
                                  })}
                              {currentPage < count / 12 - 3 && (
                                <li class="page__dots">...</li>
                              )}
                              {currentPage === Math.round(count / 12) ? (
                                <li class="page__numbers active">
                                  {Math.round(count / 12)}
                                </li>
                              ) : (
                                <li
                                  class="page__numbers"
                                  onClick={() => {
                                    setCurrentPage(Math.round(count / 12));
                                    PageData(count / 12);
                                  }}
                                >
                                  {Math.round(count / 12)}
                                </li>
                              )}
                              <li
                                class="page__btn"
                                onClick={() => {
                                  setCurrentPage(currentPage + 1);
                                  PageData(currentPage + 1);
                                }}
                              >
                                <i className="fas fa-angle-right"></i>
                              </li>
                            </ul>
                          )}
                        </div>
                    } */}
                        {/* <Paginator
                          pageContainerClass="paginator"
                          totalRecords={currentData.length}
                          pageLimit={pageLimit}
                          pageNeighbours={2}
                          setOffset={setOffset}
                          currentPage={currentPage}
                          setCurrentPage={setCurrentPage}
                        /> */}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* </div> */}
        {/* <InstagramTwo /> */}
      </LayoutOne>
    </>
  );
}
