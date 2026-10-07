import React, { useState, useEffect } from "react";
import axios from "axios";
import FileUploadDesignBlogs from "../../../components/common/FileUploadDesignBlogs";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { MenuItem,InputAdornment,Typography } from "@mui/material";
import { Button } from "@mui/material";
import Iconify from "../../../components/Iconify";
import palette from "../../../theme/palette";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import { uploadFileToFirebase } from "src/global/globalFunctions";
import CircularProgress from "@mui/material/CircularProgress";
import CustomizedSnackbars from "../../../global/Snackbar/CustomSnackbar";
import noImage from "../../../assests/No_image.svg";
import CloseIcon from "@mui/icons-material/Close";
import Backdrop from "@mui/material/Backdrop";
import CancelIcon from "@mui/icons-material/Cancel";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";

import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";



function AddBlogs({ handleClose }) {
  const [blogsData, setBlogsData] = useState();
  const [mainCategory, setMainCategory] = useState([]);
  const [category, setCategory] = useState([]);
  const [subCategory, setSubCategory] = useState([]);
  const [blogSubHeadingField, setBlogSubHeadingField] = useState([{ sub_head_title: "",sub_head_description:""}])
  const [allblog_category, setAllblog_category] = useState([]);
  const [searchData, setSearchData] = useState([]);
  const [blog_selected_products, setblog_selected_products] = useState([]);
  const [message, setMessage] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [fileUpload, setFileUpload] = useState();
  const [fileProfileUpload, setFileProfileUpload] = useState();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [render, setRender] = useState(false);
  const [search, setSearch] = useState("");
  console.log("BLOGS DATA", blogsData);
  console.log("blogSubHeadingField DATA", blogSubHeadingField);
  console.log("searchData DATA", searchData);

  // React editor Start
  const modules = {
    toolbar: [
      ["bold", "italic", "underline", "strike"], // toggled buttons
      ["blockquote", "code-block"],

      [{ header: 1 }, { header: 2 }], // custom button values
      [{ list: "ordered" }, { list: "bullet" }],
      [{ script: "sub" }, { script: "super" }], // superscript/subscript
      [{ indent: "-1" }, { indent: "+1" }], // outdent/indent
      [{ direction: "rtl" }], // text direction

      [{ size: ["small", false, "large", "huge"] }], // custom dropdown
      [{ header: [1, 2, 3, 4, 5, 6, false] }],

      [{ color: [] }, { background: [] }], // dropdown with defaults from theme
      [{ font: [] }],
      [{ align: [] }],

      ["clean"],
    ],
    clipboard: {
      matchVisual: false,
    },
  };

  const formats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "blockquote",
    "list",
    "bullet",
    "indent",
    "link",
    "image",
    "color",
  ];

  const editChangeEditor = (e) => {
    // console.log(e);
    setBlogsData((prev) => ({ ...prev, about_blog: e }));
  };


  // React editor End



  //================= GET ALL MAIN CATEGORY =================
  useEffect(() => {
    axios
      .get(
        `${process.env.REACT_APP_BACKEND_URL}/api/get/addproduct/maincategory`,
        { withCredentials: true }
      )
      .then((res) => {
        console.log(res);
        setMainCategory(res?.data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);
  //================= GET ALL MAIN CATEGORY =================

  
  // GET blog_category
  useEffect(() => {
      axios
      .get(
        `${process.env.REACT_APP_BACKEND_URL}/api/blogs/category/get/addproduct/maincategory`,
        { withCredentials: true }
      )
      .then((res) => {
        console.log("BRANDS===>>",res);
        setAllblog_category(res?.data);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);




  const handleChange = (e) => {
    setBlogsData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // File upload function for author profile
  const handleAuthorProfileUpload = (e) => {
    if (e.target.files?.length > 1)
      return alert("You can only select 1 image");
    console.log(e.target.files);
    const image = e.target.files[0];
    // setFileUpload(image);
    // let allImages = [...e.target.files];
    setFileProfileUpload(image);
    // blogsData?.author_profile
    setBlogsData((prev) => ({ ...prev, author_profile: null }));
  };



  // File upload function
  const handleFileUpload = (e) => {
    if (e.target.files?.length > 4)
      return alert("You can only select 4 images");
    console.log(e.target.files);
    let allImages = [...e.target.files];
    setFileUpload(allImages);
  };
  console.log(fileUpload);

  // remove image after select
  const handleRemoveImage = (removeByIndex) => {
    console.log(removeByIndex);
    const afterRemove = fileUpload?.filter((value, index) => {
      return index != removeByIndex;
    });
    console.log("AFTER REMOVE IMAGE=>", afterRemove);
    setFileUpload(afterRemove);
  };

  // handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!fileUpload) {
      alert("Add Atleast 1 Blog Image !!");
      return;
    }

    setLoading(true);
    let productsImageToFirebase = [];
    let authorProfileImageToFirebase;
    console.log("productsImageToFirebase", productsImageToFirebase);
    if(fileUpload){
        productsImageToFirebase=await uploadFileToFirebase(`/${process.env.REACT_APP_IMAGES_FOLDER_NAME}/blog_image/${blogsData?.blog_title}/`,fileUpload[0])
       }

       if (fileProfileUpload) {
        authorProfileImageToFirebase = await uploadFileToFirebase(
          `/${process.env.REACT_APP_IMAGES_FOLDER_NAME}/blog_image/author_profile/${blogsData?.blog_title}/`,
          fileProfileUpload
        );
      }
    await axios
      .post(
        `${process.env.REACT_APP_BACKEND_URL}/api/admin/create/new/blog/for/website`,
        { ...blogsData, blog_sub_headings:blogSubHeadingField,blog_image: productsImageToFirebase,author_profile:authorProfileImageToFirebase },
        { withCredential: true }
      )
      .then((res) => {
        console.log(res);
        setLoading(false);
        setMessage((prev) => ({
          ...prev,
          type: "success",
          message: "Blog Added Successfully !!",
        }));
        setSnackbarOpen(true);
        setBlogsData({
            blog_title:'',
            blog_slug:'',
            about_blog:'',
            meta_description:'',
            meta_title:'',
            blog_author:'',
            author_bio:'',
            author_social_link:''

        });
        setBlogSubHeadingField([{ sub_head_title: "",sub_head_description:""}])
        setFileUpload([]);
        setFileProfileUpload();
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      });
    setLoading(false);
  };

  // ##################### SNACK BAR FUNCTIONs ##################
  const handleCloseSnackbar = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }

    setSnackbarOpen(false);
  };
  // ##################### SNACK BAR FUNCTIONs ##################


  const editBlogDescriptionChange = (i,e) => {
    // console.log(e);
    let newFormValues = [...blogSubHeadingField];
    newFormValues[i]['sub_head_description'] = e;
    setBlogSubHeadingField(newFormValues);
    // setBlogsData((prev) => ({ ...prev, about_blog: e }));
  };

// blogs sub fields
let handleChangeSubFields = (i, e) => {
    let newFormValues = [...blogSubHeadingField];
    newFormValues[i][e.target.name] = e.target.value;
    setBlogSubHeadingField(newFormValues);
  }

let addFormFields = () => {
    setBlogSubHeadingField([...blogSubHeadingField, { sub_head_title: "",sub_head_description:""}])
  }

  let removeFormFields = (i) => {
    let newFormValues = [...blogSubHeadingField];
    newFormValues.splice(i, 1);
    setBlogSubHeadingField(newFormValues)
  }

   // SEARCH FOR PRODUCTS IN BLOGS
   const handleSearch = (e) => {
    e.preventDefault();
    setLoading(true);
    axios
      .get(
        `${process.env.REACT_APP_BACKEND_URL}/api/search/products/for/add/a/new/blog?search=${search}`,
        { withCredentials: true }
      )
      .then((res) => {
        console.log("res.data?.result-->",res);
        setSearchData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
      });
  }; 


// blog product select
let selctData = [];
const handleSelectBlogProduct=(data)=>{
    console.log("datadata",data)
selctData?.push(data)
setblog_selected_products(selctData)
}

console.log("blog_selected_products",selctData)
  return (
    <>
      {/* #################### LOADING SPINNER ######################## */}
      <Backdrop
        sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={loading}
        // onClick={handleClose}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
      {/* #################### LOADING SPINNER ######################## */}
      {/* #################### SANCKBAR MESSAGE ######################## */}
      <CustomizedSnackbars
        onOpen={snackbarOpen}
        type={message?.type}
        handleClose={handleCloseSnackbar}
        message={message?.message}
      />

      {/* #################### SANCKBAR MESSAGE ######################## */}
      <div className="product-conatiner">
        <div className="addproducts_slider">
          <div className="slider_heading">
            <h4>Add Blog</h4>
            <p>Add your blog and necessary information from here</p>
          </div>
          <div className="close_edit_Category ">
            <HighlightOffIcon
              style={{ color: palette.primary.main }}
              onKeyDown={handleClose}
              onClick={handleClose}
              fontSize="large"
            />
            {/* <HighlightOffIcon style={{color:palette.primary.main}}  fontSize='large' /> */}
          </div>
          <div className="addproduct_img_and_details flex">
            <div className="file_upload_col">
              <FileUploadDesignBlogs
                fileUpload={fileUpload}
                handleFileUpload={handleFileUpload}
              />
              <div className="" style={{ paddingTop: 20 }}>
                {fileUpload?.length > 0 &&
                  fileUpload?.map((value, index) => (
                    <div key={index} className="uploaded-images-preview">
                      <img
                        className="category-table-image"
                        alt="product"
                        src={URL.createObjectURL(value)}
                      />
                      <p>{value.name}</p>
                      <div className="remove-product-image-button">
                        <CancelIcon
                          style={{ color: "red", cursor: "pointer" }}
                          onClick={() => handleRemoveImage(index)}
                        />
                      </div>
                    </div>
                  ))}
              </div>

              <div style={{marginTop:20,marginBottom:20}} >
             <h3>Author Details</h3>
              <div className="add_product_label_input">
                  <label htmlFor=""> Blog Author Name </label>
                  <TextField
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="blog_author"
                    value={blogsData?.blog_author}
                    onChange={handleChange}
                    placeholder=" Blog Author Name"
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Author Social Link </label>
                  <TextField
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="author_social_link"
                    value={blogsData?.author_social_link}
                    onChange={handleChange}
                    placeholder="Author Social Link "
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Author Bio </label>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    className="product_form_input"
                    id="outlined-basic"
                    name="author_bio"
                    value={blogsData?.author_bio}
                    onChange={handleChange}
                    placeholder="Author Bio "
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                <div className="main-category-image-change">
                <label htmlFor=""> Author Profile </label>
                <img
                  className="edit-author-profile-image"
                  alt="product"
                  // src={
                  //   newMainCategory?.image?.image_url
                  //     ? newMainCategory?.image?.image_url
                  //     : fileUpload
                  //     ? URL.createObjectURL(fileUpload)
                  //     : noImage
                  // }
                  src={fileProfileUpload
                    ? URL.createObjectURL(fileProfileUpload): noImage
                  }
                />

                <Button
                  className="upload-edit-main-category"
                  variant="contained"
                  component="label"
                >
                  Upload
                  <input
                    hidden
                    accept="image/*"
                    type="file"
                    name="mainCategoryImage"
                    onChange={handleAuthorProfileUpload}
                  />
                </Button>
              </div>
              </div>
                </div>


              {/* <div style={{marginTop:20,marginBottom:20}} >
               <h3>Select Products For Blogs</h3>
               </div>
               <form
                onSubmit={handleSearch}
                className="flex"
                style={{ width: "100%",marginBottom:12 }}
              >
                <TextField
                  id="outlined-basic"
                  type="search"
                  required
                  fullWidth
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  label="Search For Products"
                  placeholder="Search with Product Name"
                  variant="outlined"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlinedIcon />
                      </InputAdornment>
                    ),
                  }}
                />
  
              </form>
              
<div>
    { searchData?.length >0 &&
    searchData?.map((value,index)=>(
        <div key={index} onClick={()=>handleSelectBlogProduct(value)} className="blogs-product-card">
   <MenuItem  >
   <p className="blog-product-title" >{searchData && index+ 1}) {value?.product_name} </p>
            </MenuItem>
            </div>
    ))   
}

{(search && searchData?.length == 0 ) &&
    <>
<p style={{textAlign:'center',paddingTop:12}} >No product found!</p>
</> 
}
</div> */}

            </div>

            <div className="add_product_form">
              <form onSubmit={handleSubmit}>
                <div className="add_product_label_input">
                  <label htmlFor=""> Blog Title </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="blog_title"
                    value={blogsData?.blog_title}
                    onChange={handleChange}
                    placeholder=" Blog Title "
                    variant="outlined"
                  />
                </div>

                <div className="add_product_label_input">
                  <label htmlFor=""> Blog Slug </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="blog_slug"
                    value={blogsData?.blog_slug}
                    onChange={handleChange}
                    placeholder="  Blog Slug "
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Meta Title </label>
                  <TextField
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="meta_title"
                    value={blogsData?.meta_title}
                    onChange={handleChange}
                    placeholder="  Meta Title "
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Meta Description </label>
                  <TextField
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="meta_description"
                    value={blogsData?.meta_description}
                    onChange={handleChange}
                    placeholder="  Meta Description "
                    variant="outlined"
                  />
                </div>
                {/* <div className="add_product_label_input">
                  <label htmlFor=""> Blog Author </label>
                  <TextField
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="blog_author"
                    value={blogsData?.blog_author}
                    onChange={handleChange}
                    placeholder="Blog Author "
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Author Social Link </label>
                  <TextField
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="author_social_link"
                    value={blogsData?.author_social_link}
                    onChange={handleChange}
                    placeholder="Author Social Link "
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Author Bio </label>
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    className="product_form_input"
                    id="outlined-basic"
                    name="author_bio"
                    value={blogsData?.author_bio}
                    onChange={handleChange}
                    placeholder="Author Bio "
                    variant="outlined"
                  />
                </div> */}
                <div className="add_product_label_input">
                  <label htmlFor=""> Select Blog Category </label>
                  <TextField
                    labelId="demo-select-small"
                    id="demo-select-small"
                    className="select_field"
                    name="blog_category"
                    style={{ textTransform: "capitalize" }}
                    value={blogsData?.blog_category}
                    onChange={handleChange}
                    select
                    SelectProps={{
                      isNative: true,
                      MenuProps: {
                        PaperProps: {
                          style: {
                            maxHeight: 250,
                            width: 250,
                          },
                        },
                      },
                    }}
                  >
                    <MenuItem value="choose_blog_category" disabled>
                    Choose Blog Category
                    </MenuItem>
                    {allblog_category?.map((value, index) => (
                      <MenuItem
                        key={value._id}
                        style={{ textTransform: "capitalize" }}
                        value={value?._id}
                      >
                        {value?._id}
                      </MenuItem>
                    ))}
                  </TextField>
                </div>
                <div className="add_product_label_input">
                  <label htmlFor="">About Blog </label>
                  {/* <TextField
                    multiline
                    rows={6}
                    fullWidth
                    className="product_form_input"
                    name="about_blog"
                    value={blogsData?.about_blog}
                    onChange={handleChange}
                    id="outlined-basic"
                    placeholder=" About Blog "
                    variant="outlined"
                  /> */}
                       <ReactQuill
                    theme="snow"
                    onChange={(e) => {
                      console.log(e);
                      editChangeEditor(e);
                    }}
                    value={blogsData?.about_blog}
                    modules={modules}
                    formats={formats}
                    style={{ width: "100%", height: 300, marginBottom: 50 }}
                  />
                </div>
               <div style={{marginTop:95,marginBottom:10}} >
               <h3>Add Sub headings</h3>
               </div>

                {/* <div className="add_product_label_input">
                  <label htmlFor="">Sub Heading Title 1 </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="sub_head_title_1"
                    value={blogsData?.sub_head_title_1}
                    onChange={handleChange}
                    placeholder="Sub Heading Title"
                    variant="outlined"
                  />
                </div>

                <div className="add_product_label_input">
                  <label htmlFor="">Sub Heading Description 1</label>
                  <TextField
                    multiline
                    rows={10}
                    fullWidth
                    className="product_form_input"
                    name="sub_head_description"
                    value={blogsData?.sub_head_description}
                    onChange={handleChange}
                    id="outlined-basic"
                    placeholder="Sub Heading Description"
                    variant="outlined"
                  />
                </div> */}

                {blogSubHeadingField.map((element,index)=>(
                     <div className='add-category-field' style={{marginTop:32}}  key={index} >
                    <div className='flex' >
                    <label htmlFor="">Sub Heading Title {index +1 }  </label>
                     {
                index ? 
                  
                  <Button variant='text' style={{marginLeft:"16px"}} onClick={() => removeFormFields(index)} > Remove </Button>
                : null
              }
                    </div>
                   <div className='flex' >
                   <TextField required fullWidth id="outlined-basic" name='sub_head_title' value={element.sub_head_title || ""} onChange={e => handleChangeSubFields(index, e)}  placeholder="Sub Heading Title" variant="outlined" />
                   </div>

 <div className="add_product_label_input">
                  <label htmlFor="">Sub Heading Description {index + 1}</label>
                  {/* <TextField
                    multiline
                    required
                    rows={10}
                    fullWidth
                    className="product_form_input"
                    name="sub_head_description"
                    value={element.sub_head_description || ""}
                    onChange={e => handleChangeSubFields(index, e)} 
                    id="outlined-basic"
                    placeholder="Sub Heading Description"
                    variant="outlined"
                  /> */}

                    <ReactQuill
                    theme="snow"
                    onChange={(e) => {
                      console.log(e);
                      editBlogDescriptionChange(index,e);
                    }}
                    value={element.sub_head_description || ""}
                    modules={modules}
                    formats={formats}
                    style={{ width: "100%", height: 300, marginBottom: 50 }}
                  />


                </div>

                     </div>     

            ))}

<Button  sx={{my:2}} variant='text' onClick={addFormFields} startIcon={<Iconify icon="ant-design:plus-outlined" />} > Add More Fields </Button>
               
               

                <div style={{ paddingTop: 20 }}>
                  <Button
                    variant="outlined"
                    style={{ marginRight: "10px" }}
                    onClick={handleClose}
                    startIcon={<Iconify icon="akar-icons:arrow-back" />}
                  >
                    {" "}
                    GO BACK{" "}
                  </Button>

                  <Button
                    variant="contained"
                    type="submit"
                    style={{ padding: "6px 30px" }}
                    startIcon={<Iconify icon="ant-design:plus-outlined" />}
                  >
                    {" "}
                    SAVE{" "}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default AddBlogs;
