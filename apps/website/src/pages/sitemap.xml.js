import { baseUrl } from "../../config";
import axios from "axios";

const EXTERNAL_DATA_URL = "https://dochomoeo.com";

function generateSiteMap(data, bdata) {
  return `<?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <!--We manually set the five URLs we know already-->
     <url>
       <loc>https://dochomoeo.com</loc>
     </url>
     <url>
       <loc>https://dochomoeo.com/blog</loc>
     </url>
     <url>
       <loc>https://dochomoeo.com/about</loc>
     </url>
     <url>
       <loc>https://dochomoeo.com/doctors</loc>
     </url>
     <url>
       <loc>https://dochomoeo.com/contact</loc>
     </url>
     ${bdata.map((item) => {
       if (item.main_category_slug)
         return `
      <url>
          <loc>${EXTERNAL_DATA_URL}/brands/${item.main_category_slug
           .replace(/&/g, "")
           .replace(/ /g, "-")}</loc>
      </url>
    `;
       else "";
     })}
     ${data
       .slice(0, 11)
       .map((item) => {
         return `
       <url>
           <loc>${EXTERNAL_DATA_URL}/${item.main_category_name
           .replace(/&/g, "")
           .replace(/ /g, "-")}</loc>
       </url>
     `;
       })
       .join("")}
      ${data
        .slice(0, 11)
        .map((item) => {
          if (!item || item.subcategory.length === 0) {
          } else {
            return data
              .map((i) => {
                if (i.main_category_name === item.main_category_name) {
                  return i.subcategory
                    .map((j) => {
                      let slug = `${item.main_category_name.trim()}/${
                        i.category_name?.toUpperCase() !=
                        item.main_category_name.toUpperCase()
                          ? i.category_name.trim() + "/"
                          : ""
                      }${j.name.trim()}`;
                      return `
                            <url>
                                <loc>${EXTERNAL_DATA_URL}/${slug
                        .replace(/&/g, "")
                        .replace(/ /g, "-")}</loc>
                            </url>
                        `;
                    })
                    .join("");
                }
              })
              .join("");
          }
          return `
       <url>
           <loc>${`${EXTERNAL_DATA_URL}/${item.main_category_name.replace(
             " ",
             "-"
           )}/${item._id}`}</loc>
       </url>
     `;
        })
        .join("")}
   </urlset>`;
}

export async function getServerSideProps({ res }) {
  let data, bdata;

  try {
    const burl = `${baseUrl}/api/brands/get/all/brands`;
    const bresponse = await axios.get(burl, { withCredentials: true });
    bdata = bresponse.data;
    const url = `${baseUrl}/api/get/all/brands`;
    const response = await axios.get(url, { withCredentials: true });
    data = response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
    data = []; // Setting data to an empty array if fetch fails
  }

  // We generate the XML sitemap with the data data
  const sitemap = generateSiteMap(data, bdata);

  res.setHeader("Content-Type", "text/xml");
  // we send the XML to the browser
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
}

function SiteMap() {
  // getServerSideProps will do the heavy lifting
}

export default SiteMap;
