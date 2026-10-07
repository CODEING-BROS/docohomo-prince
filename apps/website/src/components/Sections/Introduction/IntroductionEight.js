import SectionTitleOne from "../SectionTitle/SectionTitleOne";

export default function IntroductionEight({ data }) {
  return (
    <div className="introduction-eight">
      <div className="container">
        <div className="row no-gutters align-items-center">
          <div className="col-12 col-lg-4 order-lg-2">
            <div className="introduction-eight__image">
              <img
                src={
                  process.env.PUBLIC_URL +
                  "/assets/images/introduction/IntroductionEight/1.png"
                }
                alt="Introduction image"
              />
            </div>
          </div>
          <div className="col-12 col-lg-8 order-lg-1">
            <SectionTitleOne>Why Choose “Your Product”?</SectionTitleOne>
            <div className="introduction-eight__content">
              <div className="row">
                {data.map((item, index) => (
                  <div key={index} className="col-12 col-md-6">
                    <div className="introduction-eight__content__item">
                      <div className="introduction-eight__content__item__image">
                        <img
                          src={process.env.PUBLIC_URL + item.image}
                          alt={item.title}
                        />
                      </div>
                      <div className="introduction-eight__content__item__content">
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
