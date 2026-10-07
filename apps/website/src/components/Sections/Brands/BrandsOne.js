import SectionTitleOne from "../SectionTitle/SectionTitleOne";

export default function BrandsOne() {
  return (
    <div className="brand-one">
      <div className="container">
        <div className="brand-one__wrapper">
          <div className="row align-items-center">
            <div className="col-12 col-md-4">
              <SectionTitleOne
                spaceBottom="0px"
                description="Discover products with brands"
              >
                Our brands
              </SectionTitleOne>
            </div>
            <div className="col-12 col-md-8">
              <div className="brand-one__logos">
                {Array.from(Array(6), (e, i) => (
                  <div key={i} className="brand-one__logos__item">
                    <img
                      src={
                        process.env.PUBLIC_URL +
                        `/assets/images/brands/BrandsOne/${i + 1}.png`
                      }
                      alt="logo"
                    />
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
