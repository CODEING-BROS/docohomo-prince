import React, { useState, useEffect } from "react";
import axios from "axios";
import FileUploadDesign from "../../../components/common/FileUploadDesign";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { MenuItem } from "@mui/material";
import { Button } from "@mui/material";
import Iconify from "../../../components/Iconify";
import { useLocation, Link } from "react-router-dom";
import palette from "../../../theme/palette";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import {
  deleteImageFromFirebase,
  splitString,
  uploadFileToFirebase,
} from "src/global/globalFunctions";
import CircularProgress from "@mui/material/CircularProgress";
import CustomizedSnackbars from "../../../global/Snackbar/CustomSnackbar";
import ConfimModal from "../../../global/Modals/ConfimModal";
import CloseIcon from "@mui/icons-material/Close";
import Backdrop from "@mui/material/Backdrop";
import CancelIcon from "@mui/icons-material/Cancel";

function EditDoctor() {
  const productId = "6451f926af25e68eb4f1159d";
  const doctorId = useLocation().pathname.split("/")[3];
  console.log(doctorId);
  const [changedData, setChangedData] = useState({
    startTime: "",
    endTime: "",
    doctor_id: "",
    name: "",
    video: "",
    call: "",
    experience: "",
    languages: "",
    Specialization: "",
    image: "",
    description: "",
    availability: true,
    appointments: [],
  });
  const [productData, setProductData] = useState({
    product_main_category: "choose_main_category",
    product_category: "choose_category",
    product_subcategory: "choose_sub_category",
  });
  const [mainCategory, setMainCategory] = useState([]);
  const [category, setCategory] = useState([]);
  const [subCategory, setSubCategory] = useState([]);
  const [message, setMessage] = useState({ type: "", message: "" });
  const [openRemoveImageModal, setOpenRemoveImageModal] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fileUpload, setFileUpload] = useState();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [render, setRender] = useState(false);

  //================= GET Doctor =================
  useEffect(async () => {
    await axios
      .get(`${process.env.REACT_APP_BACKEND_URL}/api/get/doctor/${doctorId}`, {
        withCredentials: true,
      })
      .then((res) => {
        console.log(res.data);
        setChangedData({
          startTime: res?.data.time.startTime,
          endTime: res?.data.time.endTime,
          video: res?.data.price?.video,
          call: res?.data.price?.call,
          doctor_id: res?.data.doctor_id,
          name: res?.data.name,
          languages : res?.data?.languages,
          experience: res?.data.experience,
          Specialization: res?.data.Specialization,
          image: res?.data.image,
          description: res?.data.description,
          availability: res?.data.availability,
          appointments: res?.data.appointments,
        });
        // console.log(changedData);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);
  //================= GET PRODUCT =================

  //================= GET ALL MAIN CATEGORY =================
  // useEffect(() => {
  //   axios
  //     .get(
  //       `${process.env.REACT_APP_BACKEND_URL}/api/get/addproduct/maincategory`,
  //       { withCredentials: true }
  //     )
  //     .then((res) => {
  //       console.log(res);
  //       setMainCategory(res?.data);
  //     })
  //     .catch((err) => {
  //       console.log(err);
  //     });
  // }, []);
  //================= GET ALL MAIN CATEGORY =================

  // GET CATEGORY BY BRAND
  // useEffect(() => {
  //   if (productData?.product_main_category === "choose_main_category") return;
  //   axios
  //     .get(
  //       `${process.env.REACT_APP_BACKEND_URL}/api/get/category/for/addproduct?main_category=${productData?.product_main_category}`
  //     )
  //     .then((res) => {
  //       console.log(res);
  //       setCategory(res?.data);
  //     });
  // }, [productData?.product_main_category]);
  // GET CATEGORY BY BRAND

  // GET SUB CATEGORY BY BRAND
  // useEffect(() => {
  //   axios
  //     .get(
  //       `${process.env.REACT_APP_BACKEND_URL}/api/get/category/for/addproduct?category=${productData?.product_category}`
  //     )
  //     .then((res) => {
  //       console.log(res);
  //       setSubCategory(res?.data[0]?.subcategory);
  //     });
  // }, [productData?.product_category]);
  // GET SUB CATEGORY BY BRAND

  const handleChange = (e) => {
    setChangedData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
    setLoading(true);
    let productsImageToFirebase = [];
    if(fileUpload) {
      console.log("productsImageToFirebase", productsImageToFirebase);
      if (fileUpload.length > 0) {
        for (let i = 0; i < fileUpload?.length; i++) {
          productsImageToFirebase[i] = await uploadFileToFirebase(
            `/${process.env.REACT_APP_IMAGES_FOLDER_NAME}/products/${productData?.doctor_code}/`,
            fileUpload[i]
          );
        }
      }
    }
    let data = {
      time : {
        startTime: changedData?.startTime,
        endTime: changedData?.endTime,
      },
      price:{
        video: changedData?.video,
        call: changedData?.call,
      },
      languages: changedData?.languages,
      doctor_id: changedData?.doctor_id,
      name: changedData?.name,
      experience: changedData?.experience,
      Specialization: changedData?.Specialization,
      image: productsImageToFirebase.length === 0 ? changedData?.image : productsImageToFirebase[0],
      description: changedData?.description,
    };
    console.log("form Data ==>", data);
    await axios
      .patch(
        `${process.env.REACT_APP_BACKEND_URL}/api/update/doctor/${doctorId}`,
        { ...data },
        { withCredential: true }
      )
      .then((res) => {
        console.log(res);
        setLoading(false);
        setMessage((prev) => ({
          ...prev,
          type: "success",
          message: "Doctor Updated Successfully !!",
        }));
        setSnackbarOpen(true);
        setRender((prev) => !prev);
        setFileUpload("");
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
  console.log("openRemoveImageModal", openRemoveImageModal);

  // ##################### REMOVE IMAGE FUCNTION ###################
  // REMOVE PRODUCT IMAGE
  const handleRemoveProductImage = async (i, image_name, image_path) => {
    console.log("SUB CATEGORY DELETE IMAGE ==", i, image_name, image_path);
    let closeModalState = [...openRemoveImageModal];
    closeModalState[i] = false;
    setOpenRemoveImageModal(closeModalState);
    deleteImageFromFirebase(image_path, image_name);
    await axios
      .patch(
        `${process.env.REACT_APP_BACKEND_URL}/api/remove/product/image/${productId}/${image_name}`,
        { withCredentials: true }
      )
      .then((res) => {
        console.log(res);
        if (res?.data?.status === true) {
          setMessage((prev) => ({
            ...prev,
            type: "success",
            message: "Image Deleted Successfully !",
          }));
          setSnackbarOpen(true);
          setRender((prev) => !prev);
        } else {
          setMessage((prev) => ({
            ...prev,
            type: "error",
            message: "Image Deleted Failed !",
          }));
          setSnackbarOpen(true);
          setRender((prev) => !prev);
        }
      })
      .catch((err) => {
        setMessage((prev) => ({
          ...prev,
          type: "error",
          message: "Image Deleted Failed !",
        }));
        console.log(err);
      });
  };

  // ##################### REMOVE PRODUCT IMAGE ###################

  // remove image after select
  const handleRemoveUploadedImage = (removeByIndex) => {
    console.log(removeByIndex);
    const afterRemove = fileUpload?.filter((value, index) => {
      return index != removeByIndex;
    });
    console.log("AFTER REMOVE IMAGE=>", afterRemove);
    setFileUpload(afterRemove);
    setOpenRemoveImageModal(false);
  };

  // ############## CONFIRM MODAL ###########
  // sub category modal functions
  const handleOpenRemoveImageModal = (i, value) => {
    console.log("openModal ==", i, "-==", value);
    let newModalState = [...openRemoveImageModal];
    newModalState[i] = value;
    setOpenRemoveImageModal(newModalState);
  };

  const handleCloseSubCateConfirmModal = (i) => {
    console.log("CLOSE MODAL", i);
    let closeModalState = [...openRemoveImageModal];
    closeModalState[i] = false;
    setOpenRemoveImageModal(closeModalState);
  };
  // ############## CONFIRM MODAL ###########
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
            <h4>Edit Doctor</h4>
            <p>Edit your Doctor and necessary information from here</p>
          </div>
          <div className="close_edit_Category ">
            <Link to="/dashboard/available-doctors">
              <HighlightOffIcon
                style={{ color: palette.primary.main }}
                onClick={() =>
                  window.location.replace(process.env.PUBLIC_URL + "/dashboard/available-doctors")
                }
                fontSize="large"
              />
            </Link>
            {/* <HighlightOffIcon style={{color:palette.primary.main}}  fontSize='large' /> */}
          </div>
          <div className="addproduct_img_and_details flex">
            <div className="file_upload_col">
              <FileUploadDesign
                fileUpload={fileUpload}
                handleFileUpload={handleFileUpload}
              />
              <div className="" style={{ paddingTop: 20 }}>
                {productData?.product_images?.length > 0 &&
                  productData?.product_images?.map((value, index) => (
                    <div key={index} className="uploaded-images-preview">
                      <a target="_blank" href={value.image_url}>
                        <img
                          className="category-table-image"
                          alt="product"
                          src={`${value.image_url}`}
                        />
                      </a>
                      <p>{value.image_name?.split("--")[1]}</p>
                      <div className="remove-product-image-button">
                        <CancelIcon
                          style={{ color: "red", cursor: "pointer" }}
                          onClick={() =>
                            handleOpenRemoveImageModal(index, true)
                          }
                        />
                        {/* CONFIRM MODAL */}
                        <ConfimModal
                          open={openRemoveImageModal[index]}
                          title="Delete"
                          onYes={() =>
                            handleRemoveProductImage(
                              index,
                              value?.image_name,
                              value?.path
                            )
                          }
                          message="Do you want to delete?"
                          handleClose={() =>
                            handleCloseSubCateConfirmModal(index)
                          }
                        />
                        {/* CONFIRM MODAL */}
                      </div>
                    </div>
                  ))}
                {/* when file upload */}
                {fileUpload?.length > 0 &&
                  fileUpload?.map((value, index) => (
                    <div key={index} className="uploaded-images-preview">
                      <a target="_blank" href={URL.createObjectURL(value)}>
                        <img
                          className="category-table-image"
                          alt="product"
                          src={URL.createObjectURL(value)}
                        />
                      </a>
                      <p>{value.name}</p>
                      <div className="remove-product-image-button">
                        <CancelIcon
                          style={{ color: "red", cursor: "pointer" }}
                          onClick={() =>
                            handleOpenRemoveImageModal(index, true)
                          }
                        />
                        {/* CONFIRM MODAL */}
                        <ConfimModal
                          open={openRemoveImageModal[index]}
                          title="Delete"
                          onYes={() => handleRemoveUploadedImage(index)}
                          message="Do you want to delete?"
                          handleClose={() =>
                            handleCloseSubCateConfirmModal(index)
                          }
                        />
                        {/* CONFIRM MODAL */}
                      </div>
                    </div>
                  ))}
                {/* when file upload */}
              </div>
            </div>

            <div className="add_product_form">
              <form onSubmit={handleSubmit}>
                <div className="add_product_label_input">
                  <label htmlFor=""> Doctor Code </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="doctor_id"
                    value={changedData?.doctor_id}
                    onChange={handleChange}
                    placeholder=" Doctor Code "
                    variant="outlined"
                  />
                </div>

                <div className="add_product_label_input">
                  <label htmlFor=""> Doctor Name </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="name"
                    value={changedData?.name}
                    onChange={handleChange}
                    placeholder=" Doctor Name "
                    variant="outlined"
                  />
                </div>

                {/* <div className='add_product_label_input'>
                    <label htmlFor=""> Variant  </label>
                    <TextField required fullWidth className='product_form_input' id="outlined-basic" name="product_variant" value={productData?.product_variant} onChange={handleChange} placeholder=" Variant " variant="outlined" />
                    </div>

                    <div className='add_product_label_input'>
                    <label htmlFor=""> Quantity  </label>
                    <TextField type='number' required fullWidth className='product_form_input' id="outlined-basic" name='quantity' value={parseInt(productData?.quantity)} onChange={handleChange} placeholder=" Quantity " variant="outlined" />
                    </div> */}

                {/* <div className="add_product_label_input">
                  <label htmlFor=""> Select Main Category </label>
                  <TextField
                    labelId="demo-select-small"
                    id="demo-select-small"
                    className="select_field"
                    name="product_main_category"
                    style={{ textTransform: "capitalize" }}
                    value={productData?.product_main_category}
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
                    <MenuItem value="choose_main_category">
                      Choose Main Category
                    </MenuItem>
                    {mainCategory?.map((value, index) => (
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
                  <label htmlFor=""> Select Category </label>
                  <TextField
                    style={{ textTransform: "capitalize" }}
                    labelId="demo-select-small"
                    id="demo-select-small"
                    className="select_field"
                    name="product_category"
                    value={productData?.product_category}
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
                    <MenuItem value="choose_category">Choose Category</MenuItem>
                    {category?.map((value, index) => (
                      <MenuItem
                        key={value._id}
                        style={{ textTransform: "capitalize" }}
                        value={value?.category_name}
                      >
                        {value?.category_name}
                      </MenuItem>
                    ))}
                  </TextField>
                </div>

                <div className="add_product_label_input">
                  <label htmlFor=""> Select Sub-Category </label>
                  <TextField
                    style={{ textTransform: "capitalize" }}
                    labelId="demo-select-small"
                    id="demo-select-small"
                    className="select_field"
                    name="product_subcategory"
                    value={productData?.product_subcategory}
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
                    <MenuItem value="choose_sub_category">
                      Choose Sub-Category{" "}
                    </MenuItem>
                    {subCategory?.map((value, index) => (
                      <MenuItem
                        key={value?._id}
                        style={{ textTransform: "capitalize" }}
                        value={value?.name}
                      >
                        {value?.name}
                      </MenuItem>
                    ))}
                  </TextField>
                </div> */}

                <div className="add_product_label_input">
                  <label htmlFor=""> Doctor Specilization </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="Specialization"
                    value={changedData?.Specialization}
                    onChange={handleChange}
                    placeholder=" Doctor Specilization"
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor="languages"> Languages </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="languages"
                    value={changedData?.languages}
                    onChange={handleChange}
                    placeholder="Seperate languages by comma(,)"
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Doctor Experience </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="experience"
                    type="number"
                    value={changedData?.experience}
                    onChange={handleChange}
                    placeholder=" Doctor Experience"
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Doctor Timing </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="startTime"
                    value={changedData?.startTime}
                    onChange={handleChange}
                    placeholder=" Doctor start Timing"
                    variant="outlined"
                  />
                  <br />
                  <br />
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="endTime"
                    value={changedData?.endTime}
                    onChange={handleChange}
                    placeholder=" Doctor end Timing"
                    variant="outlined"
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Doctor Pricing </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="video"
                    value={changedData?.video}
                    onChange={handleChange}
                    placeholder="Video Call price"
                    variant="outlined"
                  />
                  <br />
                  <br />
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="call"
                    value={changedData?.call}
                    onChange={handleChange}
                    placeholder="Phone call price"
                    variant="outlined"
                  />
                </div>

                {/* <div className='flex' style={{width:'100%',gap:'10px'}} >
                  <div className='add_product_label_input' style={{width:'100%'}} >
                    <label htmlFor=""> Color  </label>
                    <TextField  fullWidth className='product_form_input' id="outlined-basic" name="color" value={productData?.color} onChange={handleChange} placeholder=" Color " variant="outlined" />
                    </div>
                    <div className='add_product_label_input' style={{width:'100%'}} >
                    <label htmlFor=""> Size  </label>
                    <TextField  fullWidth className='product_form_input' id="outlined-basic" name="size" value={productData?.size} onChange={handleChange} placeholder=" Size " variant="outlined" />
                    </div>
                    <div className='add_product_label_input' style={{width:'100%'}} >
                    <label htmlFor=""> Product Tag  </label>
                    <TextField  fullWidth className='product_form_input' id="outlined-basic" name="product_tag" value={productData?.product_tag} onChange={handleChange} placeholder="Product Tag " variant="outlined" />
                    </div>
                   
                  </div> 
                  <div className='flex' style={{width:'100%',gap:'10px'}} >
                  <div className='add_product_label_input' style={{width:'100%'}} >
                    <label htmlFor=""> Variant  </label>
                    <TextField  fullWidth className='product_form_input' id="outlined-basic" name="product_variant" value={productData?.product_variant} onChange={handleChange} placeholder=" Variant " variant="outlined" />
                    </div>
                  <div className='add_product_label_input' style={{width:'100%'}} >
                    <label htmlFor=""> Quantity  </label>
                    <TextField required type='number'  fullWidth className='product_form_input' id="outlined-basic" name='quantity' value={productData?.quantity} onChange={handleChange} placeholder=" Quantity " variant="outlined" />
                    </div>
                    <div className='add_product_label_input' style={{width:'100%'}} >
                    <label htmlFor="">Total Products In One Cartoon </label>
                    <TextField type='number'  fullWidth className='product_form_input' id="outlined-basic" name='cartoon_total_products' value={productData?.cartoon_total_products} onChange={handleChange} placeholder=" Total Products In One Cartoon " variant="outlined" />
                    </div>
                    </div> */}
                {/* <div className="flex" style={{ width: "100%", gap: "10px" }}>
                  <div
                    className="add_product_label_input"
                    style={{ width: "100%" }}
                  >
                    <label htmlFor=""> Regular Price </label>
                    <TextField
                      required
                      type="number"
                      fullWidth
                      className="product_form_input"
                      id="outlined-basic"
                      name="product_regular_price"
                      value={productData?.product_regular_price}
                      onChange={handleChange}
                      placeholder=" Regular Price "
                      variant="outlined"
                    />
                    <span
                      style={{
                        color: palette.primary.main,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      **Regular price is always greater than sale price.
                    </span>
                  </div>
                  <div
                    className="add_product_label_input"
                    style={{ width: "100%" }}
                  >
                    <label htmlFor=""> Sale Price </label>
                    <TextField
                      required
                      type="number"
                      fullWidth
                      className="product_form_input"
                      id="outlined-basic"
                      name="product_sale_price"
                      value={productData?.product_sale_price}
                      onChange={handleChange}
                      placeholder=" Sale Price "
                      variant="outlined"
                    />
                    <span
                      style={{
                        color: palette.primary.main,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      **Sale price is always less than regular price.
                    </span>
                  </div>
                </div> */}

                <div className="add_product_label_input">
                  <label htmlFor=""> Description </label>
                  <TextField
                    multiline
                    rows={10}
                    fullWidth
                    className="product_form_input"
                    name="description"
                    value={changedData?.description}
                    onChange={handleChange}
                    id="outlined-basic"
                    placeholder=" Add Description "
                    variant="outlined"
                  />
                </div>

                <div style={{ paddingTop: 20 }}>
                  <Link to="/dashboard/available-doctors">
                    <Button
                      variant="outlined"
                      style={{ marginRight: "10px" }}
                      onClick={() =>
                        window.location.replace(process.env.PUBLIC_URL + "/dashboard/available-doctors")
                      }
                      startIcon={<Iconify icon="akar-icons:arrow-back" />}
                    >
                      {" "}
                      GO BACK{" "}
                    </Button>
                  </Link>

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

export default EditDoctor;
