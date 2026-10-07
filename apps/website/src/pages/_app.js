import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/lib/integration/react";
import { persistor, store } from "../redux/store";
import { ToastContainer } from "react-toastify";
import ScrollToTop from "react-scroll-to-top";

import "../styles/styles.scss";
import Loading from "../components/Other/Loading";
import withReduxStore from "../common/with-redux-store";
import "../styles/app.scss";
import { useEffect } from "react";
import { useRouter } from "next/router";
// import * as fbq from "../lib/mpixel";
import { initializeGoogleTagManager } from "../lib/gtm";
const App = ({ Component, pageProps, reduxStore }) => {

  const router = useRouter();

  useEffect(() => {
    // Initialize Google Tag Manager with your GTM ID
    initializeGoogleTagManager('GTM-KR599G4F');
    // initializeGoogleAnalytics('G-XYY3P3LS4F');
  }, []);

  // useEffect(() => {
  //   fbq.pageview();

  //   const handleRouteChange = () => {
  //     fbq.pageview();
  //   };

  //   router.events.on("routeChangeComplete", handleRouteChange);
  //   return () => {
  //     router.events.off("routeChangeComplete", handleRouteChange);
  //   };
  // }, [router.events]);

  return (
    <>
    {/* <script
        id="fb-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', ${fbq.FB_PIXEL_ID});
          `,
        }}
      /> */}
    <Provider store={reduxStore}>
      <PersistGate loading={<Loading />} persistor={persistor}>
        <Component {...pageProps} />
        <ToastContainer position="bottom-left" autoClose={3000} />
        <ScrollToTop
          smooth
          component={<i className="fal fa-arrow-to-top" />}
          style={{
            backgroundColor: "#f7f5f4",
            borderRadius: "999px",
            height: "50px",
            width: "50px",
          }}
        />

        <img
          style={{
            height: "40px",
            width: "40px",
            position: "fixed",
            bottom: 40,
           // right: 40,
            left: 40,
            border: "none",
            borderRadius: "50%",
            background: "none",
            cursor:"pointer"
          }}
          src={process.env.PUBLIC_URL + "/assets/chat.png"}
          onClick={()=> {
            window.open('https://wa.me/6386796136', '_blank')
            // window.open('https://api.whatsapp.com/', '_blank')
          }}
        />
      </PersistGate>
    </Provider>
    </>
  );
};

export default withReduxStore(App);
