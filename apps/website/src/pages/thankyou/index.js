import axios from "axios";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { toast } from "react-toastify";
import { baseUrl } from "../../../config";
import { useSelector } from "react-redux";

// const orderNumber = 32873280924
export default function () {
    const router = useRouter();
    let orderNumber = router.query.ordernumber;
    const currentUser = useSelector((state) => state.userReducer.user);

    useEffect(() => {
      // Function to send a purchase event to Google Analytics
      const sendPurchaseEvent = async () => {
        const res = await axios.get(
          `${baseUrl}/api/get/all/orders/`+currentUser?.user._id+"/"+orderNumber,
          {
            user: currentUser?.user._id,
          },
          {
            withCredentials: true,
          }
        );
        if (res.data?.sccess === false || res?.data?.status > 200 || !res.data?.result?.length>0) {
          return toast.error(res?.data?.message);
        }

        let order = res.data.result?.[0];

        let items = [];
        order.products.forEach((e)=>{
          let obj = {
            item_id: e.code, // SKU or unique identifier for the product
            item_name: e.name, // Product name
            item_brand: e.brand, // Brand of the item (optional)
            item_category: e.category, // Category of the item (optional)
            price: e.price, // Price of the item
            quantity: e.cartQuantity, // Quantity purchased
          }
          items.push(obj);
        })

        // setData(res?.data);
        window.gtag('event', 'purchase', {
          transaction_id: order.tid, // Replace with your transaction ID
          value: order.total_amount, // Total purchase amount
          shipping: order.delivery_charges, // Shipping amount
          currency: 'INR', // Currency code
          items: items
        });
      } 
    
  
      // Check if gtag (Google Analytics script) is loaded
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
        // Send purchase event when component mounts
        sendPurchaseEvent();
      }
    }, []);

  return (
    <>
      <Head>
        <title>Thank You Page</title>
      </Head>
      <div className="container">
        <div className="tu-card">
            <div>
                <div className="my-4 thank-you">Thank You!</div>
                <div className="my-3">
                    <p>Your order number is <span>{orderNumber}</span></p>
                    <p>It will delivered in 2/7 business days.</p>
                </div>
                <div>
                    <p>Email us at <a href="mailto:contact.dochomoeo@gmail.com">contact.dochomoeo@gmail.com</a> <br/> with any Questions and suggestions.</p>
                </div>
              <div className='mt-4 tu-close'>
                <a href="/">Go to Home Page</a>
              </div>
            </div>
        </div>
      </div>
      <style>
        {`
            .thank-you{
                font-size: 42px;
                font-weight: 500;
                color: #005B3C;
            }
            .tu-card{
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                text-align: center;
                line-height: 135%;
            }

            .tu-card span, .tu-card a{
                color: #005B3C;
            }

            .tu-close{
              font-size: 18px;
              font-weight: 500;
              border: 1px solid #005B3C;
              background-color: #005B3C;  
              // width: 100px;
              padding: 6px;
              margin: 0 auto;
              border-radius: 8px;
              cursor: pointer;
            }
            
            .tu-close a{
              color: #fff;
              text-decoration: none;
            }
        `}
      </style>
    </>
  );
}
