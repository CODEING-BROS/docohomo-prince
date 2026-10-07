import React from "react";
import MenuTwo from "./Menu/MenuTwo";
import TopNavTwo from "./TopNav/TopNavTwo";

export default function HeaderOne(props) {
  return (
    <>
      <TopNavTwo {...props} />
      <MenuTwo {...props} />
    </>
  );
}
