import React, { useState,useRef } from "react";
import styled from "styled-components";
import axios from "axios";
import { baseUrl } from "../../../config";
import Loading from "../Other/Loading";
import { toast } from "react-toastify";
import emailjs from "@emailjs/browser";

const Modal = styled.div`
  display: ${({ show }) => (show ? "block" : "none")};
  position: fixed;
  top: 0;
  left: 0;
  ${
    "" /* bottom: 0;
  right: 0; */
  }
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
`;

const Form = styled.form`
  width: 50%;
  position: absolute;
  top: 50%;
  left: 50%;

  transform: translate(-50%, -50%);
  background-color: #fff;
  padding: 50px;
  box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.5);
  border-radius: 12px;
  margin-top: 10px;

  @media (max-width: 576px) {
    width: 80%;
    padding: 40px;
    top: 45%;
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
  margin-left: 0.5rem;
  margin-bottom: -3rem;

  &:hover {
    background-color: black;
  }

  &:active {
    transform: scale(0.98);
  }
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

export const EnquiryForm = ({ show, setShow, data }) => {
  console.log(data);
  const [name, setName] = useState("");
  const [medicine, setMedicine] = useState("");
  const ref = useRef();
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [phNum, setPhNum] = useState("");
  const [message, setMessage] = useState("");
  const [ quantity,setQuantity ] = useState();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = `${baseUrl}/api/wholesaleEnquiry`;
      await axios.post(url, {
        productCode: data.id,
        productName: data.name,
        name: name,
        phoneNumber: phNum,
        quantity: quantity,
        country: country,
        email: email,
        message: message,
      });
      setLoading(false);
      setShow(false);
      setCountry("");
      setQuantity();
      setEmail("");
      setMedicine("");
      setName("");
      setPhNum("");
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
          //  return toast.error("An error has occurred!");
          }
        );
      return toast.success("Your enquiry has been submitted !");
    } catch (error) {
      console.log(error);
      setLoading(false);
      return toast.error("An error has occured!");
    }
  };

  return (
    <>
      {loading ? (
        <Loading />
      ) : (
        <Modal show={show}>
          <Form ref={ref} className="enquiry_form_box" onSubmit={handleSubmit}>
            <h3 className="enquiry_form_heading"
              style={{
                textAlign: "center"
              }}
            >
              Enquiry Form
            </h3>
            <CloseButton onClick={() => setShow(false)}> x </CloseButton>
            <FormData className="enquiry_form_text_box">
              <Label htmlFor="medicine">Medicine:</Label>
              <Input
                type="text"
                value={data.name}
                onChange={(e) => setMedicine(e.target.value)}
                id="medicine"
                required
              />
              <Label htmlFor="quantity">Quantity :</Label>
              <Input
                type="number"
                onChange={(e) => setQuantity(e.target.value)}
                id="medicine"
                required
              />
              <div className="row two_inputs">
                <div className="col-12  col-md-6">
                  <Label htmlFor="name">Your Name:</Label>
                  <Input
                    value={name}
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    id="email"
                    name="email"
                    required
                  />
                </div>
              </div>
              <div className="row two_inputs">
                <div className="col-12  col-md-6">
                  <Label htmlFor="phone">Your Phone:</Label>
                  <Input
                    value={phNum}
                    onChange={(e) => setPhNum(e.target.value)}
                    type="text"
                    pattern="[1-9]{1}[0-9]{9}"
                    id="phone"
                    name="phone"
                    required
                  />
                </div>
                <div className="col-12  col-md-6">
                  <Label htmlFor="country">Your Country:</Label>
                  <Input
                    type="text"
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    name="country"
                    required
                  />
                </div>
              </div>
              <Label htmlFor="message">Message:</Label>
              <TextArea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                id="message"
                name="message"
                rows="4"
                required
              />
              <br />
            </FormData>
            <br />
            <Button className="enquiry_form_submit_button" type="submit">Submit</Button>
          </Form>
        </Modal>
      )}
    </>
  );
};
