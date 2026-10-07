import axios from "axios";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { baseUrl } from "../../../config";
import { toast } from "react-toastify";
import { removeAllFromCart } from "../../redux/actions/cartActions";
import { removeOrderData } from "../../redux/reducers/orderReducer";
import { useRouter } from 'next/router';

export default function () {
  const cartState = useSelector((state) => state.cartReducer);
  const orderState = useSelector((state) => state.orderReducer);
  const dispatch = useDispatch();
  const router = useRouter();

  async function placeorder() {
    try {
      const response = await axios.post(
        `${baseUrl}/api/create/new/order`,
        {
          customer_id: orderState.orderData?.customer_id,
          customer_name: orderState.orderData?.customer_name,
          tid: orderState.orderData?.tid,
          customer_email: orderState.orderData?.customer_email,
          order_status: orderState.orderData?.order_status,
          products: cartState,
          total_amount: orderState.orderData?.total_amount,
          shipping_address: orderState.orderData?.shipping_address,
          state: orderState.orderData?.state,
          pincode: orderState.orderData?.pincode,
          town: orderState.orderData?.town,
        },
        {
          withCredentials: true,
        }
      );
      
      dispatch(removeAllFromCart());
      dispatch(removeOrderData());
      router.push("/thankyou?ordernumber=" + response.data.result.order_id);
      return toast.success("Your order has been placed");
    } catch (error) {
      
      if (error.response?.message) {
        return toast.error(error.response?.message);
      }
      return toast.error("An error occured");
    }
  }

  useEffect(()=> {
    placeorder();
  },[]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        height: "90vh",
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
        src="https://lottie.host/embed/1cfd7ebc-51e7-42c7-bbbf-390b5b6d3032/UlTrh7a0de.json"
      ></iframe>
      <span
        style={{
          fontWeight: "bold",
        }}
      >
        Please Wait while we are processing your order.....
      </span>
    </div>
  );
}
