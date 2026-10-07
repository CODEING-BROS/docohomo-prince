import Link from "next/link";
import MenuFunctionIcons from "../Elements/MenuFunctionIcons";
import { renderContainer } from "../../../common/utils";

const menuData = [
  { title: "New", to: "/fullwidth-4col" },
  { title: "Face oil ", to: "/fullwidth-4col" },
  { title: "Serums", to: "/fullwidth-4col" },
  { title: "Masks", to: "/fullwidth-4col" },
  { title: "Body cream", to: "/fullwidth-4col" },
  { title: "Body wash", to: "/fullwidth-4col" },
  { title: "Sampoo", to: "/fullwidth-4col" },
  { title: "Hair gel", to: "/fullwidth-4col" },
];

export default function MenuFour({ hide, container }) {
  return (
    <div className="menu -style-4">
      <div className={renderContainer(container)}>
        <div className="menu__wrapper">
          <div className={`navigator -off-submenu`}>
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
          <MenuFunctionIcons hide={hide} />
        </div>
      </div>
    </div>
  );
}
