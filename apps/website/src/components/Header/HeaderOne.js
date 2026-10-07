import React from "react";
import MenuOne from "./Menu/MenuOne";
import TopNavOne from "./TopNav/TopNavOne";

export default function HeaderOne(props) {
  return (
    <>
      <TopNavOne {...props} />
      <MenuOne {...props} />
    </>
  );
}
