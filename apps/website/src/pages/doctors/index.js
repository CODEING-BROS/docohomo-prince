import { useEffect, useState } from "react";
import axios from "axios";
import { baseUrl } from "../../../config";
import LayoutOne from "../../components/Layout/LayoutOne";
import classNames from "classnames";
import Link from "next/link";
import DoctorSection from "../../components/Doctor/DoctorSection";
import { Breadcrumb, BreadcrumbItem } from "../../components/Other/Breadcrumb";

export default function () {
  const [data, setData] = useState([]);

  const fetchDoctors = async () => {
    try {
      const url = `${baseUrl}/api/get/all/doctors/`;
      const res = await axios.get(url, { withCredentials: true });
      setData(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  return (
    <>
      <LayoutOne>
      
      <Breadcrumb title="Our Doctors - Online Doctor Prescription at Dochomoeo">
        <BreadcrumbItem name="Home" />
        <BreadcrumbItem name="doctors" current />
      </Breadcrumb>
        {/* <div class="two alt-two">
          <h2>
            Our Doctors
          </h2>
          <span>Meet the team of our experienced doctors</span>
        </div> */}
        <DoctorSection data={data}/>
        {/* <div className="doctors">
          {data.map((item) => {
            return (
              <main className="qr-container">
                <div className="img-block">
                  <div>
                    <img src={item.image.image_url} alt="QR code" />
                  </div>
                </div>
                <div className="rectangle">
                  <p className="text1">{item.name}</p>
                  <p className="text2">{item.Specialization}</p>
                </div>
                <article className="info-block">
                  <h4>{item.experience} + years of experience</h4>
                  <Link
                    href={`${process.env.PUBLIC_URL}/doctors/[slug]`}
                    // href={`#`}
                    as={`${process.env.PUBLIC_URL}/doctors/${item._id}`}
                    // as={`#`}
                  >
                    <button className="button-24">Consult Doctor</button>
                  </Link>
                </article>
              </main>
            );
          })}
        </div> */}
      </LayoutOne>
    </>
  );
}
