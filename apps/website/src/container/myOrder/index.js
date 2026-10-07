import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import axios from "axios";
import { baseUrl } from "../../../config";
import Loading from "../../components/Other/Loading";
import { formatDate } from "../../common/utils";
import { toast } from "react-toastify";
import { useDispatch, useSelector } from "react-redux";
import { FaCopy } from "react-icons/fa6";
import { Modal } from "@mui/material";
import OrderTracking from "./OrderTracking";
const GoToHome = styled.div`
  font-size: 18px;
  font-weight: 500;
  border: 1px solid #005B3C;
  background-color: #005B3C;  
  // width: 100px;
  padding: 10px;
  margin: 0 auto;
  border-radius: 8px;
  cursor: pointer;
`;
const Container = styled.div`
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-direction: column;
  gap: "20px";
`;

const Title = styled.h2`
  margin-bottom: 20px;
`;

const Card = styled.div`
  width: 80%;
  height: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0px 3px 15px 0px
    rgba(17, 30.999999999999996, 98.00000000000001, 0.1);
  border-radius: 10px;
  padding: 20px 2em 20px 2em;
  margin-bottom: 40px;
  @media only screen and (max-width: 553px) {
    width: 100%;
    padding: 20px 15px;
  }
`;

const OrderInfo = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const OrderDate = styled.div`
  font-weight: bold;
  @media only screen and (max-width: 553px) {
    font-size: 10px;
  }
`;

const Status = styled.div`
  color: white;
  width: max-content;
  white-space: nowrap;
  text-transform: capitalize;
  height: auto;
  background-color: ${(props)=>{
    if(props.status == "pending" || props.status == "shipped" || props.status == "delivered") return "#005B3C";
    else return "red"
  }};
  font-weight: bold;
  padding: 10px;
  border-radius: 999px;
  @media only screen and (max-width: 553px) {
    font-size: 9px;
  }
`;

const ProductTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  overflow-x: auto;
`;

const ProductTableHead = styled.thead`
  background-color: #f2f2f2;
`;

const ProductTableRow = styled.tr`
  border-bottom: 1px solid #ddd;
`;

const ProductTableHeader = styled.th`
  text-align: left;
  padding: 10px;
  @media only screen and (max-width: 553px) {
    font-size: 12px;
    padding-right: 0;
    &:last-child{
      padding-right:10px;
    }
  }
`;

const ProductTableData = styled.td`
  padding: 10px;
  line-height: normal;
  @media only screen and (max-width: 553px) {
    text-align: justify;
    font-size: 10px;
    padding-right: 0;
    &:last-child{
      padding-right:10px;
    }
  }
`;
const ProductTableDataTotal = styled.td`
  padding: 10px;
  line-height: normal;
  @media only screen and (max-width: 553px) {
    text-align: right;
    font-size: 10px;
  }
`;
const NameWidth = styled.div`
  @media only screen and (max-width: 553px) {
    font-size: 10px;
  }
`;
const CancelStatus = styled.div`
  color: red;
  font-weight: 600;
  font-size: 14px;
  text-align: right;
  @media only screen and (max-width: 553px) {
    text-align: justify;
    font-size: 11px;
  }
`;

const Price = styled.span``;

const TotalInfo = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: center;
  margin-top: 10px;
`;

const TotalLabel = styled.p`
  font-weight: bold;
  margin: 0 !important;
`;

const TotalAmount = styled.span``;

const AddressInfo = styled.div`
  margin-top: 10px;
  line-height: 2;
`;

const ProductImage = styled.div`
  padding: 10px;
  width: 65px;
  height: 65px;
  border-radius: 10px;
  border: 1px solid black;
  display: flex;
  justify-content: center;
  align-items: center;

  img {
    width: 55px;
    height: 55px;
    object-fit: contain;
  }
  @media only screen and (max-width: 553px) {
    width: 40px;
    height: 40px;
    // border-radius: 10px;
    border: none;
    img {
      width: 40px;
      height: 40px;
      object-fit: contain;
      border-radius: 50%;
      border: 1px solid black;
    }
  }
`;

