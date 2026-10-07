import { useForm } from "react-hook-form";

export default function CTATwo() {
  const { register, handleSubmit, watch, errors } = useForm({
    mode: "onChange",
  });
  const onSubmit = (data) => {
    console.log(data);
  };
  return (
    <div
      className="cta -style-2"
      style={{
        backgroundImage: `url(${process.env.PUBLIC_URL}/assets/images/cta/CTATwo/1.png)`,
      }}
    >
      <div className="container">
        <div className="row">
          <div className="col-12  ">
            <div className="cta__form">
              <h3>
                Don’t Wait Any Longer! <br /> Give 55% Off Now!
              </h3>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="cta__form__detail"
              >
                <div className="row">
                  <div className="col-12 col-md-6">
                    <div className="input-validator">
                      <input
                        type="text"
                        placeholder="Name"
                        name="name"
                        ref={register({ required: true })}
                      />
                      {errors.name && (
                        <span className="input-error">
                          Please provide a valid name
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="input-validator">
                      <input
                        type="text"
                        placeholder="Phone"
                        name="phone"
                        ref={register({ required: true })}
                      />
                      {errors.phone && (
                        <span className="input-error">
                          Please provide a valid phone number
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="input-validator">
                      <input
                        type="text"
                        placeholder="Your address"
                        name="address"
                        ref={register({ required: true })}
                      />
                      {errors.address && (
                        <span className="input-error">
                          Please provide a valid address
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="input-validator">
                      <select
                        name="produts"
                        ref={register({ required: true })}
                        className="customed-select"
                        defaultValue=""
                      >
                        <option value="" hidden>
                          Choose products
                        </option>
                        {["Product A", "Product B", "Product C"].map(
                          (item, index) => (
                            <option key={index} value={item}>
                              {item}
                            </option>
                          )
                        )}
                      </select>
                      {errors.produts && (
                        <span className="input-error">
                          Please choose a service
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-12">
                    <div className="input-validator">
                      <textarea
                        type="text"
                        placeholder="Message"
                        name="message"
                        ref={register({ required: true })}
                      />
                      {errors.message && (
                        <span className="input-error">
                          Please provide a valid message
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button className="btn -dark">Send order now</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
