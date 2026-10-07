import LayoutOne from "../components/Layout/LayoutOne";
import SliderTwo from "../components/Sections/Slider/SliderTwo";
import { SlideThree } from "../components/Sections/Slider/slideThree";
import sliderData from "../data/slider/sliderOne.json";
import IntroductionOne from "../components/Sections/Introduction/IntroductionOne";
import introductionOneData from "../data/introduction/introductionOne.json";
import IntroductionTwo from "../components/Sections/Introduction/IntroductionTwo";
import introductionTwoData from "../data/introduction/introductionTwo.json";
import ProductSlideOne from "../components/Sections/ProductThumb/ProductSlide/ProductSlideOne";
import productSlideOneData from "../data/products.json";
import TestimonialOne from "../components/Sections/Testimonial/TestimonialOne";
import testimonialOneData from "../data/testimonial/data.json";
import TeamOne from "../components/Sections/Team/TeamOne";
import teamOneData from "../data/team/teamOne.json";
import CTAOne from "../components/Sections/CallToAction/CTAOne";
import { useEffect, useState } from "react";
import { baseUrl } from "../../config";
import axios from "axios";
import ShopProducts from "../components/Shop/ShopProducts";
import BrandsTwo from "../components/Sections/Brands/BrandsTwo";
import BrandsWise from "../components/Sections/Brands/BrandsWise";
import ProductCategories from "../components/Sections/ProductCategories/ProductCategories";
import CategoriesTwo from "../components/Sections/Categories/CategoriesTwo";
import MenuFive from "../components/Header/Menu/MenuFive";
import DoctorSection from "../components/Doctor/DoctorSection";
import { toast } from "react-toastify";
import { logoutUser } from "../redux/reducers/userReducer";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";
import PostCardTwo from "../components/Post/PostCardTwo";
import SectionTitleOne from "../components/Sections/SectionTitle/SectionTitleOne";
import Link from "next/link";
import { getCookie } from "../lib/session";
import { Modal } from "@mui/material";
import AuthFromCheckout from "../components/AuthPage";
export default function homepage1() {
  console.log(sliderData);

  const [data, setData] = useState([]);
  const [mobile, setMobile] = useState([]);
  const [product, setProduct] = useState([]);
  const [brandsData, setBrandsData] = useState([]);
  const [doctorsData, setDoctorsData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [openForm, setOpenForm] = useState(false);
  const [cat, setCat] = useState([]);
  const [blogsDataApi, setBlogsDataApi] = useState([]);
  const dispatch = useDispatch();
  const handleClose = () => setOpenForm(false);

  useEffect(() => {
    if(currentUser && !getCookie("token")){
      axios.get(`${baseUrl}/api/user/logout`, {
        withCredentials: true,
      });    
      dispatch(logoutUser());
    }
  }, []);

  const fetchDoctors = async () => {
    try {
      const url = `${baseUrl}/api/get/all/doctors/`;
      const res = await axios.get(url, { withCredentials: true });
      setDoctorsData(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    // window.scrollTo();
    window.scrollTo({top: 0, left: 0, behavior: 'smooth'})

  }, [data]);
  
  const fetchBrands = async () => {
    try {
      const url = `${baseUrl}/api/get/all/brands`;
      const res = await axios.get(url, { withCredentials: true });
      console.log("categories ---> ", res?.data);
      const uniqueCategories = {};

      const uniqueData = res?.data?.filter((item) => {
        if (!uniqueCategories[item.main_category_name]) {
          uniqueCategories[item.main_category_name] = true;
          return true;
        }
        return false;
      });
      setCategories(res?.data);
      setCat(uniqueData);
      const urldusra = `${baseUrl}/api/brands/get/all/brands`;
      const resdusra = await axios.get(urldusra, { withCredentials: true });
      setBrandsData(resdusra.data);
    } catch (error) {
      console.log(error);
    }
  };

  const fetchData = async () => {
    try {
      const url = `${baseUrl}/api/get/all/banners`;

      const res = await axios.get(url, { withCredentials: true });
      setData(res.data);

      const mobileurl = `${baseUrl}/api/mobile/get/all/banners`;

      const resmobile = await axios.get(mobileurl, { withCredentials: true });
      setMobile(resmobile.data);

      const url_pro = `${baseUrl}/api/gethome`;
      const res_pro = await axios.get(url_pro, { withCredentials: true });
      setProduct(res_pro.data);
    } catch (err) {
      console.log(err);
    }
  };

  async function verify() {
    try {
      const res = await axios.post(`${baseUrl}/api/user/loginUserData`, {
        withCredentials: true,
      });
    } catch (error) {
      dispatch(logoutUser());
      console.log(error);
      return toast.error(error.response?.data?.message);
    }
  }
   
  const getBlogsData = async () => {
    const url_brands = `${baseUrl}/api/website/get/blogs/for/homepage`;
    await axios
      .get(url_brands, { withCredentials: true })
      .then((res) => {
        console.log("blogs",res?.data);
        setBlogsDataApi(res?.data?.data);
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const currentUser = useSelector((state) => state.userReducer.user);

  useState(() => {
    getBlogsData();
    fetchBrands();
    fetchData();
    fetchDoctors();
    // if (currentUser?.user?._id) {
    //   verify();
    // }
  }, []);

  useState(()=>{
    const loginModal = sessionStorage.getItem('loginModal');
    if(!currentUser && !loginModal){
        sessionStorage.setItem("loginModal",true);
        setTimeout(() => {
          setOpenForm(true);
        }, 3000);
      }
  },[])

  console.log(data);
  const blogDataItem = blogsDataApi;
  return (
    <>
      <LayoutOne title="Dochomoeo: Homoeopathic Medicine | Best Deals & Free Shipping" data={sliderData} className="-style-1">
        <Modal 
          open={openForm}
          onClose={handleClose}
          aria-labelledby="modal-modal-title"
          aria-describedby="modal-modal-description"
        >
          <AuthFromCheckout handleClose={handleClose}/>
        </Modal>
        <MenuFive data={categories} />
        {/* <ProductCategories data={brandsData}/> */}
        {/* <CategoriesTwo data={brandsData}/> */}
        <SliderTwo data={data} className="-style-1" showDots />
        <SlideThree data={mobile} />
        {/* <IntroductionOne data={introductionOneData} /> */}
        {/* <IntroductionTwo data={introductionTwoData} /> */}
        {/* <ProductSlideOne data={productSlideOneData} /> */}
        <BrandsWise
          mainHeading={"Our Brands"}
          description={"The Brands you can count upon"}
          data={brandsData}
        />
        <BrandsTwo
          mainHeading={"Categories"}
          description={
            "Explore wide range of products from various categories."
          }
          data={cat}
        />
        {/* <div className="container"> */}
        <ShopProducts
          // gridColClass="col-12 col-sm-6 col-md-4 col-lg-3"
          // listColClass="col-12 col-lg-6"
          // view={"grid"}
          brandsData={categories.slice(0, 4)}
          data={product}
        />
        {/* <div className="container">
             <div className="three">
                <h1>Our Doctorss</h1>
             </div>
        </div> */}
        <DoctorSection data={doctorsData} />
        {/* </div> */}
        <TestimonialOne data={testimonialOneData} />
        {/* <TeamOne data={teamOneData} />  */}
        {/* <CTAOne /> */}
        {/* BLOGS SECTION  */}
      <SectionTitleOne align="center" spaceBottom="50px">
        Our Blogs
      </SectionTitleOne>
      <div className="container">
        <div className="row">
          {blogDataItem?.map((value, index) => (
            <div key={index} className="col-12 col-md-6">
              <PostCardTwo data={value} />
              
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 70 }} className="view_brands_page">
        
      <div className="view_all_Main_blogs">
        <Link href="/blog" >
          <button className="view_all_blogs">
          View All Blogs
          </button>
         
        </Link>
        </div>
      </div>
      {/* BLOGS SECTION */}
      </LayoutOne>
    </>
  );
}
