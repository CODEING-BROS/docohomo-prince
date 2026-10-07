import { baseUrl } from "../../config";
import axios from "axios";

const EXTERNAL_DATA_URL = 'https://dochomoeo.com';

function generateSiteMap(data) {
  return `<?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <url>
       <loc>https://dochomoeo.com/products</loc>
     </url>
     ${data.map((item) => {
        if (!item || !item.product_images[0] || !item.product_name) { }
        else {
            let slug = `product/${item.product_name.trim()}/${item._id}`
            return `
                <url>
                    <loc>${EXTERNAL_DATA_URL}/${slug.replace(/&/g, "").replace(/ /g, "-")}</loc>
                </url>
            `;
        }
      })
      .join('')}
   </urlset>`;
}

export async function getServerSideProps({ res }) {
  let data;

  try {
    const url = `${baseUrl}/api/catalouge/spreedsheet`;
    const response = await axios.get(url, { withCredentials: true });
    data = response.data.allProducts;
  } catch (error) {
    console.error("Error fetching data:", error);
    data = []; // Setting data to an empty array if fetch fails
  }

  // We generate the XML sitemap with the data data
  const sitemap = generateSiteMap(data);

  res.setHeader('Content-Type', 'text/xml');
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
