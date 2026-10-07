import React from "react";
import Head from "next/head";

import FooterOne from "../Footer/FooterOne";
import withScrollFixed from "../../common/withScrollFixed";
import HeaderOne from "../Header/HeaderOne";

let ScrollFixedHeader = withScrollFixed(HeaderOne);

const description = "Buy homoeopathic medicine online in India with DocHomoeo. Get expert homoeopathic consultations & unparalleled service. Free consultation!"

export default function LayoutOne(props) {
  return (
    <>
      <Head>
        <title>{props?.title || "Dochomoeo | Your All in One Medical Solution"}</title>
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta
          name="description"
          content={props?.description || description}
          key="desc"
        />
        {/* <title>{props.title || "Dochomoeo | Your All in One Medical Solution"}</title> */}
      </Head>
      <ScrollFixedHeader container={props.container} />
      {props.children}
      <FooterOne />
    </>
  );
}
