import LayoutFour from "../../components/Layout/LayoutOne";
import { Breadcrumb, BreadcrumbItem } from "../../components/Other/Breadcrumb";
import CTAOne from "../../components/Sections/CallToAction/CTAOne";
import ServiceItem from "../../components/Pages/Services/ServiceItem";
import { formatSingleNumber } from "../../common/utils";
import servicesData from "../../data/pages/services.json";

export default function services() {
  return (
    // <LayoutFour title="Services">
    <LayoutFour title="Services">
      <Breadcrumb title="Bulk Inquiry">
        <BreadcrumbItem name="Home" />
        <BreadcrumbItem name="Inquiry" current />
      </Breadcrumb>
      {/* {servicesData &&
        servicesData.map((item, index) => (
          <ServiceItem
            key={index}
            bigImgSrc={process.env.PUBLIC_URL + item.bigImgSrc}
            smallImgSrc={process.env.PUBLIC_URL + item.smallImgSrc}
            title={item.title}
            order={formatSingleNumber(index + 1)}
            reverse={index % 2 === 1}
          />
        ))} */}

      <CTAOne />
    </LayoutFour>
  );
}
