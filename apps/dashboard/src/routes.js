import { Navigate, useRoutes,BrowserRouter,Route,Routes } from 'react-router-dom';

import DashboardLayout from './layouts/dashboard';
import LogoOnlyLayout from './layouts/LogoOnlyLayout';
import { UseContextState } from './global/GlobalContext/GlobalContext';

import User from './pages/User';
import Login from './pages/Login';
import Products from './pages/Products';
import Coupons from './pages/Coupons';
import Orders from './pages/Orders';
import Category from './pages/Category';
import Brand from "./pages/Brands";
import ProtectedRoute from './utils/ProtectedRoute';
import Banners from './pages/Banners';
import MobileBanners from './pages/MobileBanners';
import AvailableDoctors from './pages/AvailableDoctors';
import DoctorEnquiry from "./pages/DoctorsEnquiry"
import WholesaleEnquiry from "./pages/WholesaleEnquiry"
import EditDoctor from './pages/SidebarPages/doctorpage/EditDoctor';
import Delivery from "./pages/Delivery";
import BlogsPage from "./pages/BlogsPage"
import BlogsCategory from "./pages/BlogsCategory"

// ----------------------------------------------------------------------

export default function Router() {
  const {authState} = UseContextState()
  
  console.log("AUTHSTATE",authState)
  const userState = authState.isAuthenticated
     return (
     <Routes>
     <Route element={<ProtectedRoute/>} >
     <Route exact path="/"  element={ <Navigate to='/dashboard/orders' />    }  />    
     <Route path="/dashboard/users" element={ <DashboardLayout Component={<User/>} />} />
     <Route path="/dashboard/coupons" element={ <DashboardLayout Component={<Coupons />} />} />
     <Route path="/dashboard/products" element={ <DashboardLayout Component={<Products/>} />} />
     {/* <Route path="/dashboard/blog" element={ <DashboardLayout Component={<Blog/>} />} /> */}
     <Route path="/dashboard/orders" element={ <DashboardLayout Component={<Orders/>} />} />

     <Route path="/dashboard/blogs_categories" element={ <DashboardLayout Component={<BlogsCategory/>} />} />
     <Route path="/dashboard/blogs" element={ <DashboardLayout Component={<BlogsPage/>} />} />
     <Route path="/dashboard/available-doctors" element={ <DashboardLayout Component={<AvailableDoctors/>} />} />
     {/* <Route path="/dashboard/edit-doctor/:id" element={ <DashboardLayout Component={<EditDoctor />} />} /> */}
     <Route path="/dashboard/edit-doctor/:id" element={<EditDoctor />} />
     <Route path="/dashboard/doctor-enquiries" element={ <DashboardLayout Component={<DoctorEnquiry />} />} />
     <Route path="/dashboard/wholesale-enquiries" element={ <DashboardLayout Component={<WholesaleEnquiry />} />} />
     {/* <Route path="/dashboard/vendor" element={ <DashboardLayout Component={<Vendor/>} />}/> */}
     <Route path="/dashboard/categories" element={ <DashboardLayout Component={<Category/>} />} />
     <Route path="/dashboard/delivery" element={ <DashboardLayout Component={<Delivery />} />} />
     <Route path="/dashboard/brands" element={ <DashboardLayout Component={<Brand />} />} />
     <Route path="/dashboard/banners" element={ <DashboardLayout Component={<Banners/>} />} />
     <Route path="/dashboard/mobilebanners" element={ <DashboardLayout Component={<MobileBanners/>} />} />
   
      </Route>
       <Route exact path="/login" element={<LogoOnlyLayout Component={<Login/>} />   } />
       <Route exact path="*" element={<Navigate to="/login" />   } />
       

  
     
     {/* <Route exact path="/"  element={ <DashboardLayout Component={<DashboardApp />} />   }  />
     <Route exact path="/dashboard/app" element={ <DashboardLayout Component={<DashboardApp/>} /> } />
    
     <Route path="/dashboard/users" element={ <DashboardLayout Component={<User/>} />} />
     <Route path="/dashboard/products" element={ <DashboardLayout Component={<Products/>} />} />
     <Route path="/dashboard/blog" element={ <DashboardLayout Component={<Blog/>} />} />
     <Route path="/dashboard/orders" element={ <DashboardLayout Component={<Orders/>} />} />
     <Route path="/dashboard/vendor" element={ <DashboardLayout Component={<Vendor/>} />}/>
     <Route path="/dashboard/category" element={ <DashboardLayout Component={<Category/>} />} />
     <Route path="/dashboard/payments-vendor" element={ <DashboardLayout Component={<PaymentForVendors/>} />} />
     <Route path="/dashboard/products/add_product/:product_id" element={ <DashboardLayout Component={<AddProduct/>} />}/> */}
    
      {/* <Route path="/404" element={ <LogoOnlyLayout Component={<NotFound/>} />}/> */}

     {/* <Route path="*" element={<Navigate to={userState ? "/dashboard/app":"/login"} />} />    */}
 
   </Routes>

    )
  //  }
  // if(!authState.isAuthenticated){
  //   return (
 
  //    <Routes>
  //    <Route exact path="/" element={<LogoOnlyLayout Component={<Login/>} />}/>
  //    <Route exact path="/login" element={<LogoOnlyLayout Component={<Login/>} />}/>
  //    {/* <Route path="/register" element={<LogoOnlyLayout Component={Register} />}/> */}
  //    {/* <Route path="/404" element={<LogoOnlyLayout Component={NotFound} />}/> */}
  //    <Route path="*" element={<Navigate to="/login" />} />
 
  //  </Routes>
  
  //  )
  // }
}
