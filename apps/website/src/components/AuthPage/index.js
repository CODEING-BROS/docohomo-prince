import styled, { createGlobalStyle } from "styled-components";
import Link from "next/link";
import { useEffect, useState } from "react";
import OtpInput from "react-otp-input";
import axios from "axios";
import { useDispatch } from "react-redux";
import { baseUrl } from "../../../config";
import { Box, Modal } from "@mui/material";
import { loginUser } from "../../redux/reducers/userReducer";
import { toast } from "react-toastify";
import Loading from "../Other/Loading";
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

const style = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: 750,
    bgcolor: 'background.paper',
    border: '2px solid #000',
    boxShadow: 24,
    border: "none",
  };
  

export default function  AuthFromCheckout({handleIsRegister, handleClose}) {
  const dispatch = useDispatch();
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState();
  const [otp, setOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ error,setError ] = useState("");
  const [userNameErr, setuserNameErr] = useState(true)
  const [authType, setAuthType] = useState(false)

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
        handleIsRegister && handleIsRegister();
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
        handleClose();
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

  const handleAuthTypeClick = ()=>{
    setAuthType(!authType);
    setUsername("");
  }

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
    <>
      <Box sx={style}>
        <div
          style={{
            position: "absolute",
            top: "-17px",
            right: "-17px",
            zIndex: 1000,
            fontSize: "40px",
            color: "#c50000",
            cursor: "pointer",
          }}
          onClick={handleClose}
        >
          {" "}
          &#10006;{" "}
        </div>
        {loading && <Loading />}
        <div className="logincontainer" id="container">
          <div className="form-container sign-in-container">
            {!showOtp ? (
              <div className="loginform">
                <h5 className="loginheading">
                  {!authType ? "Create your account" : "Login"}
                </h5>
                <div className="social-container">
                  <h5
                    style={{
                      color: "red",
                    }}
                  >
                    {error}
                  </h5>
                </div>
                {!authType && (
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
                        Username accept only alphanumeric (like: aA to zZ and 0
                        to 9).
                      </p>
                    )}
                  </div>
                )}
                <div className="input-wrapper">
                  <input
                    className="logininput"
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    type="number"
                    placeholder="Enter your phone number"
                  />
                </div>
                <div onClick={handleAuthTypeClick}>
                  <p className="loginlink">
                    {!authType
                      ? "Already have account?"
                      : "Don't have account?"}
                  </p>
                </div>
                {!authType ? (
                  <button
                    onClick={handleSignup}
                    className={`lgbtn ${
                      !(username && phoneNumber) ? "loginDisabled" : ""
                    }`}
                  >
                    SignUp
                  </button>
                ) : (
                  <button
                    onClick={handlelogin}
                    className={`lgbtn ${
                      !(phoneNumber?.length == 10) ? "loginDisabled" : ""
                    }`}
                  >
                    Login
                  </button>
                )}
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
      </Box>
    </>
  );
}
