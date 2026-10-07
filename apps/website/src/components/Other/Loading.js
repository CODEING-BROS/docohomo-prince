import React from "react";

export default function Loading() {
  return (
    // <div className="loading-overlay">
    //   <img
    //     src={process.env.PUBLIC_URL + "/assets/images/loading.gif"}
    //     alt="Loading image"
    //   />
    // </div>
    <div className="loading-overlay">
      <div className="lds-spinner">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>
    </div>
  );
}
