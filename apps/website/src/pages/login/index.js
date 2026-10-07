import styled, { createGlobalStyle } from "styled-components";
import Link from "next/link";
import { useEffect, useState } from "react";
import OtpInput from "react-otp-input";
import { toast } from "react-toastify";
import { baseUrl } from "../../../config";
import axios from "axios";
import { useDispatch } from "react-redux";
import Loading from "../../components/Other/Loading";
import { loginUser } from "../../redux/reducers/userReducer";
import { getCookie, removeCookie, setCookie } from "../../lib/session";

const AppContainer = styled.div`
  background-image: url("./bg-1.jpg");
  background-size: cover;
  background-repeat: no-repeat;
  ${"" /* background: #f6f5f7; */}
  display: flex;
  justify-content: center;
  align-items: center;
  ${"" /* flex-direction: column; */}
  font-family: "Montserrat", sans-serif;
  height: 100vh;
  margin: -20px 0 50px;
`;

export default function () {
  const [
    { numInputs, separator, minLength, maxLength, placeholder, inputType },
    setConfig,
  ] = React.useState({
    numInputs: 4,
    separator: "-",
    minLength: 0,
    maxLength: 40,
    placeholder: "",
    inputType: "number",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState();
  const dispatch = useDispatch();

  const handlelogin = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${baseUrl}/api/user/login_by_number`,
        {
          phone_number: phoneNumber,
        },
        { withCredentials: true }
      );
      console.log(response);
      setLoading(false);
      if (response.data.success) {
        setShowOtp(true);
        setCookie("wlUser",response.data.wlUser,1);
        return toast.success("Otp send successfully!");
      } else if (response.data.success === false) {
        setError(response.data.message);
        return toast.error(response.data.message);
      }
      setError(response.data);
      return toast.error(response.data);
    } catch (error) {
      console.log(error);
      setLoading(false);
      setError("Something went wrong");
      return toast.error(error.message);
    }
  };

  const handleOtpVerification = async () => {
    try {
      // Send a POST request to the "/user/register_verify" API endpoint with the OTP
      setLoading(true);
      const response = await axios.post(
        `${baseUrl}/api/user/verify_login`,
        {
          otp: otp,
          phone_number: phoneNumber,
          wlUser: getCookie("wlUser")
        },
        { withCredentials: true }
      );

      console.log(response);
      // Handle success or failure as needed
      if (response.data.success) {
        dispatch(loginUser(response.data));
        setLoading(false);
        removeCookie("wlUser")
        setCookie("token",response.data.token,30)
        window.location.replace("/");
        //console.log(response.data);
        return toast.success("verification successful");
      }
        else {
        // OTP verification failed, handle the error
        console.log(response.data);
        setLoading(false);
        setError(response.data.message);
        return toast.error(response.data.message);
      }
      setError(response.data);
      return toast.error(response.data);
    } catch (error) {
      console.log(error);
      setLoading(false);
      setError("Something went wrong");
      return toast.success(error.message);
    }
  };

  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState("");

  const clearOtp = () => {
    setOtp("");
  };

  return (
    <div className="appContainer hOXwLy">
      {loading && <Loading />}
      <div className="logincontainer">
        <div className="form-container sign-in-container">
          {!showOtp ? (
            <div className="loginform">
              {/* <p> error idhar hai </p> */}
              <img
                className="responsive_logo_img"
                src={process.env.PUBLIC_URL + "/doc.png"}
              />

              <h5 className="loginheading">Login</h5>
              <div className="social-container">
                <h5
                  style={{
                    color: "red",
                  }}
                >
                  {error}
                </h5>
              </div>
              <div className="input-wrapper">
                <input
                  className="logininput"
                  type="number"
                  required={true}
                  placeholder="Enter your phone number"
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
              {/* <input
                className="logininput"
                type="password"
                placeholder="Password"
              /> */}
              <Link
              href={`${process.env.PUBLIC_URL}/Register`}
              as={`${process.env.PUBLIC_URL}/Register`}
            >
                <p className="loginlink">Don't have account?</p>
              </Link>
              <button className="lgbtn" onClick={handlelogin}>
                Login
              </button>
            </div>
          ) : (
            <div className="otpview">
              <div className="otpcard">
                <img
                  className="responsive_logo_img"
                  src={process.env.PUBLIC_URL + "/doc.png"}
                />

                <div className="otpform">
                  <p className="loginheading">Enter verification code</p>
                  <div className="margin-top--small">
                    <OtpInput
                      value={otp}
                      inputType={inputType}
                      onChange={setOtp}
                      numInputs={numInputs}
                      renderSeparator={<span>{separator}</span>}
                      renderInput={(props) => <input {...props} />}
                      shouldAutoFocus
                    />
                  </div>
                  <div className="otpbtn-row">
                    <button
                      className="otp_clear_btn otpbtn margin-top--large"
                      type="button"
                      disabled={otp.trim() === ""}
                      onClick={clearOtp}
                    >
                      Clear
                    </button>
                    <button
                      className="otpbtn margin-top--large"
                      disabled={otp.length < 4}
                      onClick={handleOtpVerification}
                    >
                      Verify Otp
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="overlay-container">
          <div className="loverlay">
            <div className="overlay-panel overlay-right">
              <img src="/assets/images/white-logo.png" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
