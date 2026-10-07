import SectionTitleOne from "../SectionTitle/SectionTitleOne";
import TestimonialSlider from "./Elements/TestimonialSlider";

export default function TestimonialTwo({ data }) {
  return (
    <div className="testimonial -style-2">
      <div className="container">
        <TestimonialSlider showArrows data={data} reverseLayout>
          <SectionTitleOne>What people say?</SectionTitleOne>
        </TestimonialSlider>
      </div>
    </div>
  );
}
