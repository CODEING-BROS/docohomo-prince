import Link from "next/link";
import { useDispatch, useSelector } from "react-redux";
import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import axios from "axios";
import { baseUrl } from "../../config";
import LayoutFour from "../components/Layout/LayoutFour";
import LayoutOne from "../components/Layout/LayoutOne";
import { Breadcrumb, BreadcrumbItem } from "../components/Other/Breadcrumb";
import InstagramTwo from "../components/Sections/Instagram/InstagramTwo";
import {
  formatCurrency,
  formatDate,
  formatSingleNumber,
} from "../common/utils";
import {
  calculateTotalPriceAfterCoupon,
  calculateDiscountPrice,
  calculateSubTotalPrice,
  calculateDiscountPriceAfterCoupon,
  calculateTotalPrice,
} from "../common/shopUtils";
import { toast } from "react-toastify";
import { useEffect, useState } from "react";
import Loading from "../components/Other/Loading";
import { removeAllFromCart } from "../redux/actions/cartActions";
import styled from "styled-components";
import { addOrderData } from "../redux/reducers/orderReducer";
import AuthFromCheckout from "../components/AuthPage";
import { Modal } from "@mui/material";

let cod = 30;

export default function () {
  const cartState = useSelector((state) => state.cartReducer);
  const [couponAmount, setCouponAmount] = useState(0);
  const [couponType, setCouponType] = useState("");
  const [loading, setLoading] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [show, setShow] = useState(false);
  const [type, setType] = useState("ONLINE");
  const [charges, setCharges] = useState({});
  const [prePaidDiscount, setPrePaidDiscount] = useState(0);
  const [cartValue, setCartValue] = useState(0);
  const [openForm, setOpenForm] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [isProfile, setIsProfile] = useState(false);
  const isAuthenticated = useSelector(
    (state) => state.userReducer.isAuthenticated
  );
  const handleClose = () => setOpenForm(false);
  const handleIsRegister = () => setIsRegister(true);

  const currentUser = useSelector((state) => state.userReducer.user);
  const { register, handleSubmit, errors, setValue, reset } = useForm();
  const dispatch = useDispatch();
  const tid = "T" + (currentUser?.user.username?.replace(" ","")) + Date.now();
  const {
    register: couponRegister,
    handleSubmit: couponHandleSubmit,
    errors: couponErrors,
  } = useForm();

  const router = useRouter();

  async function getcharges() {
    const res = await axios.get(`${baseUrl}/api/delivery/get`);
    setCharges(res.data?.discount);
  }
  
  const prepaidDiscount = ()=>{
    const total = calculateTotalPrice(cartState, false);
    setCartValue(total);
    let ppd = (total*5/100).toFixed(2);
    setPrePaidDiscount(ppd<80?ppd:80);
  }

  const getAddresss =  async(e)=>{
    setLoading(true);
    axios.get(
      `${baseUrl}/api/user/get/${currentUser?.user._id}`,{ withCredentials: true })
      .then((response)=>{
      if(response.status==200){
        setLoading(false);
        if(!response.data.email) setIsProfile(true);
        console.log("hsdyusiudkjewkj",response)
        setValue("contact",response.data.email)
        setValue("firstName",response.data.firstName)
        setValue("lastName",response.data.lastName)
        setValue("country",response.data.country)
        setValue("streetAddress",response.data.address)
        setValue("town",response.data.town)
        setValue("state",response.data.state)
        setValue("zip",response.data.pincode)
      }
      else{
        setLoading(false);
        toast.error("Somthing error happens.")
      }
    }).catch(()=>{
      setLoading(false);
      toast.error("Internal Error");
    })
  }

  useEffect(() => {
    reset();
    isAuthenticated && getAddresss();
    getcharges();
    prepaidDiscount();
  }, [isAuthenticated]);

  const onSubmit = async (data) => {
    setLoading(true);
    if(isRegister || isProfile){
      handleProfile(data);
    }
    if (type === "COD") {
      try {
        const response = await axios.post(
          `${baseUrl}/api/create/new/order`,
          {
            customer_id: currentUser?.user._id,
            customer_name: data.firstName + " " + data.lastName,
            tid: type === "COD" ? "COD" : tid,
            customer_email: data.contact,
            order_status: "pending",
            products: cartState,
            total_amount:
              (totalPrice < charges?.cap
                ? totalPrice + charges?.amount + 14
                : totalPrice) + cod,
            delivery_charges:totalPrice < charges?.cap
            ? charges?.amount + 14
            : 0,
            shipping_address: data.streetAddress,
            state: data.state,
            pincode: data.zip,
            town: data.town,
            totalqty:data
          },
          {
            withCredentials: true,
          }
        );
        setLoading(false);
        dispatch(removeAllFromCart());
        router.push("/thankyou?ordernumber=" + response.data.result.order_id);
        return toast.success("Your order has been placed");
      } catch (error) {
        setLoading(false);
        if (error.response.message) {
          return toast.error(error.response.message);
        }
        return toast.error("An error occured");
      }
    }

    if (type !== "COD") {
      let finalAmount = totalPrice < charges?.cap
      ? (totalPrice- prePaidDiscount + (charges?.amount?charges?.amount:0)).toFixed(2)
      : totalPrice - prePaidDiscount;
      dispatch(
        addOrderData({
          customer_id: currentUser?.user._id,
          customer_name: data.firstName + " " + data.lastName,
          tid: type === "COD" ? "COD" : tid,
          customer_email: data.contact,
          order_status: "pending",
          total_amount:finalAmount,
          delivery_charges:totalPrice < charges?.cap
              ? charges?.amount
              : 0,
          shipping_address: data.streetAddress,
          state: data.state,
          pincode: data.zip,
          town: data.town,
        })
      );
      try {
        const payres = await axios.post(
          `${baseUrl}/api/pay`,
          {
            name: data.firstName + " " + data.lastName,
            amount:finalAmount,
            number: currentUser?.user.phone_number,
            tuid: currentUser?.user._id,
            tid: tid,
          },
          {
            withCredentials: true,
          }
        );

        setLoading(false);
        // dispatch(removeAllFromCart());
        window.location.replace(payres.data.link);
        return;
      } catch (error) {
        console.log(error);
        setLoading(false);
        if (error.response?.message) {
          return toast.error(error.response.message);
        }
        return toast.error("An error occured");
      }
    }
  };

  const handlePaymentChange = (event) => {
    setType(event.target.value);
  };

  const handleOpenForm = () => {
    setOpenForm(true);
  };

  const handleProfile = async (data) => {
    const payload = {
      email:data.contact,
      firstName:data.firstName,
      lastName:data.lastName,
      country:data.country,
      address:data.streetAddress,
      town:data.town,
      state:data.state,
      pincode:data.zip
    }
    axios.patch(
      `${baseUrl}/api/user/edit/${currentUser?.user._id}`,
      payload,
      { withCredentials: true }
    ).then((response)=>{
      if(response.status==200){
        toast.success("Profile updated successfully.");
      }
      else{
        toast.error("Somthing error happens.")
      }
    }).catch(()=>{
      toast.error("Internal Error");
    })
  };

  const onCouponSubmit = async (data) => {
    try {
      const c = data.coupon.toUpperCase();
      // setLoading(true);
      const total = calculateTotalPrice(cartState, false);
      const response = await axios.get(
        `${baseUrl}/api/coupon/title/${c}/${total}`
      );
      // setLoading(false);
      if (response?.data?.message) {
        return toast.error(`coupon has expired`);
      }
      setCouponAmount(response?.data?.discountValue);
      setCoupon(response?.data?.title);
      setCouponType(response?.data?.discountType);
      return toast.success("Coupon applied successfully!");
    } catch (error) {
      // setLoading(false);
      console.log(error);
      return toast.error(error?.response?.data?.message);
    }
  };

  const totalPrice = calculateTotalPriceAfterCoupon(
    cartState,
    false,
    couponAmount,
    couponType
  );

  return (
    <LayoutOne title="Checkout">
      <Breadcrumb title="Checkout">
        <BreadcrumbItem name="Home" />
        {/* <BreadcrumbItem name="Shop" /> */}
        <BreadcrumbItem name="Checkout" current />
      </Breadcrumb>
      {loading ? (
        <Loading />
      ) : (
        <div className="checkout">
          <div className="container">
            <div className="row">
              <div className="col-12  col-lg-8">
                <form>
                  <div className="checkout__form">
                    <div className="checkout__form__contact">
                      <div className="checkout__form__contact__title">
                        <h5 className="checkout-title">Contact information</h5>
                        {!isAuthenticated && (
                          
                          <button type="button" className="btn -red" onClick={handleOpenForm}>Login/Register</button>
                        )}
                      </div>
                      <div className="input-validator">
                        <input
                          type="email"
                          name="contact"
                          ref={register({
                            required: true, 
                            type: "email",
                            pattern: {
                              value: /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                            }
                          })}
                          placeholder="Email"
                        />
                        {errors.contact && (
                          <span className="input-error">
                            {errors.contact.ref.value.length > 0 ? "Please Provide a valid email":"Please provide email"}
                          </span>
                        )}
                      </div>
                      {/* <label className="checkbox-label" htmlFor="subcribe-news">
                      <input
                        type="checkbox"
                        id="subcribe-news"
                        name="subcribeNews"
                        ref={register}
                      />
                      Keep me up to dateon news and exclusive offers
                    </label> */}
                    </div>
                    <div className="checkout__form__shipping">
                      <h5 className="checkout-title">Shipping address</h5>
                      <div className="row">
                        <div className="col-12 col-md-6">
                          <div className="input-validator">
                            <label>
                              First name <span>*</span>
                              <input
                                type="text"
                                name="firstName"
                                ref={register({ required: true })}
                              />
                            </label>
                            {errors.firstName && (
                              <span className="input-error">
                                Please provide your first name
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-12 col-md-6">
                          <div className="input-validator">
                            <label>
                              Last name <span>*</span>
                              <input
                                type="text"
                                name="lastName"
                                ref={register({ required: true })}
                              />
                            </label>
                            {errors.lastName && (
                              <span className="input-error">
                                Please provide your last name
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-12">
                          <div className="input-validator">
                            <label>
                              Country <span>*</span>
                              <input
                                type="text"
                                name="country"
                                ref={register({ required: true })}
                              />
                            </label>
                            {errors.country && (
                              <span className="input-error">
                                Please provide your country
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-12">
                          <div className="input-validator">
                            <label>
                              Address <span>*</span>
                              <input
                                type="text"
                                name="streetAddress"
                                ref={register({ required: true })}
                                placeholder="Steet address"
                              />
                              {/* <input
                                type="text"
                                name="apartment"
                                ref={register({ required: true })}
                                placeholder="Apartment, suite, unite ect ( optinal )"
                              /> */}
                            </label>
                            {errors.streetAddress || errors.apartment ? (
                              <span className="input-error">
                                Please provide your address
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="col-12">
                          <div className="input-validator">
                            <label>
                              Town/City <span>*</span>
                              <input
                                type="text"
                                name="town"
                                ref={register({ required: true })}
                              />
                            </label>
                            {errors.town && (
                              <span className="input-error">
                                Please provide your town/city
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-12">
                          <div className="input-validator">
                            <label>
                              Country/State <span>*</span>
                              <input
                                type="text"
                                name="state"
                                ref={register({ required: true })}
                              />
                            </label>
                            {errors.state && (
                              <span className="input-error">
                                Please provide your country/State
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-12">
                          <div className="input-validator">
                            <label>
                              Postcode/ZIP <span>*</span>
                              <input
                                type="text"
                                name="zip"
                                ref={register({ required: true, minLength: 6, maxLength: 6 })}
                              />
                            </label>
                            {errors.zip && (
                              <span className="input-error">
                                {errors.zip.ref.value.length > 0 ? "Please provide a valid postcode/ZIP ( Length will be 6 )":"Please provide your postcode/ZIP"}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* <div className="col-12">
                          <div className="input-validator">
                            <label>
                              Order note
                              <input
                                type="text"
                                name="note"
                                placeholder="Note about your order, e.g, special noe for delivery"
                                ref={register()}
                              />
                            </label>
                          </div>
                        </div> */}
                        <div className="col-12">
                          <img
                            style={{
                              width: "100%",
                              height: "100%",
                              marginRight: "5px",
                            }}
                            src={
                              process.env.PUBLIC_URL + "/assets/images/ch.jpeg"
                            }
                          />
                        </div>
                      </div>
                      {/* <label className="checkbox-label" htmlFor="save">
                      <input
                        type="checkbox"
                        id="save"
                        name="saveInfo"
                        ref={register()}
                      />
                      Save this infomation for next time
                    </label> */}
                    </div>
                  </div>
                </form>
              </div>
              <div className="col-12 col-lg-4">
                <div className="row">
                  <div className="col-12 col-md-6 col-lg-12 ml-auto">
                    <div className="checkout__total">
                      <h5 className="checkout-title">Your order</h5>
                      <form
                        className="checkout__total__coupon"
                        onSubmit={couponHandleSubmit(onCouponSubmit)}
                      >
                        <h5>Coupon Code</h5>
                        <div className="input-validator">
                          <input
                            type="text"
                            placeholder="Your code here"
                            name="coupon"
                            ref={couponRegister({ required: true })}
                            style={{
                              textTransform: "uppercase",
                            }}
                          />
                          {couponErrors.coupon && (
                            <span className="input-error">
                              Please provide a coupon code
                            </span>
                          )}
                        </div>
                        <button type="submit" className="btn -dark">
                          Apply
                        </button>
                      </form>
                      <button
                        onClick={() => {
                          setShow(!show);
                        }}
                        className="btn -dark"
                      >
                         Available Coupons
                      </button>
                      <div
                        style={{
                          marginBottom: "10px",
                        }}
                      ></div>
                      <div className="checkout__total__price">
                        <h5>Product</h5>
                        <table>
                          <colgroup>
                            <col style={{ width: "70%" }} />
                            <col style={{ width: "30%" }} />
                          </colgroup>
                          <tbody>
                            {cartState.map((item) => (
                              <tr key={item.cartId}>
                                <td className="checkout-productname">
                                  <span>
                                    {formatSingleNumber(item.cartQuantity)}
                                  </span>{" "}
                                  x {item.name}
                                </td>
                                <td>
                                  <h3 className="product-price--main">
                                    <h3
                                      className="product-price--discount m-0 mb-2"
                                    >
                                      {formatCurrency(item.regular_price)}
                                    </h3>
                                    {formatCurrency(item.price)}
                                  </h3>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="checkout__total__price__total-count">
                          <table>
                            <tbody>
                              {coupon !== "" && couponAmount > 0 && (
                                <tr>
                                  <td>Coupon Applied : </td>
                                  <td
                                    style={{
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {" "}
                                    {coupon}{" "}
                                  </td>
                                </tr>
                              )}
                              <tr>
                                <td>Subtotal</td>
                                <td>
                                  {calculateSubTotalPrice(cartState, true)}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    color: "red",
                                  }}
                                >
                                  Discount
                                </td>
                                <td
                                  style={{
                                    color: "red",
                                  }}
                                >
                                  {" "}
                                  - {calculateDiscountPrice(
                                    cartState,
                                    true
                                  )}{" "}
                                </td>
                              </tr>
                              {couponAmount > 0 && (
                                <tr>
                                  <td
                                    style={{
                                      color: "red",
                                    }}
                                  >
                                    Coupon Discount
                                  </td>
                                  <td
                                    style={{
                                      color: "red",
                                    }}
                                  >
                                    {" "}
                                    -{" "}
                                    {calculateDiscountPriceAfterCoupon(
                                      cartState,
                                      true,
                                      couponAmount,
                                      couponType
                                    )}{" "}
                                  </td>
                                </tr>
                              )}
                              {type==="ONLINE"&&<tr>
                                <td style={{
                                    color: "red",
                                  }}>PrePaid Discount</td>
                                <td style={{
                                    color: "red",
                                  }}>
                                  {" "}-{" "}{`₹${prePaidDiscount}`}
                                </td>
                              </tr>}
                              <tr>
                                <td>Delivery Charges</td>
                                <td>
                                  {totalPrice < charges?.cap
                                    ? `+ ₹${charges?.amount + (type === "COD" ? 14 : 0)}`
                                    : "FREE"}
                                </td>
                              </tr>
                              {type === "COD" && <tr>
                                <td>COD Charges</td>
                                <td>
                                  + ₹{cod}
                                </td>
                              </tr>}
                              {type==="ONLINE"?<tr>
                                <td>Total</td>
                                <td>
                                  {totalPrice < charges?.cap
                                    ? `₹${(totalPrice - prePaidDiscount + (charges?.amount?charges?.amount:0)).toFixed(2)}`
                                    : `₹${totalPrice - prePaidDiscount}`}
                                </td>
                              </tr>:
                              <tr>
                                <td>Total</td>
                                <td>
                                  {totalPrice < charges?.cap
                                    ? `₹${totalPrice + charges?.amount + cod + 14}`
                                    : `₹${totalPrice + cod}`}
                                </td>
                              </tr>
                              }
                            </tbody>
                          </table>
                          {totalPrice < charges?.cap ? (
                            <p
                              style={{
                                marginTop: "10px",
                                lineHeight: "1.5rem",
                                color: "red",
                                fontWeight: "bold",
                              }}
                            >
                              Add items worth{" "}
                              {parseInt(charges?.cap - totalPrice)} more to get
                              free deivery
                            </p>
                          ) : (
                            <></>
                          )}
                        </div>
                        <div className="checkout__total__price__payment">
                          <label className="checkbox-label" htmlFor="payment">
                            Select Payment Method :
                          </label>
                          <div
                            style={{
                              marginTop: "10px",
                              color: type !== "ONLINE" && "#04888D",
                              fontWeight: type !== "ONLINE" && "bold",
                            }}
                          >
                            <input
                              type="radio"
                              id="cashOnDelivery"
                              name="paymentMethod"
                              value="COD"
                              checked={type === "COD"}
                              onChange={handlePaymentChange}
                            />
                            <label htmlFor="cashOnDelivery">
                              {" "}
                              Cash on Delivery
                            </label>
                            <p style={{color:"red",fontSize:"9px",marginTop:"10px",fontWeight:"600"}}>
                              (You pay an additional Rs. 30 for COD charges.)
                            </p>
                          </div>
                          <div
                            style={{
                              height: "10px",
                            }}
                          ></div>
                          <div
                            style={{
                              marginTop: "8px",
                              color: type === "ONLINE" && "#04888D",
                              fontWeight: type === "ONLINE" && "bold",
                            }}
                          >
                            <input
                              style={{
                                color: type === "ONLINE" ? "#04888D" : "",
                              }}
                              type="radio"
                              id="onlinePayment"
                              name="paymentMethod"
                              value="ONLINE"
                              checked={type === "ONLINE"}
                              onChange={handlePaymentChange}
                            />
                            <label htmlFor="onlinePayment">
                              {" "}
                              Online Payment
                            </label>
                            <p style={{color:"red",fontSize:"9px",marginTop:"10px",fontWeight:"600" }}>
                              (Get 5% extra off, up to Rs. 80, on online payments!)<br/>
                            </p>
                            <p style={{color:"red",fontSize:"9px",marginTop:"10px",fontWeight:"600" }}>
                              (Get additional Rs. 14 off, on online payments!)
                            </p>
                          </div>
                        </div>
                      </div>
                      {!isAuthenticated ? (
                        <>
                            <button className="btn -red" onClick={handleOpenForm}>Login/Register</button>
                        </>
                      ) : (
                        <button
                          className="btn -red"
                          onClick={handleSubmit(onSubmit)}
                        >
                          Place order
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <AllCoupons show={show} setShow={setShow} />
          <Modal 
          open={openForm}
          onClose={handleClose}
          aria-labelledby="modal-modal-title"
          aria-describedby="modal-modal-description"
        >
          <AuthFromCheckout handleIsRegister={handleIsRegister} handleClose={handleClose}/>
        </Modal>
        </div>
      )}
      {/* <InstagramTwo /> */}
    </LayoutOne>
  );
}

const Modals = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 50vh;
  width: 30vw;
  padding: 20px;
  background-color: white;
  //box-shadow: -2px 3px 22px 8px rgba(201, 201, 201, 1);
  color: black;
  z-index: 10;
  display: flex;
  flex-direction: column;
  //align-items: center;
  // justify-content: center;

  @media (max-width: 576px) {
    width: 80%;
  }
`;

function AllCoupons({ show, setShow }) {
  const [data, setData] = useState([]);

  async function getCoupons() {
    try {
      const res = await axios.get(`${baseUrl}/api/coupon/to`);
      // console.log(res);
      setData(res?.data?.coupons);
    } catch (error) {
      //  console.log(error);
    }
  }

  const copyToClipboard = (title) => {
    const el = document.createElement("textarea");
    el.value = title;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return toast.success("Coupon Code copied");
  };

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      // Click outside the component, close it
      setShow(!show);
    }
  };

  useEffect(() => {
    getCoupons();
  }, []);

  // console.log(data);
  // const newData = [
  //   {id:1,title:'DOCHOMM',description:'Semi-transparent background Semi-transparent backgroundSemi-transparent background '},
  //   {id:2,title:'DOCHOMM',description:'Semi-transparent background Semi-transparent backgroundSemi-transparent background '},
  //   {id:3,title:'DOCHOMM',description:'Semi-transparent background Semi-transparent backgroundSemi-transparent background '},
  //   {id:4,title:'DOCHOMM',description:'Semi-transparent background Semi-transparent backgroundSemi-transparent background '},
  //   {id:5,title:'DOCHOMM',description:'Semi-transparent background Semi-transparent backgroundSemi-transparent background '},
  //   {id:6,title:'DOCHOMM',description:'Semi-transparent background Semi-transparent backgroundSemi-transparent background '},
  // ]

  if (show) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)", // Semi-transparent background
          zIndex: 10,
        }}
        onClick={handleBackdropClick} // Call setShow(false) on click outside the component
      >
        <Modals className='coupons_modal_bbox'  >
          {data.map((item) => (
            <>
            <div key={item.id} className="check_out_coupons_main" onClick={() => copyToClipboard(item.title)}>
            <div className="coupon_top_box" >
            <p className="coupon_titile" >{item?.title}</p>
             <button className="btn -dark coupon_copy_btn ">Copy</button>
            </div>
            <p className="coupon_desc" >{item?.description}</p>
            </div>
            </>
          ))}
        </Modals>
      </div>
    );
  } else {
    return <></>;
  }
}
