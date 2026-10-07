import styled, { createGlobalStyle } from "styled-components";
import Link from "next/link";
import { useEffect, useState } from "react";
import OtpInput from "react-otp-input";
import axios from "axios";
import { baseUrl } from "../../../config";
import { toast } from "react-toastify";
import { useDispatch } from "react-redux";
import { loginUser } from "../../redux/reducers/userReducer";
import Loading from "../../components/Other/Loading";
import { getCookie, removeCookie, setCookie } from "../../lib/session";

const AppContainer = styled.div`
  background: #f6f5f7;
  display: flex;
  justify-content: center;
  align-items: center;
  ${"" /* flex-direction: column; */}
  font-family: "Montserrat", sans-serif;
  height: 100vh;
  margin: -20px 0 50px;
`;

export default function () {
  const dispatch = useDispatch();
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState();
  const [otp, setOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ error,setError ] = useState("");
  const [userNameErr, setuserNameErr] = useState(true)

  const handleSignup = async () => {
    try {
      // Send a POST request to the "/user/register" API endpoint with username and phoneNumber
      // console.log(username);
      setLoading(true);
      const response = await axios.post(
        `${baseUrl}/api/user/register`,
        {
          username: username,
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
      setLoading(false);
      setError('Something went wrong !');
      return toast.error("An error has occured!");
    }
  };

  const handleOtpVerification = async () => {
    try {
      // Send a POST request to the "/user/register_verify" API endpoint with the OTP
      setLoading(true);
      const response = await axios.post(
        `${baseUrl}/api/user/register_verify`,
        {
          otp: otp,
          phone_number: phoneNumber,
          wlUser: getCookie("wlUser")
        },
        { withCredentials: true }
      );

      // Handle success or failure as needed
      if (response.data.success) {
        dispatch(loginUser(response.data));
        setLoading(false);
        removeCookie("wlUser")
        setCookie("token",response.data.token,30)
        window.location.replace("/user/profile");
        return toast.success("verification successful");
      } else if (response.data.success === false) {
        // OTP verification failed, handle the error
        console.log(response.data);
        setLoading(false);
        setError(response.data.message);
        return toast.error(response.data.message);
      }
      setError(response.data);
      return toast.error(response.data);
    } catch (error) {
      setLoading(false);
      setError("Something went wrong!");
      return toast.success(error);
    }
  };

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

  const clearOtp = () => {
    setOtp("");
  };

  return (
    <div className="appContainer hOXwLy">
      {loading && <Loading />}
      <div className="logincontainer" id="container">
        <div className="form-container sign-in-container">
          {!showOtp ? (
            <div className="loginform">
              <img
                className="responsive_logo_img"
                src={process.env.PUBLIC_URL + "/doc.png"}
              />
              <h5 className="loginheading">Create your account</h5>
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
                  onChange={(e) => {
                    let value = e.target.value;
                    let isTrue = new RegExp("^[a-zA-Z0-9]*$").test(value);
                    setuserNameErr(isTrue);
                    if (!value || isTrue) {
                      setUsername(value);
                    }
                  }}
                  value={username}
                  type="text"
                  placeholder="Enter username"
                  maxLength={25}
                  minLength={3}
                />
                {username && !userNameErr && (
                  <p className="error">
                    Username accept only alphanumeric (like: aA to zZ and 0 to
                    9).
                  </p>
                )}
              </div>
              <div className="input-wrapper">
                <input
                  className="logininput"
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  type="number"
                  placeholder="Enter your phone number"
                />
              </div>
              <Link href="/login">
                <p className="loginlink">Already have account?</p>
              </Link>
              <button
                onClick={handleSignup}
                className={`lgbtn ${
                  !(username && phoneNumber) ? "loginDisabled" : ""
                }`}
              >
                SignUp
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
                  <p>Enter verification code</p>
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
                      Verify OTP
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
