import React, { useEffect } from "react";
import Link from "next/link";
import Head from "next/head";
import Button from "../components/Control/Button";
import { useRouter } from "next/router";

export default function () {

  
  const router = useRouter();

  // useEffect(()=>{
  //   if(router.asPath.includes("shop/")){
  //     router.push(router.asPath.substring(5));
  //   }
  //   else{
  //     router.push("/");
  //   }
  // },[])


  return (
    <>
      <Head>
        <title>Error</title>
      </Head>
      <div className="error-404">
        <div className="container-full-half">
          <div className="row">
            <div className="col-12 col-md-7">
              <div className="error-404__content">
                <h2>Oops!</h2>
                <h5>404 PAGE NOT FOUND</h5>
                <p>
                  This page couldn't be found! Back to home page if you like.
                  Please use search for help!
                </p>
                <div className="form-wrapper">
                  <form>
                    <input type="text" placeholder="Enter keyword" />
                    <button className="btn -transparent">
                      <i className="fal fa-search"></i>
                    </button>
                  </form>
                  <Button
                    action={process.env.PUBLIC_URL + "/"}
                    className="-underline"
                    color="transparent"
                    content="Back to homepage"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
