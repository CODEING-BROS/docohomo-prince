import React, { useEffect, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { useDispatch, useSelector } from "react-redux";
import ClientOnlyPortal from "../../../common/ClientOnlyPortal";
import NavigatorMobile from "./NavigatorMobile";
import SocialIcons from "../../Other/SocialIcons";
import Select from "../../Control/Select";
import SearchBox from "./SearchBox";
import { toast } from "react-toastify";
import { logoutUser } from "../../../redux/reducers/userReducer";
import axios from "axios";
import { baseUrl } from "../../../../config";
import Link from "next/link";
import { removeCookie } from "../../../lib/session";

export default function MobileNavSidebar({ showMobileNav, setShowMobileNav }) {

  const dispatch = useDispatch();
  const [brandsData, setBrandsData] = useState([]);

  const isAuthenticated = useSelector(
    (state) => state.userReducer.isAuthenticated
  );

  const fetchBrands = async() => {
    try {
      const url = `${baseUrl}/api/get/all/brands`;
      const res = await axios.get(url, { withCredentials: true });
      setBrandsData(res.data);
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    fetchBrands();
  }, []);

  const handleLogout = async () => {
    try {
      // const response = await axios.get(`${baseUrl}/api/user/logout`, {
      //   withCredentials: true,
      // });
      removeCookie("token");
      // console.log(response);
      dispatch(logoutUser());
      return toast.success("logout successfully");
    } catch (error) {
      return toast.error("something went wrong");
    }
  };
  const [searchInput, setSearchInput] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [language, setLanguage] = useState("ENG");
  const [showSearch,setShowSearch] = useState(false);

  return (
    <>
      <ClientOnlyPortal selector="#nav-sidebar">
        <CSSTransition
          in={showMobileNav}
          unmountOnExit
          timeout={200}
          classNames="cart-sidebar"
        >
          <div className="navigation-sidebar">
            {/* <div className="search-box">
              <SearchBox showSearch={true} setShowSearch={setShowSearch} />
              <form>
                <input
                  type="text"
                  placeholder="What are you looking for?"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                <button
                type="submit"
                onSubmit={() => {
                    window.location.replace(`/search/${searchInput}`);
                  }}
                >
                  <img
                    src="/assets/images/header/search-icon.png"
                    alt="Search icon"
                  />
                </button>
              </form>
            </div> */}
            <NavigatorMobile data={brandsData} />
            <div className="navigation-sidebar__footer">
              {/* <Select
                options={["USD", "VND", "YEN"]}
                getValue={(val) => setCurrency(val)}
                className="-borderless"
              />
              <Select
                options={["ENG", "VI", "JP"]}
                getValue={(val) => setLanguage(val)}
                className="-borderless"
              /> */}
              {isAuthenticated ? (
                <button onClick={handleLogout} className="navigation-sidebar__footer__auth" style={{ border:"none",backgroundColor:"white" }}>
                  logout
                </button>
              ) : (
                <Link href="/login">
                  <a className="navigation-sidebar__footer__auth">
                    Login/Register
                  </a>
                </Link>
              )}

              <SocialIcons />
            </div>
          </div>
        </CSSTransition>
      </ClientOnlyPortal>
      {showMobileNav && (
        <ClientOnlyPortal selector="#overlay">
          <div
            className="overlay"
            onClick={() => setShowMobileNav(false)}
          ></div>
        </ClientOnlyPortal>
      )}
    </>
  );
}
