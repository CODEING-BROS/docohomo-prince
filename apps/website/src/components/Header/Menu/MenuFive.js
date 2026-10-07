import React from "react";
import Link from "next/link";

function MenuFive({ data }) {
  return (
    <header className="menufiveHeader">
      <div className="menufiveContainer">
        {/* <div className="logo"></div> */}
        <nav>
          <ul>
            {data.slice(0, 11).map((item) => {
              if (item) {
                return (
                  <li>
                    <a href={`${process.env.PUBLIC_URL}/${item.main_category_name.trim().replaceAll(" ","-")}`} style={{
                                  textTransform:"capitalize",
                                  textDecoration: "none",
                                  color: "#fff"
                                }}>{item.main_category_name.toUpperCase()}</a>
                    {item.subcategory.length === 0 ? (
                      <></>
                    ) : (
                      <div className="megamenu">
                        {data.map((i) => {
                          if (
                            i.main_category_name === item.main_category_name
                          ) {
                            return (
                              <div className="megamenuItems">
                                <a href={"#"} style={{
                                  textTransform:"capitalize",
                                  color: "#000",
                                  fontSize:"14px",
                                  padding: "10px 6px",
                                  cursor:"auto",
                                  textDecoration: "none"
                                }} >{i.category_name.toUpperCase()}</a>

                                <ul>
                                  {i.subcategory.map((j) => {
                                    return (
                                      <Link
                                        // href={`${process.env.PUBLIC_URL}/by-subcategory/[slug]`}
                                        // href={`#`}
                                        // as={`${process.env.PUBLIC_URL}/by-subcategory/${j.name}`}
                                        // as={`#`}
                                        href={`${process.env.PUBLIC_URL}/${item.main_category_name.trim().replaceAll(" ","-")}/${i.category_name?.toUpperCase()!=item.main_category_name.toUpperCase() ? i.category_name.trim().replaceAll(" ","-")+"/" : ""}${j.name.trim().replaceAll(" ","-")}`}
                                      >
                                        <li style={{
                                          textTransform:"capitalize"
                                        }} >{j.name}</li>
                                      </Link>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          }
                        })}
                      </div>
                    )}
                  </li>
                );
              } else {
                return <></>;
              }
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export default MenuFive;
