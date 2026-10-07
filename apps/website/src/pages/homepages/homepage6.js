import LayoutSix from "../../components/Layout/LayoutSix";
import SliderTwo from "../../components/Sections/Slider/SliderTwo";
import sliderData from "../../data/slider/sliderSix.json";
import ProductTabTwo from "../../components/Sections/ProductThumb/ProductTab/ProductTabTwo";
import productTabTwoData from "../../data/products.json";
import CategoriesTwo from "../../components/Sections/Categories/CategoriesTwo";
import categoriesTwodata from "../../data/categories/categoryTwo.json";
import TestimonialThree from "../../components/Sections/Testimonial/TestimonialThree";
import testimonialData from "../../data/testimonial/testimonialThree.json";
import IntroductionTen from "../../components/Sections/Introduction/IntroductionTen";
import introductionTenData from "../../data/introduction/IntroductionTen.json";
import Benefits from "../../components/Other/Benefits";
import DaleOfWeekThree from "../../components/Sections/DealOfWeek/DaleOfWeekThree";
import BlogThree from "../../components/Sections/Blog/BlogThree";
import blogData from "../../data/blog/blog.json";
import InstagramOne from "../../components/Sections/Instagram/InstagramOne";

export default function homepage6() {
  return (
    <LayoutSix title="Homepage 6">
      <SliderTwo className="-style-7" data={sliderData} showDots />
      <CategoriesTwo data={categoriesTwodata} />
      <ProductTabTwo
        data={productTabTwoData}
        disableFeaturedProduct
        titleSize={36 / 16 + "em"}
      />
      <div
        className="testimonial-introduction-group"
        style={{ position: "relative", marginBottom: 100 / 16 + "rem" }}
      >
        <TestimonialThree data={testimonialData} />
        <IntroductionTen data={introductionTenData} />
      </div>
      <Benefits />
      <DaleOfWeekThree last={10000000} />
      <ProductTabTwo
        data={productTabTwoData}
        disableFeaturedProduct
        title="Bestseller"
        titleSize={36 / 16 + "em"}
        numberOfProducts={4}
      />
      <BlogThree data={blogData.slice(0, 4)} />
      <InstagramOne singleRow />
    </LayoutSix>
  );
}
