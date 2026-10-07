import React, { useState } from "react";
import { Container } from "reactstrap";
import Link from "next/link";

import Select from "../../Control/Select";
import { renderContainer } from "../../../common/utils";

const quickLinks = [
  { name: "About us", to: "/about" },
  { name: "Blog", to: "/blog" },
  { name: "Contact", to: "/contact" },
];

export default function TopNavTwo({ container }) {
  const [currency, setCurrency] = useState("USD");
  const [language, setLanguage] = useState("ENG");
  return (
    <div className="top-nav -style-2">
      <div className={renderContainer(container)}>
        <div className="top-nav__wrapper">
          <div className="top-nav__wrapper__quick-links">
            <ul>
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <a href={process.env.PUBLIC_URL + link.to}>{link.name}</a>
                </li>
              ))}
            </ul>
          </div>
          <p className="top-nav__wrapper__promo">
            Free shipping on international orders of $120+
          </p>
          <div className="top-nav__wrapper__selectors">
            <Select
              options={["USD", "VND", "YEN"]}
              getValue={(val) => setCurrency(val)}
              className="-borderless"
            />
            <Select
              options={["ENG", "VI", "JP"]}
              getValue={(val) => setLanguage(val)}
              className="-borderless"
            />
            <Link href={process.env.PUBLIC_URL + "#"}>
              <a className="top-nav__auth">Login/Register</a>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
