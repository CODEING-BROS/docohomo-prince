import React, { useState, useRef } from "react";
import styled from "styled-components";
import axios from "axios";
import emailjs from "@emailjs/browser";
import { baseUrl } from "../../../config";
import Loading from "../Other/Loading";
import { toast } from "react-toastify";

const Modal = styled.div`
  display: ${({ show }) => (show ? "block" : "none")};
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  ${"" /* width: 100%; */}
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  overflow: hidden;
`;

const Form = styled.form`
  width: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  right: 50%;
  transform: translate(-50%, -50%);
  background-color: #fff;
  padding: 60px;
  box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  margin-top: 10px;

  @media (max-width: 576px) {
    width: 80%;
    top: 45%;
    padding: 50px;
  }
`;

const FormData = styled.div`
  margin: 0.2rem;
`;

const Label = styled.label`
  line-height: 35px;
  font-weight: bold;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 5px;
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 5px;
`;

const Button = styled.button`
  display: inline-block;
  padding: 0.8rem 1.2rem;
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  border: none;
  border-radius: 5px;
  background-color: black;
  color: white;
  cursor: pointer;
  transition: background-color 0.3s ease, transform 0.2s ease;
  margin-left: 0.6rem;
  margin-bottom: -3rem;

  &:hover {
    background-color: black;
  }

  &:active {
    transform: scale(0.98);
  }
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 20px;
  right: 20px;
  ${"" /* font-size: 20px !important; */}
  cursor: pointer;
  padding: 10px 15px 8px !important;
  display: inline-block;
  ${"" /* padding: 0.8rem 1.2rem; */}
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  border: none;
  border-radius: 5px;
  background-color: black;
  color: white;
  transition: background-color 0.3s ease, transform 0.2s ease;
  margin-left: 2.2rem;
  margin-bottom: -3rem;
`;

export const DoctorForm = ({ show, setShow, data }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const ref = useRef();
  const [phNum, setPhNum] = useState("");
  const [consultationType, setConsultationType] = useState("video"); // Default to video call
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [languages, setLanguages] = useState("");

  // Define prices for consultation types
  const consultationPrices = {
    video: 50, // Price for video call
    phone: 30, // Price for phone call
  };

  const handleConsultationTypeChange = (e) => {
    setConsultationType(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = `${baseUrl}/api/doctorEnquiry`; // Adjust the API endpoint
      await axios.post(url, {
        doctorCode: data.doctor_id,
        doctorName: data.name,
        patientName: name,
        phoneNumber: phNum,
        consultationType: consultationType,
        consultationPrice:
          consultationType === "video" ? data?.price?.video : data?.price?.call, // Get the price based on the selected consultation type
        email: email,
        message: message,
      });
      setLoading(false);
      setShow(false);
      setName("");
      setEmail("");
      setPhNum("");
      setMessage("");
      emailjs
        .sendForm(
          "service_nevm3b9",
          "template_r42grie",
          ref.current,
          "public key"
        )
        .then(
          (result) => {
            console.log(result.text);
          },
          (error) => {
            console.log(error.text);
            setLoading(false);
            // return toast.error("An error has occurred!");
          }
        );
      return toast.success("Your enquiry has been submitted!");
    } catch (error) {
      console.log(error);
      setLoading(false);
      return toast.error("An error has occurred!");
    }
  };

  return (
    <>
      {loading ? (
        <Loading />
      ) : (
        <Modal show={show}>
          <div>
          <Form
            ref={ref}
            className="doctor_booking_form"
            onSubmit={handleSubmit} 
          >
            <h3
              style={{
                textAlign: "center",
                padding: "1rem",
              }}
            >
              Consultation Form
            </h3>
            <CloseButton onClick={() => setShow(false)}> x </CloseButton>

            <FormData className="doctor_booking_text_box" >
              <div className="row two_inputs">
                <div className="col-12  col-md-6">
                  <Label htmlFor="name">Your Name:</Label>
                  <Input
                    value={name}
                    placeholder="Please Enter your name"
                    onChange={(e) => setName(e.target.value)}
                    type="text"
                    id="name"
                    name="name"
                    required
                  />
                </div>
                <div className="col-12  col-md-6">
                  <Label htmlFor="email">Your Email:</Label>
                  <Input
                    type="email"
                    placeholder="Please Enter your Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    id="email"
                    name="email"
                    required
                  />
                </div>
              </div>
              <div className="row ">
                {/* <div className="col-12  col-md-6">
                  <Label htmlFor="phone">Languages :</Label>
                  <div style={{
                    alignItems:"center",
                    marginTop:"10px",
                    marginBottom:"10px"
                  }} >
                    {
                      data?.languages
                    }
                  </div>
                </div> */}
                {/* <div className="col-12  col-md-6"> */}
              </div>
              <Label htmlFor="phone">Your Phone:</Label>
              <Input
                value={phNum}
                placeholder="Please Enter your phone number"
                onChange={(e) => setPhNum(e.target.value)}
                type="text"
                pattern="[1-9]{1}[0-9]{9}"
                id="phone"
                name="phone"
                required
              />

              {/* </div> */}

              <Label>Consultation Type:</Label>
              <Container>
                <label className="radio_btn_label">
                  <input
                    id="specifyColor"
                    type="radio"
                    value="video"
                    checked={consultationType === "video"}
                    onChange={handleConsultationTypeChange}
                    style={{ marginBottom: "10px" }}
                  />
                  <p>Video Call - ₹ {data?.price?.video}</p>
                </label>
                <label className="radio_btn_label">
                  <input
                    id="specifyColor"
                    type="radio"
                    value="phone"
                    checked={consultationType === "phone"}
                    onChange={handleConsultationTypeChange}
                  />
                  <p>Phone Call - ₹ {data?.price?.call}</p>
                </label>
              </Container>
              {/* <br /> */}
              <Label htmlFor="message">Message:</Label>
              <TextArea
                value={message}
                placeholder="Any message for the doctor"
                onChange={(e) => setMessage(e.target.value)}
                id="message"
                name="message"
                rows="4"
                required
              />
              <br />
              <Label> Doctor's Preferred Languages: </Label>
              <Container>
                <ul style={{
                  marginLeft:"25px"
                }} >
                  {data?.languages?.split(",").map((i) => {
                    return <li style={{
                      marginTop:"5px"
                    }} >{i}</li>;
                  })}
                </ul>
              </Container>
            </FormData>
            <br />

            <Button className="doctor_booking_submit_button" type="submit">
              Submit
            </Button>
          </Form>
          </div>
        </Modal>
      )}
    </>
  );
};
