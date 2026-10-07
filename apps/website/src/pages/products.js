import { useState, useEffect } from "react";
import { Breadcrumb, BreadcrumbItem } from "../components/Other/Breadcrumb";
import { getProductbyFilter } from "../common/productSelect";
import LayoutOne from "../components/Layout/LayoutOne";
import ShopSidebar from "../components/Shop/ShopSidebar";
import AllProductsCard from "../components/Shop/AllProductCards";
import { baseUrl } from "../../config";
import axios from "axios";
import Loading from "../components/Other/Loading";
import { useMediaQuery } from "react-responsive";
import MobileSidebar from "../components/Shop/MobileSidebar";
import CustomPagination from "../common/customPagination";
import { useRouter } from "next/router";

export default function () {
  const router = useRouter();
  const pageLimit = 25;
  const [offset, setOffset] = useState(0);
  const [currentView, setCurrentView] = useState();
  const [currentSort, setCurrentSort] = useState();
  const [count, setCount] = useState(12);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentData, setCurrentData] = useState([]);
  const [productData, setProductData] = useState([]);
  const [categoriesData, setCategoriesData] = useState([]);
  const [brandsData, setBrandsData] = useState([]);
  const isTabletOrMobile = useMediaQuery({ query: "(max-width: 768px)" });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const [price, setPrice] = useState(0);
  const [c, setC] = useState(0);
  let page = router?.query?.page?parseInt(router.query.page):1;
  
  const fetchData = async () => {
    try {
      setLoading(true);
      const url_pro = `${baseUrl}/api/all/products?page=${page}&size=12&sort=${price}`;
      const res_pro = await axios.get(url_pro, { withCredentials: true });
      setProductData(res_pro.data.allProducts);
      setTotalPages(Math.ceil(res_pro.data?.count/12));
      //  setProductData(res_pro.data.allProducts);
      setTotal(res_pro?.data?.count);
      setCurrentPage(res_pro?.data?.page);
      const url = `${baseUrl}/api/brands/get/all/brands`;
      const arr = await axios.get(url, { withCredentials: true });
      const url2 = `${baseUrl}/api/get/all/brands`;
      const arr2 = await axios.get(url2, { withCredentials: true });
      const res = arr2.data.filter(
        (arr, index, self) =>
          index ===
          self.findIndex((t) => t.main_category_name === arr.main_category_name)
      );
      setBrandsData(arr.data);
      setCategoriesData(res);
      setLoading(false);
      console.log("productData---", res_pro.data.allProducts);
    } catch (err) {
      console.log(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page]);

  async function PageData(page) {
    try {
      setLoading(true);
      const url_pro = `${baseUrl}/api/all/products?page=${page}&size=12&sort=${price}`;
      const res_pro = await axios.get(url_pro, { withCredentials: true });
      setProductData(res_pro.data.allProducts);
      setCurrentPage(parseInt(res_pro?.data?.page));
      setTotal(res_pro.data.count);
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  }

  async function FilterData(page, fl, sort, iscat) {
    setPrice(sort);
    setC(iscat);
    setFilter(fl);
    try {
      setLoading(true);
      let url_pro = "";
      if (price === 0 && c === 0) {
        url_pro = `${baseUrl}/api/filter?page=${page}&size=12&filter=${fl}&sort=${sort}&iscat=${iscat}`;
      } else if (price === 0 && c !== 0) {
        url_pro = `${baseUrl}/api/filter?page=${page}&size=12&filter=${fl}&sort=${sort}&iscat=${c}`;
      } else {
        url_pro = `${baseUrl}/api/filter?page=${page}&size=12&filter=${fl}&sort=${price}&iscat=${iscat}`;
      }
      const res_pro = await axios.get(url_pro, { withCredentials: true });
      setProductData(res_pro.data.allProducts);
      setCurrentPage(parseInt(res_pro?.data?.page));
      setFilter(fl);
      setTotalPages(Math.ceil(res_pro.data?.count/12));
      setTotal(res_pro.data.count);
      setLoading(false);
    } catch (err) {
      setLoading(false);
    }
  }

  const handlePageRoute = (page)=>{
    router.push(`/products?page=${page}`)
  }

  // useEffect(() => {
  //   let sortedProduct = getProductbyFilter(productData, currentSort);
  //   console.log(sortedProduct);
  //   setCurrentData(sortedProduct);
  // }, [offset, currentSort]);

  return (
    <LayoutOne 
      title="Search for a wide range of products"
      description = "Shop a wide range of homoeopathic remedies online at DocHomoeo. Find natural solutions for common ailments & conditions. Free shipping on orders above ₹399!"
    >
      <Breadcrumb title="Shop Products">
        {/* <BreadcrumbItem name="Home" /> */}
        {/* <BreadcrumbItem name="Shop" current /> */}
      </Breadcrumb>
      {isTabletOrMobile ? (
        <div>
          <MobileSidebar
            brandsData={brandsData}
            categoriesData={categoriesData}
            filterData={FilterData}
            fetchData={PageData}
            filter={filter}
            price={price}
            setCurrentPage={setCurrentPage}
            setFilter={setFilter}
            setPrice={setPrice}
            setC={setC}
            c={c}
          />
          {/* <ShopSidebar
                    brandsData={brandsData}
                    categoriesData={categoriesData}
                    filterData={FilterData}
                    fetchData={PageData}
                    filter={filter}
                    price={price}
                    setCurrentPage={setCurrentPage}
                    setFilter={setFilter}
                    setPrice={setPrice}
                    setC={setC}
                    c={c}
                  /> */}
          {loading ? (
            <Loading />
          ) : (
            <div className="col-12 col-md-8 col-lg-9 col-xl-10">
              {!productData || productData.length === 0 ? (
                <h1>No product found</h1>
              ) : (
                <>
                  <AllProductsCard
                    gridColClass="col-12 col-sm-6 col-lg-4 col-xl-3"
                    listColClass="col-12 col-xl-6"
                    view="grid"
                    data={currentData.length === 0 ? productData : currentData}
                  />
                  <CustomPagination page={page} totalPages={totalPages} handlePageRoute={handlePageRoute}  />

                  {/* {total >= 12 && (
                    <div id="app" class="container">
                      {Math.round(total / 12) < 8 ? (
                        <ul class="page">
                          <li class="page__btn">
                            <i
                              className="fas fa-angle-left"
                              onClick={() => {
                                if (filter !== "all") {
                                  setCurrentPage(currentPage - 1);
                                  FilterData(currentPage - 1, filter);
                                } else {
                                  setCurrentPage(currentPage - 1);
                                  PageData(currentPage - 1);
                                }
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
                                      if (filter !== "all") {
                                        setCurrentPage(i);
                                        FilterData(i, filter);
                                      } else {
                                        setCurrentPage(i);
                                        PageData(i);
                                      }
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
                              if (filter !== "all") {
                                setCurrentPage(currentPage + 1);
                                FilterData(currentPage + 1, filter);
                              } else {
                                setCurrentPage(currentPage + 1);
                                PageData(currentPage + 1);
                              }
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
                                if (filter !== "all") {
                                  setCurrentPage(currentPage - 1);
                                  FilterData(currentPage - 1, filter);
                                } else {
                                  setCurrentPage(currentPage - 1);
                                  PageData(currentPage - 1);
                                }
                              }}
                            />
                          </li>
                          {currentPage === Math.round(total / 12)
                            ? [
                              currentPage - 5,
                              currentPage - 4,
                              currentPage - 3,
                              currentPage - 2,
                              currentPage - 1,
                              currentPage,
                            ].map((i) => {
                              if (currentPage === i) {
                                return (
                                  <li class="page__numbers active">
                                    {currentPage}
                                  </li>
                                );
                              } else {
                                return (
                                  <li
                                    class="page__numbers"
                                    onClick={() => {
                                      if (filter !== "all") {
                                        setCurrentPage(i);
                                        FilterData(i, filter);
                                      } else {
                                        setCurrentPage(i);
                                        PageData(i);
                                      }
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
                                  <li class="page__numbers active">{i}</li>
                                );
                              } else {
                                return (
                                  <li
                                    class="page__numbers"
                                    onClick={() => {
                                      if (filter !== "all") {
                                        setCurrentPage(i);
                                        FilterData(i, filter);
                                      } else {
                                        setCurrentPage(i);
                                        PageData(i);
                                      }
                                    }}
                                  >
                                    {i}
                                  </li>
                                );
                              }
                            })}
                          {currentPage < total / 12 - 3 && (
                            <li class="page__dots">...</li>
                          )}
                          {currentPage === Math.round(total / 12) ? (
                            <li class="page__numbers active">
                              {Math.round(productData.length / 12)}
                            </li>
                          ) : (
                            <li
                              class="page__numbers"
                              onClick={() => {
                                if (filter !== "all") {
                                  setCurrentPage(Math.round(total / 12));
                                  FilterData(productData.length / 12, filter);
                                } else {
                                  setCurrentPage(Math.round(total / 12));
                                  PageData(productData.length / 12);
                                }
                              }}
                            >
                              {Math.round(total / 12)}
                            </li>
                          )}
                          <li
                            class="page__btn"
                            onClick={() => {
                              if (filter !== "all") {
                                setCurrentPage(currentPage + 1);
                                FilterData(currentPage + 1, filter);
                              } else {
                                setCurrentPage(currentPage + 1);
                                PageData(currentPage + 1);
                              }
                            }}
                          >
                            <i className="fas fa-angle-right"></i>
                          </li>
                        </ul>
                      )}
                    </div>
                  )} */}

                  {/* <Paginator
                    pageContainerClass="paginator"
                    totalRecords="837"
                    offset={offset}
                    setOffset={setOffset}
                    pageLimit={pageLimit}
                    pageNeighbours={2}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                  /> */}
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="">
          <div className="shop -five-col">
            <div className="container-full-half">
              <div className="row">
                <div className="col-12 col-md-4 col-lg-3 col-xl-2">
                  <ShopSidebar
                    brandsData={brandsData}
                    categoriesData={categoriesData}
                    filterData={FilterData}
                    fetchData={PageData}
                    filter={filter}
                    price={price}
                    setCurrentPage={setCurrentPage}
                    setFilter={setFilter}
                    setPrice={setPrice}
                    setC={setC}
                    c={c}
                  />
                </div>
                {loading ? (
                  <>
                    {" "}
                    <Loading />{" "}
                  </>
                ) : (
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
                        <CustomPagination page={page} totalPages={totalPages} handlePageRoute={handlePageRoute}  />

                        {/* {total >= 12 && (
                          <div id="app" class="container">
                            {Math.round(total / 12) < 8 ? (
                              <ul class="page">
                                <li class="page__btn">
                                  <i
                                    className="fas fa-angle-left"
                                    onClick={() => {
                                      if (filter !== "all") {
                                        setCurrentPage(currentPage - 1);
                                        FilterData(currentPage - 1, filter);
                                      } else {
                                        setCurrentPage(currentPage - 1);
                                        PageData(currentPage - 1);
                                      }
                                    }}
                                  />
                                </li>
                                {[0 + 1, 1 + 1, 2 + 1, 3 + 1, 4 + 1, 5 + 1].map(
                                  (i) => {
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
                                            if (filter !== "all") {
                                              setCurrentPage(i);
                                              FilterData(i, filter);
                                            } else {
                                              setCurrentPage(i);
                                              PageData(i);
                                            }
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
                                    if (filter !== "all") {
                                      setCurrentPage(currentPage + 1);
                                      FilterData(currentPage + 1, filter);
                                    } else {
                                      setCurrentPage(currentPage + 1);
                                      PageData(currentPage + 1);
                                    }
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
                                      if (filter !== "all") {
                                        setCurrentPage(currentPage - 1);
                                        FilterData(currentPage - 1, filter);
                                      } else {
                                        setCurrentPage(currentPage - 1);
                                        PageData(currentPage - 1);
                                      }
                                    }}
                                  />
                                </li>
                                {currentPage === Math.round(total / 12)
                                  ? [
                                    currentPage - 5,
                                    currentPage - 4,
                                    currentPage - 3,
                                    currentPage - 2,
                                    currentPage - 1,
                                    currentPage,
                                  ].map((i) => {
                                    if (currentPage === i) {
                                      return (
                                        <li class="page__numbers active">
                                          {currentPage}
                                        </li>
                                      );
                                    } else {
                                      return (
                                        <li
                                          class="page__numbers"
                                          onClick={() => {
                                            if (filter !== "all") {
                                              setCurrentPage(i);
                                              FilterData(i, filter);
                                            } else {
                                              setCurrentPage(i);
                                              PageData(i);
                                            }
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
                                            if (filter !== "all") {
                                              setCurrentPage(i);
                                              FilterData(i, filter);
                                            } else {
                                              setCurrentPage(i);
                                              PageData(i);
                                            }
                                          }}
                                        >
                                          {i}
                                        </li>
                                      );
                                    }
                                  })}
                                {currentPage < total / 12 - 3 && (
                                  <li class="page__dots">...</li>
                                )}
                                {currentPage === Math.round(total / 12) ? (
                                  <li class="page__numbers active" >
                                    {Math.round(productData.length / 12)}
                                  </li>
                                ) : (
                                  <li
                                    class=" pagebox"
                                
                                    onClick={() => {
                                      if (filter !== "all") {
                                        setCurrentPage(Math.round(total / 12));
                                        FilterData(
                                          productData.length / 12,
                                          filter
                                        );
                                      } else {
                                        setCurrentPage(Math.round(total / 12));
                                        PageData(productData.length / 12);
                                      }
                                    }}
                                  >
                                    {Math.round(total / 12)}
                                  </li>
                                )}
                                <li
                                  class="page__btn"
                                  onClick={() => {
                                    if (filter !== "all") {
                                      setCurrentPage(currentPage + 1);
                                      FilterData(currentPage + 1, filter);
                                    } else {
                                      setCurrentPage(currentPage + 1);
                                      PageData(currentPage + 1);
                                    }
                                  }}
                                >
                                  <i className="fas fa-angle-right"></i>
                                </li>
                              </ul>
                            )}
                          </div>
                        )} */}

                        {/* <Paginator
                          pageContainerClass="paginator"
                          totalRecords="837"
                          offset={offset}
                          setOffset={setOffset}
                          pageLimit={pageLimit}
                          pageNeighbours={2}
                          currentPage={currentPage}
                          setCurrentPage={setCurrentPage}
                        /> */}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* <InstagramTwo /> */}
    </LayoutOne>
  );
}
