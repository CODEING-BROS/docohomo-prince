import React, { useState, useEffect } from "react";
import Paginator from "react-hooks-paginator";
import { useRouter } from "next/router";
import Link from "next/link";
import BlogSidebar from "../../components/Blog/BlogSidebar";
import LayoutFour from "../../components/Layout/LayoutFour";
import InstagramTwo from "../../components/Sections/Instagram/InstagramTwo";
import blogData from "../../data/blog/blog.json";
import { Breadcrumb, BreadcrumbItem } from "../../components/Other/Breadcrumb";
import { getPostByKeyword } from "../../common/postSelect";
import BlogContent from "../../components/Blog/BlogContent";
import LayoutOne from "../../components/Layout/LayoutOne";
import { baseUrl } from "../../../config";
import axios from "axios";
import PostCardTwo from "../../components/Post/PostCardTwo";

export default function index() {
  const router = useRouter();
  const search = router.query.search;
  const pageLimit = 7;
  const [offset, setOffset] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [currentData, setCurrentData] = useState([]);
  const [blogsDataApi, setBlogsDataApi] = useState([]);


  const getBlogsData = async()=>{
    const url_brands = `${baseUrl}/api/website/get/all/blogs/for/blogs/page?page=${currentPage}`;
    await axios.get(url_brands,{withCredentials:true})
    .then(res=>{
      console.log("res?.data====>>",res?.data);
      setBlogsDataApi([...blogsDataApi,...res?.data?.data])
      setTotalPages(res?.data?.pages)
    })
    .catch(err=>{
      console.log(err)
    })
  }

  useEffect(() => {
    getBlogsData()
  }, [currentPage]);


  const getNextBlogs=()=>{
    setCurrentPage(currentPage + 1)
  }
console.log("currentPage=>",currentPage);
  // useEffect(() => {
  //   if (!search || search.length === 0) {
  //     setCurrentData(blogData);
  //   } else {
  //     setCurrentData(getPostByKeyword(blogData, search));
  //   }
  // }, [offset, search]);

  return (
    <LayoutOne title="Dochomoeo Blogs: Stay Informed and Inspired">
      <Breadcrumb title="Blogs">
        <BreadcrumbItem name="Home" />
        <BreadcrumbItem name="Blog" current />
      </Breadcrumb>
      <div className="blog">
        <div className="container">
          <div className="row">

          <div className="row blog-mobile-page" >
        {blogsDataApi?.map((value,index)=>(
            <div  key={index} className="col-12 col-md-4">
                                    <PostCardTwo data={value} />
                                  </div>

                    ))}
            </div>


            {/* <div className="col-12 col-lg-3">
              <BlogSidebar limit={5} popularPostData={blogData} />
            </div> */}
            {/* <div className="col-12 col-lg-9"> */}
              {/* <BlogContent offset={offset} search={search} data={currentData} /> */}
             
              {/* <Paginator
                pageContainerClass="paginator"
                totalRecords={currentData.length}
                pageLimit={pageLimit}
                pageNeighbours={2}
                setOffset={setOffset}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
              /> */}
            {/* </div> */}
          </div>
              { totalPages > currentPage ? 
                <div  className="view_brands_page" style={{marginTop:70,display:'flex',justifyContent:'center'}} >
                <button onClick={getNextBlogs} className="btn"  >
                  Load More
                </button>
                </div>
            
            :

null
            }

        
        </div>
      </div>
      {/* <InstagramTwo /> */}
    </LayoutOne> 
  );
}
