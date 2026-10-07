import React from "react";
import Link from "next/link";

export default function PostCardFour({ data }) {
  return (
    <div className="post-card-four">
      <div className="post-card-four__image">
        <img src="" alt="Post image" />
      </div>
      <div className="post-card-four__content">
        <Link href={process.env.PUBLIC_URL + "/blog/" + data.slug}>
          <a href="#">{data.title}</a>
        </Link>
      </div>
    </div>
  );
}
