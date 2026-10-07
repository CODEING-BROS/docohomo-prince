import LayoutThree from "../../components/Layout/LayoutThree";
import SliderTwo from "../../components/Sections/Slider/SliderTwo";
import sliderData from "../../data/slider/sliderThree.json";
import IntroductionThree from "../../components/Sections/Introduction/IntroductionThree";
import ProductTabSlideOne from "../../components/Sections/ProductThumb/ProductTabSlide/ProductTabSlideOne";
import productData from "../../data/products.json";
import IntroductionFour from "../../components/Sections/Introduction/IntroductionFour";
import IntroductionFive from "../../components/Sections/Introduction/IntroductionFive";

export default function homepage3() {
  return (
    <LayoutThree title="Homepage 3">
      <SliderTwo className="-style-3" data={sliderData} showArrows />
      <IntroductionThree />
      <ProductTabSlideOne data={productData} />
      <IntroductionFour />
      <IntroductionFive />
    </LayoutThree>
  );
}
