import React, { useState, useEffect } from "react";
import axios from "axios";
import FileUploadDesign from "../../../components/common/FileUploadDesign";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { MenuItem } from "@mui/material";
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
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import CancelIcon from "@mui/icons-material/Cancel";

function AddCoupons({ handleClose }) {
  const [productData, setProductData] = useState({});
  const [mainCategory, setMainCategory] = useState([]);
  const [brand, setBrand] = useState([]);
  const [category, setCategory] = useState([]);
  const [subCategory, setSubCategory] = useState([]);
  const [message, setMessage] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [fileUpload, setFileUpload] = useState();
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [render, setRender] = useState(false);
  console.log("PRODUCT DATA", productData);

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

  //   axios
  //     .get(
  //       `${process.env.REACT_APP_BACKEND_URL}/api/brands/get/addproduct/maincategory`,
  //       { withCredentials: true }
  //     )
  //     .then((res) => {
  //       console.log(res);
  //       setBrand(res?.data);
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
    setProductData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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

    await axios
      .post(
        `${process.env.REACT_APP_BACKEND_URL}/api/coupon/add`,
        {
          title: productData?.coupon_code.toUpperCase(),
          description: productData?.description,
          isOrderCap: productData?.isOrderCap,
          OrderCap: productData?.OrderCap,
          discountType: productData?.product_main_category,
          discountValue: productData?.discount_value,
          expiryDate: productData?.expiry_date,
        },
        { withCredential: true }
      )
      .then((res) => {
        console.log(res);
        setLoading(false);
        setMessage((prev) => ({
          ...prev,
          type: "success",
          message: "Coupon Added Successfully !!",
        }));
        setSnackbarOpen(true);
        setProductData({});
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
            <h4>Add Coupon</h4>
            <p>Add your coupon and necessary information from here</p>
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
            {/* <div className="file_upload_col">
              <FileUploadDesign
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
            </div> */}

            <div className="add_product_form">
              <form onSubmit={handleSubmit}>
                <div className="add_product_label_input">
                  <label htmlFor=""> Coupon Code </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    name="coupon_code"
                    value={productData?.coupon_code}
                    onChange={handleChange}
                    placeholder=" Coupon Code "
                    variant="outlined"
                    style={{
                      textTransform: "uppercase",
                    }}
                  />
                </div>
                <div className="add_product_label_input">
                  <label htmlFor=""> Is there any minimum amount? </label>
                  <RadioGroup
                    aria-labelledby="demo-radio-buttons-group-label"
                    defaultValue="false"
                    name="isOrderCap"
                    value={productData?.isOrderCap}
                    onChange={handleChange}
                  >
                    <FormControlLabel
                      value="true"
                      control={<Radio />}
                      label="True"
                    />
                    <FormControlLabel
                      value="false"
                      control={<Radio />}
                      label="False"
                    />
                  </RadioGroup>
                </div>
                {
                  productData?.isOrderCap === "true" &&
                <div className="add_product_label_input">
                  <label htmlFor=""> Minimum amount </label>
                  <TextField
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    type="number"
                    name="OrderCap"
                    value={productData?.OrderCap}
                    onChange={handleChange}
                    placeholder=" Enter minimum amount"
                    variant="outlined"
                  />
                </div>
                }
                <div className="add_product_label_input">
                  <label htmlFor=""> Expiry Date </label>
                  <TextField
                    required
                    fullWidth
                    className="product_form_input"
                    id="outlined-basic"
                    type="datetime-local"
                    name="expiry_date"
                    value={productData?.expiry_date}
                    onChange={handleChange}
                    placeholder=" DD/MM/YYYY "
                    variant="outlined"
                  />
                </div>

                <div className="add_product_label_input">
                  <label htmlFor=""> Discount Type </label>
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
                      Discount Type
                    </MenuItem>
                    {["percentage", "amount"]?.map((value, index) => (
                      <MenuItem
                        key={value}
                        style={{ textTransform: "capitalize" }}
                        value={value}
                      >
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                </div>

                <div className="flex" style={{ width: "100%", gap: "10px" }}>
                  <div
                    className="add_product_label_input"
                    style={{ width: "100%" }}
                  >
                    <label htmlFor=""> Discount Value </label>
                    <TextField
                      required
                      type="number"
                      fullWidth
                      className="product_form_input"
                      id="outlined-basic"
                      name="discount_value"
                      value={productData?.discount_value}
                      onChange={handleChange}
                      placeholder="Enter Discount Value"
                      variant="outlined"
                    />
                  </div>
                </div>

                <div className="add_product_label_input">
                  <label htmlFor=""> Description </label>
                  <TextField
                    multiline
                    rows={10}
                    fullWidth
                    className="product_form_input"
                    name="description"
                    value={productData?.description}
                    onChange={handleChange}
                    id="outlined-basic"
                    placeholder=" Add Description "
                    variant="outlined"
                  />
                </div>

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

export default AddCoupons;
