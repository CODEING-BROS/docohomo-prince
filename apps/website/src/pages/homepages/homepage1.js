import LayoutOne from "../../components/Layout/LayoutOne";
import SliderTwo from "../../components/Sections/Slider/SliderTwo";
import sliderData from "../../data/slider/sliderOne.json";
import IntroductionOne from "../../components/Sections/Introduction/IntroductionOne";
import introductionOneData from "../../data/introduction/introductionOne.json";
import IntroductionTwo from "../../components/Sections/Introduction/IntroductionTwo";
import introductionTwoData from "../../data/introduction/introductionTwo.json";
import ProductSlideOne from "../../components/Sections/ProductThumb/ProductSlide/ProductSlideOne";
import productSlideOneData from "../../data/products.json";
import TestimonialOne from "../../components/Sections/Testimonial/TestimonialOne";
import testimonialOneData from "../../data/testimonial/data.json";
import TeamOne from "../../components/Sections/Team/TeamOne";
import teamOneData from "../../data/team/teamOne.json";
import CTAOne from "../../components/Sections/CallToAction/CTAOne";
import { useState } from "react";
import { baseUrl } from "../../../config";
import axios from "axios";
import ShopProducts from "../../components/Shop/ShopProducts";

export default function homepage1() {
  console.log(sliderData);

  const [data, setData] = useState([]);
  const [product, setProduct] = useState([]);

  const fetchData = async () => {
    try {
      const url = `${baseUrl}/api/get/all/banners`;
      const res = await axios.get(url, { withCredentials: true });
      setData(res.data);

      const url_pro = `${baseUrl}/api/all/products`;
      const res_pro = await axios.get(url_pro, { withCredentials: true });
      setProduct(res_pro.data.allProducts);
    } catch (err) {
      console.log(err);
    }
  };

  useState(() => {
    fetchData();
  }, []);
  console.log(data);

  return (
    <LayoutOne title="Homepage 1" data={sliderData} className="-style-1">
      <SliderTwo data={data} className="-style-1" showDots />
      <IntroductionOne data={introductionOneData} />
      {/* <IntroductionTwo data={introductionTwoData} /> */}
      {/* <ProductSlideOne data={productSlideOneData} /> */}

      <div className="container">
        <ShopProducts
          gridColClass="col-12 col-sm-6 col-md-4 col-lg-3"
          listColClass="col-12 col-lg-6"
          view={"grid"}
          data={product.slice(0, 12)}
        />
      </div>
      {/* <TestimonialOne data={testimonialOneData} /> */}
      {/* <TeamOne data={teamOneData} /> */}
      <CTAOne />
    </LayoutOne>
  );
}
