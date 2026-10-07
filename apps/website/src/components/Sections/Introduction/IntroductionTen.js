import Link from "next/link";

export default function IntroductionTen({ data }) {
  return (
    <div className="introduction-ten">
      <div className="container">
        <div className="introduction-ten__wrapper">
          {data.map((item, index) => (
            <div key={index} className="introduction-ten__wrapper__item">
              <Link href={process.env.PUBLIC_URL + "/fullwidth-4col"}>
                <a className="introduction-ten__banner">
                  <img
                    src={process.env.PUBLIC_URL + item.background}
                    alt="Banner background"
                  />
                  <div className="introduction-ten__banner__content">
                    <h5>{item.subTitle}</h5>
                    <h3>{item.title}</h3>
                    <p className="btn -transparent -underline">Shop now</p>
                  </div>
                </a>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
