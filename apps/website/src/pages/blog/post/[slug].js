import React,{useState,useEffect,useRef} from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import data from "../../../data/blog/blog.json";
// import countries from "../../../data/countries.json";
import LayoutFour from "../../../components/Layout/LayoutFour";
import { getPostBySlug } from "../../../common/postSelect";
import BlogSidebar from "../../../components/Blog/BlogSidebar";
import PostContent from "../../../components/Blog/PostContent";
import InstagramTwo from "../../../components/Sections/Instagram/InstagramTwo";
import { baseUrl } from "../../../../config";
import axios from "axios";
import LayoutOne from "../../../components/Layout/LayoutOne";
import { toast } from "react-toastify";
import SectionTitleOne from "../../../components/Sections/SectionTitle/SectionTitleOne";
import PostCardTwo from "../../../components/Post/PostCardTwo";
import Button from "../../../components/Control/Button";

export default function () {
  const router = useRouter();
  const { slug } = router.query;
  const [blogsDataApi, setBlogsDataApi] = useState([]);
  const [relatedBlogsData, setRelatedBlogsData] = useState([]);
  const [name, setName] = useState("");
  const [phNum, setPhNum] = useState("");
  const [message, setMessage] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [medicine, setMedicine] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const inqForm = useRef();

  // const blogDataItem = blogsDataApi;

  console.log("FORM DETAILS===>",
  name,
  phNum,
  message,
  medicine,
  email,
  country,
);
// console.log("slug==>",slug);
//   console.log("blogsDataApi==>",blogsDataApi);
  // const foundPost = getPostBySlug(data, slug);
  const foundPost = blogsDataApi
//   console.log("foundPost==>",foundPost);

const getBlogsData = async()=>{
  const url_brands = `${baseUrl}/api/website/get/single/blog/post/${slug}`;
  await axios.get(url_brands,{withCredentials:true})
  .then(res=>{
    console.log("SINGLE BLOGS PAGE ====>>",res?.data);
    setBlogsDataApi(res?.data?.data)
    setRelatedBlogsData(res?.data?.related_blog);
  })
  .catch(err=>{
    console.log(err)
  })
}

useEffect(() => {
  getBlogsData()
}, [slug]);

console.log("blogsDataApi?.b",blogsDataApi)
console.log("blogsDataApi?.blog_category",blogsDataApi?.blog_category)

// Related blogs api

// useEffect(async() => {
//   let url_brands = `${baseUrl}/api/get/related/blogs/by/category/${`${blogsDataApi?.blog_category}`}`;
//   console.log("foundPost?.blog_category===>",blogsDataApi?.blog_category);
//   await axios
//     .get(url_brands, { withCredentials: true })
//     .then((res) => {
//       console.log("res?.data ======>>>>",res?.data);
//       setRelatedBlogsData(res?.data?.data);
//     })
//     .catch((err) => {
//       console.log(err);
//     });
// },[]);


  const handleSubmit = async (event) => {
    event.preventDefault();
    console.log("FORM DETAILS===>",
      name,
      phNum,
      message,
      medicine,
      email,
      country,
      data?.productID
    );

    setShowPopup(true);

    try {
      const url = `${baseUrl}/api/add/enquiry`;
      console.log(url);
      const res = await axios.post(
        url,
        {
          name: name,
          phone_no: phNum,
          message: message,
          medicine: medicine,
          email: email,
          country: country,
          form_source:foundPost?.blog_title,
          product_id: data?.productID,
        },
        { withCredentials: true }
      );
      console.log(res);
      setName("");
      setPhNum("");
      setMessage("");
      setMedicine("");
      setEmail("");
      setCountry("");
      toast.success("Thanks for submitting !!");
    } catch (err) {
      console.log(err);
    }
    // closeForm();
  };




 

  
  return (
    <>
     <div>
      <Head>
        <title>
          {foundPost?.meta_title ? foundPost?.meta_title : foundPost?.blog_title  }
        </title>
        <meta
          name="description"
          content= {foundPost?.meta_description}
          key="descri"
        />
      </Head>
     </div>
    {foundPost !== null && (
      <LayoutOne title={foundPost?.meta_title ? foundPost?.meta_title: foundPost?.blog_title}>
        <div className="post">
          <div className="post__cover">
            <img src={foundPost?.blog_image?.image_url} alt={foundPost?.blog_title} />
          </div>
          <div className="post__body">
            <div className="container">
              <div className="row no-gutters">
                <div className="col-12 ">
                <div className="post__content">
                    <PostContent data={foundPost} />
                  </div>
                </div>
                <div className="col-12 col-md-9">
                  {/* <div className="post__content">
                    <PostContent data={foundPost} />
                  </div> */}
                </div>
              </div>
            </div>
          </div>
        </div>
      <div className="container author_section_main ">
      <div className="author_section" >
          <img className="author_profile" src={foundPost?.author_profile?.image_url} 
          alt="" srcset="" />
         <div>
         <p className="author_bio" >{foundPost?.author_bio}</p>
         <p className="author_written" ><span  style={{fontSize:12,color:'gray',fontWeight:'400'}} >Writen by </span>
         <a className="author_name" href={foundPost?.author_social_link} target="_blank" >
         {foundPost?.blog_author}
         </a>
         </p>
         <p className="author_writen_date author_written" > {foundPost?.createdAt?.split('T')[0]}</p>
         </div>
        </div>
      </div>
         {/* <InstagramTwo />  */}
         {/* BLOGS SECTION  */}
      <SectionTitleOne align="center" spaceBottom="50px">
        Related Blogs
      </SectionTitleOne>
      <div className="container">
        <div className="row">
          {relatedBlogsData?.map((value, index) => (
            <div key={index} className="col-12 col-md-6">
              <PostCardTwo data={value} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 40, marginBottom:50 }} className="view_brands_page">
        <div className="view_all_Main_blogs">
        <Link href="/blog" >
          <button className="view_all_blogs">
          View All Blogs
          </button>
         
        </Link>
        </div>
      </div>
      {/* BLOGS SECTION */}
        {/* <div className="container blog_form_main">
             
              <h3 style={{padding:'0px 0px 10px 0px'}} >Enquiry Now</h3>
              <form ref={inqForm} onSubmit={handleSubmit}>
                <div className="formData">
                  <label
                    htmlFor="medicine"
                    className="medicine"
                    placeholder={data.name}
                  >
                    Medicine Name
                  </label>
                  <input className='form_input_field'
                    type="text"
                    value={medicine}
                    onChange={(e) => setMedicine(e.target.value)}
                    id="medicine"
                    name="medName"
                    required
                  />

                  <div className="two_inputs row">
                    <div className="col-12 col-md-6">
                      <label htmlFor="name" className="name">
                        Your Name
                      </label>
                      <input className='form_input_field'
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        type="text"
                        id="name"
                        name="name"
                        required
                      />
                    </div>
                   
                    <div className="col-12  col-md-6 ">
                      <label htmlFor="email" className="email">
                        Your Email
                      </label>
                      <input className='form_input_field'
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        id="email"
                        name="email"
                        required
                      ></input>
                    </div>
                  </div>
                  
                  <div className="row two_inputs">
                    <div className="col-12  col-md-6">
                      <label htmlFor="phone" className="phone">
                        Your Phone
                      </label>
                      <input className='form_input_field'
                        value={phNum}
                        onChange={(e) => setPhNum(e.target.value)}
                        type="tel"
                        id="phone"
                        name="phone"
                        required
                      />
                    </div>
                    
                    <div className="col-12  col-md-6">
                      <label htmlFor="country" className="country">
                        Your Country
                      </label>
                      
                         <select 
                        id="country"
                        name="country"
                        className="blog_enquiry_form_select_field"
                        required 
                        onChange={(e) => setCountry(e.target.value)}
                        >
                          <option disabled>Select Country</option>
                          {countries?.map(value=>(
                            <option value={value}>{value}</option>

                          ))}
                      </select>
                    </div>
                  </div>
                 
                  <label htmlFor="message" className="message">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    id="message"
                    name="message"
                    rows="4"
                    required
                  />
                  <br></br>
                </div>
                <br></br>

                <button className="blog_form_button" type="submit" >
                  Submit
                </button>
              </form>
            
            </div> */}

      </LayoutOne>
    )}
    
    </>
  );
}
