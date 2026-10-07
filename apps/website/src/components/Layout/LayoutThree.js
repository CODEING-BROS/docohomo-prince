import Head from "next/head";

import withScrollFixed from "../../common/withScrollFixed";
import HeaderThree from "../Header/HeaderThree";
import FooterOne from "../Footer/FooterOne";

let ScrollFixedHeader = withScrollFixed(HeaderThree);

export default function LayoutThree(props) {
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
