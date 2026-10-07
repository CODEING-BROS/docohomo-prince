import { useRouter } from 'next/router'
import React, { useEffect } from 'react'
import Profile from '../../container/profile';
import MyOrders from '../../container/myOrder';
// import Address from '../../container/address';
import LayoutOne from '../../components/Layout/LayoutOne';
import { baseUrl } from '../../../config';
import { logoutUser } from '../../redux/reducers/userReducer';
import { toast } from "react-toastify";
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { getCookie } from '../../lib/session';

export default function (props) {

    const router = useRouter();
    const slug = router.query.slug;
    const dispatch = useDispatch();

    useEffect(() => {
      if(!getCookie("token")){
        router.push("/login");
      }
    }, [slug])

    const handleLogout = async () => {
      try {
        const response = await axios.get(`${baseUrl}/api/user/logout`, {
          withCredentials: true,
        });
        console.log(response);
        dispatch(logoutUser());
        router.push("/");
        return toast.success("logout successfully");
      } catch (error) {
        console.log("err",error)
        return toast.error("something went wrong");
      }
    };

    return <LayoutOne title="User-Section">
        <div className='container'>
            <div className="row p-0">
                <div className="d-none d-sm-block leftNavbar col-3">
                        <a href='/user/profile' >
                            <p className={`tab ${slug == "profile" ? "active_tab" : ""} my-3 p-3`}><span className='far fa-user-circle mr-3 sideIcon'/>My Profile</p>
                        </a>
                        <a href='/user/my-orders' >
                            <p className={`tab ${slug == "my-orders" ? "active_tab" : ""} my-3 p-3`}><span className='fas fa-cart-arrow-down mr-3 sideIcon' /> My Orders</p>
                        </a>
                        {/* <a href='/user/address' >
                            <p className={`tab ${slug == "address" ? "active_tab" : ""} my-3 p-3`}>Address</p>
                        </a> */}
                        <p className="tab my-3 p-3" onClick={handleLogout}><span className='fa fa-sign-out mr-3 sideIcon'/> Logout</p>
                </div>
                <div className='d-flex d-sm-none top_profile_navbar'>
                        <a href='/user/profile' >
                            <p className={`tab ${slug == "profile" ? "active_tab" : ""} p-2`}>My Profile</p>
                        </a>
                        <a href='/user/my-orders' >
                            <p className={`tab ${slug == "my-orders" ? "active_tab" : ""} p-2`}>My Orders</p>
                        </a>
                        {/* <a href='/user/address' >
                            <p className={`tab ${slug == "address" ? "active_tab" : ""} p-2`}>Address</p>
                        </a> */}
                        {/* <p className="tab p-2 bg-danger" onClick={handleLogout}>Logout</p> */}
                </div>
                <div className='col-12 col-sm-9 p-4 content'>
                    {getCookie("token") && slug == "profile" &&  <Profile />}
                    {getCookie("token") && slug == "my-orders" && <MyOrders />}
                    {/* {slug == "address" && <Address />} */}
                </div>
            </div>
        </div>
        <style>
            {`
              .leftNavbar a, .top_profile_navbar a{
                text-decoration: none;
              }  
              .tab{
                text-decoration: none;
                color: #000;
                cursor: pointer;
              } 
              .active_tab{
                color: white;
                background-color: #005B3C;
                font-weight: 500;
              }
              .top_profile_navbar{
                align-items: center;
                font-size: 16px;
                gap: 20px;
                padding: 10px 20px 0;
                overflow-x: scroll;
              }
              .top_profile_navbar p{
                white-space: nowrap;
              }

              .sideIcon{
                font-size: 20px;
              }
              
              @media screen and (max-width: 576px) {
                .content {
                    padding: 10px 20px !important;
                }
              }
            `}
        </style>
    </LayoutOne>
}
