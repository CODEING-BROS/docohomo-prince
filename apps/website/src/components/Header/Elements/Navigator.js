import Link from "next/link";
import classNames from "classnames";

import menuData from "../../../data/header/navigation.json";

export default function Navigator({ disableSubmenu, className }) {
  function renderMenu() {
    return menuData.slice(0,5).map((item, index) => {
      // if (item.title === "Home") {
      //   return (
      //     <li className="relative" key={index}>
      //       <Link href={process.env.PUBLIC_URL + item.to}>
      //         <a>
      //           {item.title}
      //           <span className="dropable-icon">
      //             <i className="fas fa-angle-down"></i>
      //           </span>
      //         </a>
      //       </Link>
      //       <ul className="dropdown-menu">
      //         {item.subMenu.map((i, index) => (
      //           <li key={index}>
      //             <Link href={i.to}>
      //               <a>{i.title}</a>
      //             </Link>
      //           </li>
      //         ))}
      //       </ul>
      //     </li>
      //   );
      // }
      // if (item.title === "Shop") {
      //   return (
      //     <li key={index}>
      //       <Link href={process.env.PUBLIC_URL + item.to}>
      //         <a>
      //           {item.title}
      //           <span className="dropable-icon">
      //             <i className="fas fa-angle-down"></i>
      //           </span>
      //         </a>
      //       </Link>
      //       <ul className="dropdown-menu -wide">
      //         <ul className="dropdown-menu__col">
      //           {item.subMenu.slice(0, 4).map((i, index) => (
      //             <li key={index}>
      //               <Link href={process.env.PUBLIC_URL + i.to}>
      //                 <a>{i.title}</a>
      //               </Link>
      //             </li>
      //           ))}
      //         </ul>
      //         <ul className="dropdown-menu__col">
      //           {item.subMenu.slice(4, 8).map((i, index) => (
      //             <li key={index}>
      //               <Link href={process.env.PUBLIC_URL + i.to}>
      //                 <a>{i.title}</a>
      //               </Link>
      //             </li>
      //           ))}
      //         </ul>
      //         <ul className="dropdown-menu__col">
      //           {item.subMenu.slice(8).map((i, index) => (
      //             <li key={index}>
      //               <Link href={process.env.PUBLIC_URL + i.to}>
      //                 <a>{i.title}</a>
      //               </Link>
      //             </li>
      //           ))}
      //         </ul>
      //         <ul className="dropdown-menu__col -banner">
      //           <Link href={process.env.PUBLIC_URL + "/fullwidth-4col"}>
      //             <a>
      //               <img
      //                 src={
      //                   process.env.PUBLIC_URL +
      //                   "/assets/images/header/dropdown-menu-banner.png"
      //                 }
      //                 alt="New product banner"
      //               />
      //             </a>
      //           </Link>
      //         </ul>
      //       </ul>
      //     </li>
      //   );
      // }
      return (
        <li key={index}>
          <Link href={process.env.PUBLIC_URL + item.to}>
            <a>{item.title}</a>
          </Link>
        </li>
      );
    });
  }
  if (disableSubmenu) {
    return (
      <div className={`navigator -off-submenu ${classNames(className)}`}>
        <ul>
          {menuData.map((item, index) => (
            <li key={index}>
              <Link href={process.env.PUBLIC_URL + item.to}>
                <a>{item.title}</a>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className={`navigator ${classNames(className)}`}>
      <ul>{renderMenu()}</ul>
    </div>
  );
}
