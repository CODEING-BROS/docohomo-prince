import { useRouter } from "next/router";
import { useState,useEffect } from "react";
import { baseUrl } from "../../../config";
import axios from "axios";

export default function () {
  const router = useRouter();
  const { slug } = router.query;

 
  const onReviewSubmit = (data) => {
    console.log(data);
  };

  return (
    <>
        <h1>form page</h1>
    </>
    )
  ;
}
