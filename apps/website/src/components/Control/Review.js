import React, { useState } from "react";
import Link from "next/link";
import Rate from "../Other/Rate";
import axios from "axios";
import { toast } from "react-toastify";
import { baseUrl } from "../../../config";
import { useSelector } from "react-redux";

export default function Review(props) {
  const {
    avatar,
    name,
    publicDate,
    rate,
    children,
    id,
    productID,
    user,
    show,
    setShow,
    desc,
    setDesc,
    reviewid,
    setReviewid,
  } = props;

  const userID = useSelector((state) => state.userReducer?.user?.user?._id);

  async function deleteComment() {
    try {
      const response = await axios.delete(
        `${baseUrl}/api/product/delete-review/${productID}/${id}`, // Update with your API endpoint
        {
          withCredentials: true,
        }
      );
      toast.success(response.data.message);
      window.location.reload();
    } catch (error) {
      toast.error(error);
    }
  }

  return (
    <div className="review">
      <div className="review__header">
        {/* <div className="review__header__avatar">
          <img
            src="https://i1.wp.com/metro.co.uk/wp-content/uploads/2020/03/GettyImages-1211127989.jpg?quality=90&strip=all&zoom=1&resize=644%2C416&ssl=1"
            alt="Reviewer avatar"
          />
        </div> */}
        <div className="review__header__info">
          <h5>{name}</h5>
          {/* <p>{publicDate}</p> */}
        </div>
        {/* <div className="review__header__rate">
          <Rate currentRate={rate} />
        </div> */}
      </div>
      <p className="review__content">{children}</p>
      {userID === user ? (
        <div
          style={{
            gap: 10,
            display: "flex",
          }}
        >
          <img
            onClick={() => {
              deleteComment();
            }}
            style={{
              height: 15,
              width: 15,
              cursor: "pointer",
            }}
            src="/bin.png"
          />
          <img
            onClick={() => {
              setReviewid(id);
              setShow(!show);
              setDesc(children);
            }}
            style={{
              height: 15,
              width: 15,
              cursor: "pointer",
            }}
            src="/edit.png"
          />
        </div>
      ) : (
        <></>
      )}
      {/* <Link href="#">
        <a className="review__report">Report as Inappropriate</a>
      </Link> */}
    </div>
  );
}
