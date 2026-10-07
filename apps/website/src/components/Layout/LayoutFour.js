import Head from "next/head";

import withScrollFixed from "../../common/withScrollFixed";
import FooterOne from "../Footer/FooterOne";
import HeaderFour from "../Header/HeaderFour";

let ScrollFixedHeader = withScrollFixed(HeaderFour);

export default function LayoutFour(props) {
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
