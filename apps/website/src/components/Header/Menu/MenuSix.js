import React from "react";
import { Container } from "reactstrap";
import Link from "next/link";

import Navigator from "../Elements/Navigator";
import MenuFunctionIcons from "../Elements/MenuFunctionIcons";
import { renderContainer } from "../../../common/utils";

const data = [
  { title: "Home", to: "/homepages/homepage1" },
  { title: "About", to: "/other/about" },
  { title: "Shop", to: "/fullwidth-4col" },
  { title: "Gallery", to: "/other/about" },
  { title: "Blog", to: "/blog" },
  { title: "Contact", to: "/other/contact" },
];

export default function MenuSix({ container }) {
  return (
    <div className="menu -style-6">
      <div className={renderContainer(container)}>
        <div className="menu__wrapper">
          <MenuFunctionIcons hide="cart" />
          <div className="navigator">
            <ul className="navigator_part -left">
              {data.slice(0, 3).map((item, index) => (
                <li key={index}>
                  <Link href={process.env.PUBLIC_URL + item.to}>
                    <a>{item.title}</a>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={process.env.PUBLIC_URL + "/homepages/homepage1"}>
              <a className="menu__wrapper__logo">
                <img src="/assets/images/logo.png" alt="Logo" />
              </a>
            </Link>
            <ul className="navigator_part -right">
              {data.slice(3).map((item, index) => (
                <li key={index}>
                  <Link href={process.env.PUBLIC_URL + item.to}>
                    <a>{item.title}</a>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <MenuFunctionIcons hide="search" />
        </div>
      </div>
    </div>
  );
}