export default function MyOrders() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const currentUser = useSelector((state) => state.userReducer.user);
  const [open, setOpen] = React.useState(false);
  const [trackOrderDetails, setTrackOrderDetails] = useState([]);
  const handleClose = () => setOpen(false);

  async function fetchOrders() {
    setLoading(true);
    try {
      const res = await axios.post(
        `${baseUrl}/api/get/all/orders/user`,
        {
          user: currentUser?.user._id,
        },
        {
          withCredentials: true,
        }
      );
      console.log(res);
      if (res?.data?.success === false) {
        setData([]);
        setLoading(false);
        return toast.error(res?.data?.message);
      }

      setData(res?.data);

      setLoading(false);
    } catch (error) {
      setLoading(false);
      console.log(error);
    }
  }

  async function trackOrder(id) {
    setOpen(id);
    try {
      const res = await axios.get(
        `${baseUrl}/api/track-order?orderId=${id}`,
        {
          user: currentUser?.user._id,
        },
        {
          withCredentials: true,
        }
      );
      console.log(res);
      setTrackOrderDetails(res.data);
    } catch (error) {
      console.log(error);
      toast.error(error.response.data.error || "Failed to fetch tracking information");
    }
  }

  const referIdRef = useRef(null);

  const copyReferIdToClipboard = () => {
    if (referIdRef.current) {
      const tempTextArea = document.createElement("textarea");
      tempTextArea.value = referIdRef.current.innerText;
      document.body.appendChild(tempTextArea);

      tempTextArea.select();
      document.execCommand("copy");
      document.body.removeChild(tempTextArea);
      toast.success("Copied!");
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  console.log(data);

  return (
    <>
      {loading ? (
        <>
          <Loading />
        </>
      ) : (
        <div>
          {data.length === 0 ? (
            <>
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                }}
              >
                <iframe
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    height: "400px",
                    width: "100%",
                  }}
                  src="https://lottie.host/?file=591b9b0c-8270-47e1-89bf-e4c20d9be7a4/fE5YV4HSPk.json"
                ></iframe>
                <span
                  style={{
                    fontWeight: "bold",
                  }}
                >
                  You don't have any orders{" "}
                </span>
                <GoToHome className='mt-4'>
                  <a href="/" style={{textDecoration:"none", color:"#fff"}}>Go to Home Page</a>
                </GoToHome>
              </div>
            </>
          ) : (
            <Container>
             
              {data?.map((item) => {
                console.log("izz", item);
                return (
                  <Card className="order_card">
                    <OrderInfo>
                      <OrderDate>
                        Ordered on: {formatDate(item?.createdAt)}
                        {
                          item.estimated_delivery_date && item?.order_status == "shipped" && <>
                          <br/> 
                          <br/> 
                          <span style={{color: "#005B3C"}} >Estimated Delivery Date: {item?.estimated_delivery_date}</span>
                          </>
                        }
                      </OrderDate>
                      <Status status={item?.order_status}>{item?.order_status == "pending" ? "Confirm" : item.order_status}</Status>
                      {/* <Status onClick={()=>handleOrderStatus(item.order_id)}>Get Order Status</Status> */}
                    </OrderInfo>
                    <ProductTable>
                      <ProductTableHead>
                        <ProductTableRow
                          style={{ marginTop: "14px", marginBottom: "14px" }}
                        >
                          <ProductTableHeader>Product</ProductTableHeader>
                          <ProductTableHeader>Description</ProductTableHeader>
                          <ProductTableHeader><div className="text-right">Price</div></ProductTableHeader>
                        </ProductTableRow>
                      </ProductTableHead>
                      <tbody className="tablebody">
                        {item?.products?.map((i) => {
                          return (
                            // <div style={{marginTop: "14px",width:"100%"}}>
                            <ProductTableRow  style={{lineHeight:'100px'}}>
                              <ProductTableData>
                                <ProductImage>
                                  <img
                                    className="productimg"
                                    src={i?.images[0]?.image_url}
                                    alt="Product"
                                  />
                                </ProductImage>
                              </ProductTableData>
                              <ProductTableData className="productname" colSpan={2}>
                                <div className="d-flex justify-content-between align-items-start">
                                  <NameWidth className="mb-2">{i?.name.substring(0,70)}{i?.name.length>70&&"..."}</NameWidth>
                                </div>
                                <div className="d-flex justify-content-between align-items-center">
                                  <div>Quantity: {i?.cartQuantity} Qty X ₹ {i?.price} {i.regular_price?<del style={{color: "gray"}}>(₹ {i.regular_price})</del>:""}</div>
                                  <div>₹ {i?.price * i?.cartQuantity}</div>
                                </div>
                                {/* <div>Quantity: {i?.cartQuantity}</div> */}
                              </ProductTableData>
                              {/* <ProductTableData className="text-right">
                              </ProductTableData> */}
                            </ProductTableRow>
                            // </div>
                          );
                        })}
                        {/* Add more product rows as needed */}
                       
                        <ProductTableRow  >
                          <ProductTableDataTotal  style={{padding:"17px 0px 16px 0px",fontSize:'12'}}>
                            <TotalLabel className="textlabel" >Total</TotalLabel>
                          </ProductTableDataTotal>
                          {/* <ProductTableData></ProductTableData> */}
                          <ProductTableDataTotal colSpan={2} className="text-right" style={{padding:"17px 10px 16px 0px",fontSize:'12'}}>
                            <TotalLabel  className="textlabel text-right font-bold">₹  {item?.total_amount}</TotalLabel>
                          </ProductTableDataTotal>
                        </ProductTableRow>
                      
                      </tbody>
                    </ProductTable>
                    <AddressInfo style={{marginTop:"25px"}} className="addressinfo addressMobile">
                      {" "}
                      <span className="ordertags"
                        style={{
                          fontWeight: "bold",
                        }}
                      >
                        {" "}
                        Address :
                      </span>{" "}
                      <span  className="ordertags">
                      {item?.shipping_address}, {item?.state}-{item.pincode}
                      </span>
                    </AddressInfo>
                    <AddressInfo  className="addressinfo">
                      {" "}
                      <span
                      className="ordertags" 
                        id="myInput"
                        style={{
                          fontWeight: "bold",
                        }}
                      >
                        {" "}
                        Payment Mode :
                      </span>{" "}
                      <span  className="ordertags">
                      {item?.tid}
                      </span>
                    </AddressInfo>
                    <AddressInfo  className="addressinfo">
                      {" "}
                      <span
                      className="ordertags"
                        style={{
                          fontWeight: "bold",
                        }}
                      >
                        {" "}
                        OrderID :
                      </span>{" "}
                      <span ref={referIdRef}  className="ordertags"> {item?.order_id}</span>
                      {/* <span
                        onClick={copyReferIdToClipboard}
                        style={{ marginLeft: "10px",cursor:'pointer',fontSize:'18px' }}
                      >
                        {" "}
                        <FaCopy />
                      </span> */}
                    </AddressInfo>
                    {/* <AddressInfo  className="addressinfo py-2">
                      {" "}
                      <span
                        id="myInput"
                        className="ordertags"
                        style={{
                          fontWeight: "bold",
                        }}
                      >
                        {" "}
                        Note :
                      </span>{" "}

                      <span   className="ordertags">
                      Track You Order By Copy <span className="orderid_bold">Order ID</span> And Click On Button.
                      </span>
                    </AddressInfo> */}
                    <AddressInfo  className="addressinfo">
                      {" "}
                      <span
                        style={{
                          fontWeight: "bold",
                        }}
                      >
                        {" "}
                       
                      </span>{" "}
                      <button onClick={()=>trackOrder(item?.order_id)}  className="button_link">
                     Track Order
                      </button>
                    
                    
                    </AddressInfo>
                  </Card>
                );
              })}
            </Container>
          )}
          {
            <Modal
              // open={true}
              open={open}
              onClose={handleClose}
              aria-labelledby="modal-modal-title"
              aria-describedby="modal-modal-description"
            >
              <OrderTracking trackOrderDetails={trackOrderDetails} orderId={open} onClose={handleClose} />
            </Modal>
          }
        </div>
      )}
    </>
  );
}
