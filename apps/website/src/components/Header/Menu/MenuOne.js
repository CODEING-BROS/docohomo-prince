import React from "react";
import Link from "next/link";

import Navigator from "../Elements/Navigator";
import MenuFunctionIcons from "../Elements/MenuFunctionIcons";
import { renderContainer } from "../../../common/utils";

export default function MenuOne({ container }) {
  return (
    <div className="menu -style-1">
      <div className={renderContainer(container)}>
        <div className="menu__wrapper">
          <Link href="/">
            <a className="menu__wrapper__logo">
              <img src={process.env.PUBLIC_URL + "/doc.png"} alt="Logo" />
            </a>
          </Link>
          <Navigator />
          <MenuFunctionIcons />
        </div>
        
      </div>
    </div>
  );
}
