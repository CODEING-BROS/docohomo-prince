import React from "react";
import Head from "next/head";

import withScrollFixed from "../../common/withScrollFixed";
import HeaderSix from "../Header/HeaderSix";
import FooterOne from "../Footer/FooterOne";

let ScrollFixedHeader = withScrollFixed(HeaderSix);

export default function LayoutSix(props) {
  return (
    <>
      <Head>
        <title>{"Dochomoeo | Your All in One Medical Solution"}</title>
      </Head>
      <ScrollFixedHeader container={props.container} />
      {props.children}
      <FooterOne />
    </>
  );
}
