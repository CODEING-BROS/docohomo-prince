import LayoutFour from "../../components/Layout/LayoutFour";
import SliderTwo from "../../components/Sections/Slider/SliderTwo";
import sliderData from "../../data/slider/sliderFour.json";
import ProductTabTwo from "../../components/Sections/ProductThumb/ProductTab/ProductTabTwo";
import productTabTwoData from "../../data/products.json";
import DaleOfWeekTwo from "../../components/Sections/DealOfWeek/DaleOfWeekTwo";
import BlogTwo from "../../components/Sections/Blog/BlogTwo";
import blogData from "../../data/blog/blog.json";
import Benefits from "../../components/Other/Benefits";
import InstagramTwo from "../../components/Sections/Instagram/InstagramTwo";

export default function homepage4() {
  return (
    <LayoutFour title="Homepage 4">
      <SliderTwo className="-style-4" data={sliderData} showDots />
      <ProductTabTwo data={productTabTwoData} />
      <DaleOfWeekTwo />
      <BlogTwo data={blogData.slice(0, 3)} />
      <Benefits />
      <InstagramTwo />
    </LayoutFour>
  );
}
