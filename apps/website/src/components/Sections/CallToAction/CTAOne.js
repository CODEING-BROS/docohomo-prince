import { useForm } from "react-hook-form";

import SectionTitleOne from "../SectionTitle/SectionTitleOne";

export default function CTAOne() {
  const { register, handleSubmit, watch, errors } = useForm({
    mode: "onChange",
  });
  const onSubmit = (data) => {
    console.log(data);
  };
  return (
    <div
      className="cta -style-1 mt-0"
      style={{ backgroundImage: 'url("/assets/images/bg.jpg")' }}
    >
      <div className="container">
        <div className="row">
          <div className="col-12 col-md-6 mx-auto">
            <div className="cta__form">
              <SectionTitleOne align="center" spaceBottom="1.875em">
                Book Service
              </SectionTitleOne>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="cta__form__detail"
              >
                <div className="input-validator">
                  <input
                    type="text"
                    placeholder="Your name"
                    name="name"
                    ref={register({ required: true })}
                  />
                  {errors.name && (
                    <span className="input-error">
                      Please provide a valid name
                    </span>
                  )}
                </div>
                <div className="input-validator">
                  <input
                    type="text"
                    placeholder="Your phone"
                    name="phone"
                    ref={register({ required: true })}
                  />
                  {errors.phone && (
                    <span className="input-error">
                      Please provide a valid phone number
                    </span>
                  )}
                </div>
                <div className="input-validator">
                  <select
                    name="service"
                    ref={register({ required: true })}
                    className="customed-select"
                    defaultValue=""
                  >
                    <option value="" hidden>
                      Choose a services
                    </option>
                    {["Spa", "Salon", "Nail"].map((item, index) => (
                      <option key={index} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {errors.service && (
                    <span className="input-error">Please choose a service</span>
                  )}
                </div>
                <div className="input-validator">
                  <select
                    name="date"
                    ref={register({ required: true })}
                    className="customed-select"
                    defaultValue=""
                  >
                    <option value="" hidden>
                      Choose a services
                    </option>
                    {["Yesterday", "Today", "Tomorow"].map((item, index) => (
                      <option key={index} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  {errors.date && (
                    <span className="input-error">Please choose a date</span>
                  )}
                </div>
                <button className="btn -light-red">Appoitment</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
