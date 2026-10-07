import React from "react";
import { Container } from "reactstrap";
import Link from "next/link";

import Navigator from "../Elements/Navigator";
import MenuFunctionIcons from "../Elements/MenuFunctionIcons";
import { renderContainer } from "../../../common/utils";

const data = [
  { title: "Palettes", to: "/fullwidth-4col" },
  { title: "Eyes", to: "/fullwidth-4col" },
  { title: "Face", to: "/fullwidth-4col" },
  { title: "Lips", to: "/fullwidth-4col" },
  { title: "Cheek", to: "/fullwidth-4col" },
  { title: "Sets", to: "/fullwidth-4col" },
  { title: "Nails", to: "/fullwidth-4col" },
];

export default function MenuTwo({ container }) {
  return (
    <div className="menu -style-2">
      <div className={renderContainer(container)}>
        <div className="menu__wrapper">
          <MenuFunctionIcons hide="cart" />
          <div className="navigator">
            <ul className="navigator_part -left">
              {data.slice(0, 4).map((item, index) => (
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
              {data.slice(4, 7).map((item, index) => (
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
