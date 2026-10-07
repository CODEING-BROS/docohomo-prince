import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import DoubleArrowIcon from "@mui/icons-material/DoubleArrow";
import {
  Toolbar,
  TextField,
  Container,
  FormControl,
  Tooltip,
  Menu,
  MenuItem,
  IconButton,
  Typography,
  Button,
  ListItemIcon,
  ListItemText,
  OutlinedInput,
  InputAdornment,
  colors,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import PhotoCamera from "@mui/icons-material/PhotoCamera";
import DateRangeIcon from "@mui/icons-material/DateRange";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import Box from "@mui/material/Box";
import PropTypes from "prop-types";
import { visuallyHidden } from "@mui/utils";
import { alpha } from "@mui/material/styles";
import { addDays } from "date-fns";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import Paper from "@mui/material/Paper";
import Checkbox from "@mui/material/Checkbox";
import LoadingSpinner from "../../../components/Spinner";
import CloseIcon from "@mui/icons-material/Close";
import Iconify from "../../../components/Iconify";
import ReorderIcon from "@mui/icons-material/Reorder";
import { convertDateForOrder } from "../../../global/globalFunctions";
import noImage from "../../../assests/No_image.svg";
import Divider from "@mui/material/Divider";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import palette from "../../../theme/palette";
import ConfimModal from "../../../global/Modals/ConfimModal";
import CustomizedSnackbars from "../../../global/Snackbar/CustomSnackbar";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AppRegistrationIcon from "@mui/icons-material/AppRegistration";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { DateRangePicker } from "react-date-range";
import searchNotFound from "../../../assests/searchnotfound.gif";
import CsvDownloadButton from "react-json-to-csv";
import emailjs from "@emailjs/browser";
import { config } from "src/global/globalConfig";

function createData(name, calories, fat, carbs, protein, amount, status) {
  return {
    name,
    calories,
    fat,
    carbs,
    protein,
    amount,
    status,
  };
}

const rows = [
  createData("Cupcake", 305, 3.7, 67, "COD", 40, "pending"),
  createData("Donut", 452, 25.0, 51, "COD", 100, "cancel"),
  createData("Eclair", 262, 16.0, 24, "COD", 100, "delivered"),
  createData("Frozen yoghurt", 159, 6.0, 24, "COD", 100, "delivered"),
  createData("Gingerbread", 356, 16.0, 49, "COD", 10, "pending"),
  createData("Honeycomb", 408, 3.2, 87, "COD", 100, "pending"),
  createData("Ice cream sandwich", 237, 9.0, 37, "COD", 100, "pending"),
  createData("Jelly Bean", 375, 0.0, 94, "COD", 100, "processing"),
  createData("KitKat", 518, 26.0, 65, "COD", 20, "processing"),
  createData("Lollipop", 392, 0.2, 98, "COD", 100, "processing"),
  createData("Marshmallow", 318, 0, 81, "COD", 100, "pending"),
  createData("Nougat", 360, 19.0, 9, "COD", 100, "cancel"),
  createData("Oreo", 437, 18.0, 63, "COD", 100, "cancel"),
];

function descendingComparator(a, b, orderBy) {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
    return 1;
  }
  return 0;
}

function getComparator(order, orderBy) {
  return order === "desc"
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

// This method is created for cross-browser compatibility, if you don't
// need to support IE11, you can use Array.prototype.sort() directly
function stableSort(array, comparator) {
  const stabilizedThis = array?.map((el, index) => [el, index]);
  stabilizedThis?.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) {
      return order;
    }
    return a[1] - b[1];
  });
  return stabilizedThis?.map((el) => el[0]);
}

const headCells = [
  {
    id: "product",
    numeric: false,
    disablePadding: true,
    label: "Product",
  },
  {
    id: "Product Code",
    numeric: true,
    disablePadding: false,
    label: "Product Code",
  },
  {
    id: "price",
    numeric: true,
    disablePadding: false,
    label: "Price",
  },
  {
    id: "quantity",
    numeric: true,
    disablePadding: false,
    label: "Quantity",
  },
  // {
  //   id: 'status',
  //   numeric: true,
  //   disablePadding: false,
  //   label: 'Status',
  // },
  {
    id: "amount",
    numeric: true,
    disablePadding: false,
    label: "Amount",
  },
];

function EnhancedTableHead(props) {
  const {
    onSelectAllClick,
    order,
    orderBy,
    numSelected,
    rowCount,
    onRequestSort,
  } = props;
  const createSortHandler = (property) => (event) => {
    onRequestSort(event, property);
  };

  return (
    <TableHead>
      <TableRow>
        <TableCell padding="checkbox">
          <Checkbox
            color="primary"
            indeterminate={numSelected > 0 && numSelected < rowCount}
            checked={rowCount > 0 && numSelected === rowCount}
            onChange={onSelectAllClick}
            inputProps={{
              "aria-label": "select all desserts",
            }}
          />
        </TableCell>
        {headCells.map((headCell) => (
          <TableCell
            key={headCell.id}
            align={headCell.numeric ? "center" : "left"}
            padding={headCell.disablePadding ? "none" : "none"}
            sortDirection={orderBy === headCell.id ? order : false}
            sx={{ textTransform: "uppercase" }}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : "asc"}
              onClick={createSortHandler(headCell.id)}
            >
              {headCell.label}
              {orderBy === headCell.id ? (
                <Box component="span" sx={visuallyHidden}>
                  {order === "desc" ? "sorted descending" : "sorted ascending"}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}

EnhancedTableHead.propTypes = {
  numSelected: PropTypes.number.isRequired,
  onRequestSort: PropTypes.func.isRequired,
  onSelectAllClick: PropTypes.func.isRequired,
  order: PropTypes.oneOf(["asc", "desc"]).isRequired,
  orderBy: PropTypes.string.isRequired,
  rowCount: PropTypes.number.isRequired,
};

const EnhancedTableToolbar = (props) => {
  const { numSelected, handleChangeProductDelivery } = props;
  const ref = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const ref2 = useRef(null);
  const [isOpen2, setIsOpen2] = useState(false);

  return (
    <Toolbar
      sx={{
        pl: { sm: 2 },
        pr: { xs: 1, sm: 1 },
        ...(numSelected > 0 && {
          bgcolor: (theme) =>
            alpha(
              theme.palette.primary.main,
              theme.palette.action.activatedOpacity
            ),
        }),
      }}
    >
      {numSelected > 0 ? (
        <Typography
          sx={{ flex: "1 1 100%" }}
          color="inherit"
          variant="subtitle1"
          component="div"
        >
          {numSelected} selected
        </Typography>
      ) : (
        <Typography
          sx={{ flex: "1 1 100%" }}
          variant="h6"
          id="tableTitle"
          component="div"
        >
          {`All Ordered Products (${props.orderCount})`}
        </Typography>
      )}

      <Tooltip title="Filter list">
        <>
          {numSelected > 0 && (
            <>
              <IconButton>
                <MoreVertOutlinedIcon
                  style={{ cursor: "pointer" }}
                  ref={ref2}
                  onClick={() => setIsOpen2(true)}
                  fontSize="medium"
                />
                <Menu
                  open={isOpen2}
                  anchorEl={ref2.current}
                  onClose={() => setIsOpen2(false)}
                  PaperProps={{
                    sx: { width: 230, maxWidth: "100%" },
                  }}
                  anchorOrigin={{ vertical: "top", horizontal: "right" }}
                  transformOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <MenuItem
                    onClick={() => handleChangeProductDelivery(true)}
                    sx={{ color: "text.secondary" }}
                  >
                    <ListItemIcon>
                      <Iconify icon="mdi:truck-check" width={24} height={24} />
                    </ListItemIcon>
                    <ListItemText
                      primary="Marked as Shipped"
                      primaryTypographyProps={{ variant: "body2" }}
                    />
                  </MenuItem>
                  <MenuItem
                    onClick={() => handleChangeProductDelivery(false)}
                    sx={{ color: "text.secondary" }}
                  >
                    <ListItemIcon>
                      <Iconify
                        icon="mdi:truck-remove-outline"
                        width={24}
                        height={24}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary="Un-Marked as Shipped"
                      primaryTypographyProps={{ variant: "body2" }}
                    />
                  </MenuItem>
                </Menu>
              </IconButton>
            </>
          )}
        </>
      </Tooltip>
    </Toolbar>
  );
};

EnhancedTableToolbar.propTypes = {
  numSelected: PropTypes.number.isRequired,
};

function ViewOrder({ handleClose, orderId }) {
  const [render, setRender] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [openConfimModal, setOpenConfimModal] = useState(false);
  const [userData, setUserData] = useState([]);
  const [message, setMessage] = useState({ type: "", message: "" });
  const [orderDetail, setOrderDetail] = useState({});
  const [orderStatus, setOrderStatus] = useState([]);
  const [updateBtn, setUpdateBtn] = useState(false);
  const [order, setOrder] = React.useState("asc");
  const [orderBy, setOrderBy] = React.useState("calories");
  const [selected, setSelected] = React.useState({});
  const [selectedLength, setSelectedLength] = React.useState({});
  const [page, setPage] = React.useState(0);
  const [filterName, setFilterName] = useState("");
  const [dense, setDense] = React.useState(false);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [ordersCount, setOrdersCount] = useState(0);
  const [shippedProductsCount, setShippedProductsCount] = useState(0);
  const [allOrders, setAllOrders] = useState();
  const [cancleAmount, setCancleAmount] = useState();
  const [filters, setFilters] = useState({
    by_status: "all",
    recentDays: "All",
  });
  const [age, setAge] = React.useState("");
  const [stateDate, setStateDate] = useState([
    {
      startDate: new Date(),
      endDate: addDays(new Date(), 7),
      startDate: "",
      endDate: "",
      key: "selection",
    },
  ]);
  const [anchorEl, setAnchorEl] = React.useState(null);
  const open = Boolean(anchorEl);
  const handleClickMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  console.log("shippedProductsCount = = =>", shippedProductsCount);
  // console.log("selected = = =>",selected)
  // console.log("orderId",orderId)
  // console.log("USER DATA",orderDetail)

  //##################### GET ORDER BY ID #####################
  useEffect(() => {
    setLoading(true);
    axios
      .get(
        `${process.env.REACT_APP_BACKEND_URL}/api/get/order/by/id/${orderId}`,
        { withCredentials: true }
      )
      .then((res) => {
        console.log(res);
        setOrderDetail(res?.data?.result);
        setOrderStatus(res?.data?.order_status);
        setOrdersCount(res?.data?.result?.products?.length);
        setLoading(false);
      })
      .catch((err) => {
        console.log(err);
        setLoading(false);
      });
  }, [render]);
  //##################### GET ORDER BY ID #####################

  //##################### Handle order status change #####################
  const handleOrderStatusChange = (e) => {
    setOrderDetail((prev) => ({ ...prev, order_status: e.target.value }));
    setUpdateBtn(true);
  };

  const sendEmailWhenOrderPartialShipped = (emailOrderDetail) => {
    console.log("emailOrderDetail", emailOrderDetail);

    emailjs
      .send(
        process.env.REACT_APP_EMAILJS_SERVICE_ID,
        process.env.REACT_APP_EMAILJS_TEMPLATE_ID,
        {
          order_id: emailOrderDetail.order_id,
          shipped_product_count: shippedProductsCount,
          name: emailOrderDetail.customer_name,
          email: emailOrderDetail.customer_email,
        },
        process.env.REACT_APP_EMAILJS_PUBLIC_KEY
      )
      .then(
        (result) => {
          console.log(result.text);
          console.log("EMAIL SENT++++++ ");
        },
        (error) => {
          console.log(error.text);
          console.log("EMAIL SENT++++++ ERROR ");
        }
      );
  };

  //##################### Handle submit  #####################

  const handleSubmit = async (e) => {
        if (
      shippedProductsCount > 0 &&
      orderDetail?.order_status === "partial shipped"
    ) {
      sendEmailWhenOrderPartialShipped(orderDetail);
    }
    await axios
      .patch(
        `${process.env.REACT_APP_BACKEND_URL}/api/change/order/status/${orderId}`,
        { ...orderDetail, total_amount: cancleAmount },
        { withCredentials: true }
      )
      .then((res) => {
        console.log(res);
        if (res?.data?.status === true) {
          setMessage((prev) => ({
            ...prev,
            type: "success",
            message: "Order Status Updated Successfully !!",
          }));
          setSnackbarOpen(true);
          setRender((prev) => !prev);
        } else {
          setMessage((prev) => ({
            ...prev,
            type: "error",
            message: "Unexcepted Error Occur !!",
          }));
          setSnackbarOpen(true);
          setRender((prev) => !prev);
        }
      })
      .catch((err) => {
        console.log(err);
      });
  };

  //##################### Handle submit  #####################

  // ##################### SNACK BAR FUNCTIONs ##################
  const handleCloseSnackbar = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }

    setSnackbarOpen(false);
  };
  // ##################### SNACK BAR FUNCTIONs ##################

  const handleRequestSort = (event, property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleSelectAllClick = (event) => {
    if (event.target.checked) {
      const newSelecteds = orderDetail?.products?.map((n) => ({[n?._id]:true}));
      setSelected(newSelecteds);
      return;
    }
    setSelected({});
  };

  const handleClick = (event, name) => {
    setSelected({...selected,[name]:!selected[name]});
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleChangeDense = (event) => {
    setDense(event.target.checked);
  };

  const isSelected = (name) => selected[name] ? true: false;

  // Avoid a layout jump when reaching the last page with empty rows.
  const emptyRows =
    page > 0 ? Math.max(0, (1 + page) * rowsPerPage - rows.length) : 0;

  // DECREASE QUANTITY FUNCTION
  const decreaseQuantity = async (product_id) => {
    let updateProduct = orderDetail?.products;
    orderDetail?.products?.map((value, index) => {
      if (value._id == product_id) {
        if (value.product_quantity > 0) {
          // console.log("FIND>>>>")
          updateProduct[index] = {
            ...value,
            product_quantity: value.product_quantity - 1,
          };
          setOrderDetail((prev) => ({ ...prev, products: updateProduct }));
          console.log(updateProduct, "updated products quantity");
          setUpdateBtn(true);
        }
      }
    });
    return;
  };

  // INCREASE QUANTITY FUNCTION
  const increaseQuantity = async (product_id) => {
    let updateProduct = orderDetail?.products;
    orderDetail?.products?.map((value, index) => {
      if (value._id == product_id) {
        // console.log("FIND>>>>")
        updateProduct[index] = {
          ...value,
          product_quantity: value.product_quantity + 1,
        };
        setOrderDetail((prev) => ({ ...prev, products: updateProduct }));
        console.log(updateProduct, "updated products quantity");
        setUpdateBtn(true);
      }
    });
  };

  // handle transportion field
  const handleTransportDetails = async (e) => {
    setOrderDetail((prev) => ({
      ...prev,
      ordered_products_transport_detail: e.target.value,
    }));
    setUpdateBtn(true);
  };

  // handle change product delivery status
  const handleChangeProductDeliveryStatus = async (productStatus) => {
    let totalCancleAmount = 0;
    let updateProductStatus = orderDetail?.products?.map((value, index) => {
      let amount = parseInt(value.price) * parseInt(value.cartQuantity);
      if(selected[value._id]){
        if(!productStatus) totalCancleAmount += parseInt(amount);
        return{...value,product_delivery_status:productStatus}
      }else{
        if(productStatus) totalCancleAmount += parseInt(amount);
        return {...value,product_delivery_status:!productStatus}
      }
    })

    setCancleAmount(orderDetail.total_amount - totalCancleAmount);

    setUpdateBtn(true);
    setOrderDetail((prev) => ({
      ...prev,
      products: updateProductStatus,
    }));
  };

  useEffect(()=>{
      let count = 0;
      for(let key in selected)if(selected[key])count++;
      setSelectedLength(count);
  },[selected])

  return (
    <>
      <LoadingSpinner loading={loading} />
      {/* #################### SANCKBAR MESSAGE ######################## */}

      <CustomizedSnackbars
        onOpen={snackbarOpen}
        type={message?.type}
        handleClose={handleCloseSnackbar}
        message={message?.message}
      />

      {/* #################### SANCKBAR MESSAGE ######################## */}

      <div className="close_edit_Category ">
        <HighlightOffIcon
          style={{ color: palette.primary.main }}
          onKeyDown={handleClose}
          onClick={handleClose}
          fontSize="large"
        />
        {/* <HighlightOffIcon style={{color:palette.primary.main}}  fontSize='large' /> */}
      </div>
      <Container maxWidth="xl">
        <div className="add-category-pad-top-bot flex-justify-between ">
          <div>
            <h2>Order Details</h2>
            <p> View your order and change necessary information from here</p>
          </div>
          <CsvDownloadButton
            className="download-table-xls-button"
            data={[orderDetail]}
            filename="orders"
          >
            <Button
              className="hide-mobile"
              variant="outlined"
              startIcon={<Iconify icon="akar-icons:download" />}
            >
              Export
            </Button>
          </CsvDownloadButton>
        </div>
        <div>
          <div className="order-details-main">
            <div className="flex-justify-between">
              <div>
                <h4 className="flex">
                  {" "}
                  <DateRangeIcon /> "{" "}
                  {convertDateForOrder(orderDetail?.createdAt)}
                </h4>
                {/* <p style={{fontSize:13,color:'gray',paddingLeft:23}} > #{orderDetail?.order_id}</p> */}
                <p
                  style={{
                    fontSize: 13,
                    color: "gray",
                    fontWeight: "500",
                    paddingLeft: 23,
                  }}
                >
                  {" "}
                  Order-ID : #{orderDetail?.order_id}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "gray",
                    fontWeight: "500",
                    paddingLeft: 23,
                  }}
                >
                  {" "}
                  Payment-ID : {orderDetail?.tid}
                </p>
              </div>
              <div className="flex">
                {/* {orderDetail?.order_status} */}
                <div className="flex" style={{flexDirection:'column',paddingRight:10}} >
                <div className="flex" >
                  <p
                    style={{
                      color: "#1e1e1e",
                      fontSize: 22,
                      fontWeight: "600",
                    }}
                  >
                    {" "}
                    Order Total ={" "}
                  </p>
                  <p
                    style={{
                      color: palette.primary.main,
                      fontSize: 22,
                      paddingRight: 22,
                      paddingLeft: 8,
                      fontWeight: "600",
                    }}
                  >
                   ₹{" "}
                    {orderDetail?.total_amount}
                  </p>
                  </div>
                  <p
                    style={{
                      color: "#1e1e1e",
                      fontSize:'14px'
                    }}
                  >
                    {" "}
                    Including Delivery Charges of  {" "}
                   <span 
                   style={{ color: palette.primary.main,}}
                   >
                   ₹{" "}{orderDetail?.delivery_charges}
                   </span>
                  </p>
                </div>
               

                {/* <label htmlFor=""> Select Category  </label> */}
                <TextField
                  style={{
                    textTransform: "capitalize",
                    width: 240,
                    paddingRight: 10,
                  }}
                  labelId="demo-select-small"
                  id="demo-select-small"
                  className="select_field"
                  name="order_status"
                  value={`${orderDetail?.order_status}`}
                  onChange={(e) => handleOrderStatusChange(e)}
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
                  {orderStatus?.map((order, index) => (
                    <MenuItem
                      style={{ textTransform: "capitalize" }}
                      key={order?.name}
                      value={order?.name}
                    >
                      {order?.name}
                    </MenuItem>
                  ))}
                </TextField>

                <Button
                  disabled={updateBtn ? false : true}
                  sx={{ mx: 0, height: 54, px: 5 }}
                  variant="contained"
                  onClick={handleSubmit}
                >
                  Update
                </Button>
              </div>
            </div>
            <div style={{ padding: "30px 0px 20px 0px" }}>
              <Divider />
            </div>
            <div className="order-detail-table-container">
              <div style={{ width: 800 }}>
                <div className="customer-order-detail">
                  <div
                    style={{ display: "flex", justifyContent: "flex-start" }}
                  >
                    <AccountCircleIcon
                      style={{ color: palette.primary.main }}
                      fontSize="large"
                    />
                    <div style={{ paddingLeft: 8, paddingTop: 4 }}>
                      <h4 style={{ letterSpacing: 1 }}>Customer Details</h4>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: "500",
                          color: "gray",
                          overflow: "",
                        }}
                      >
                        {/* <p style={{fontSize:12}} >#{orderDetail?.customer_id}</p> */}
                        <p style={{ textTransform: "capitalize" }}>
                          Name : {orderDetail?.customer_name}
                        </p>
                        <p>Email : {orderDetail?.customer_email}</p>
                        <p>
                          Mobile-No : +91-{orderDetail?.customer_phone_number}
                        </p>
                        {/* <p>Transport Detail :  {orderDetail?.transport_detail}</p> */}
                        <p style={{ textTransform: "capitalize" }}>
                          Address : {orderDetail?.shipping_address} {","} {}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="customer-order-detail" style={{ width: "100%" }}>
                <EnhancedTableToolbar
                  orderCount={ordersCount}
                  numSelected={selectedLength}
                  handleChangeProductDelivery={
                    handleChangeProductDeliveryStatus
                  }
                />
                <TableContainer>
                  <Table
                    sx={{ minWidth: 800 }}
                    aria-labelledby="tableTitle"
                    size={dense ? "small" : "medium"}
                  >
                    <EnhancedTableHead
                      numSelected={selectedLength}
                      order={order}
                      orderBy={orderBy}
                      onSelectAllClick={handleSelectAllClick}
                      onRequestSort={handleRequestSort}
                      rowCount={orderDetail?.products?.length}
                    />
                    <TableBody>
                      {/* if you don't need to support IE11, you can replace the `stableSort` call with:
                 rows.slice().sort(getComparator(order, orderBy)) */}
                      {stableSort(
                        orderDetail?.products,
                        getComparator(order, orderBy)
                      )
                        ?.slice(
                          page * rowsPerPage,
                          page * rowsPerPage + rowsPerPage
                        )
                        ?.map((row, index) => {
                          const isItemSelected = isSelected(row?._id);
                          const labelId = `enhanced-table-checkbox-${index}`;

                          return (
                            <TableRow
                              hover
                              role="checkbox"
                              aria-checked={isItemSelected}
                              tabIndex={-1}
                              key={row?._id}
                              selected={isItemSelected}
                            >
                              <TableCell padding="checkbox">
                                <Checkbox
                                  color="primary"
                                  checked={isItemSelected}
                                  onClick={(event) =>
                                    handleClick(event, row._id)
                                  }
                                  inputProps={{
                                    "aria-labelledby": labelId,
                                  }}
                                />
                              </TableCell>
                              <TableCell
                                component="th"
                                id={labelId}
                                scope="row"
                                padding="2"
                                style={{
                                  textTransform: "capitalize",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                              >
                                {/* <img className='product-table-image' alt="product" src={row?.product_images[0]?.image_url ? `${row?.product_images[0]?.image_url}` :noImage } /> */}
                                <img
                                  className="product-table-image"
                                  alt="product"
                                  src={
                                    !row?.images[0]?.image_url
                                      ? row?.product_images[0]?.image_url
                                      : row?.images[0]?.image_url
                                  }
                                />
                                {!row?.product_name?.slice(0, 20)
                                  ? row?.name?.slice(0, 20)
                                  : row?.product_name?.slice(0, 20)}
                                {"..."}
                              </TableCell>
                              <TableCell align="center">
                                {!row.product_code
                                  ? row?.id
                                  : row?.product_code}
                              </TableCell>
                              <TableCell align="left">
                                <p
                                  style={{
                                    color: palette.primary.main,
                                    fontWeight: "600",
                                  }}
                                >
                                  {" "}
                                  ₹ {row?.price}
                                </p>
                              </TableCell>
                              {/* <TableCell align="right">{row.fat}</TableCell> */}
                              <TableCell align="center">
                                {/* <Button   variant="outline" sx={{px:2,mr:2}} onClick={()=>decreaseQuantity(row?._id)}   >
                      <Iconify icon="ic:round-minus" />
                      </Button> */}
                                {!row?.product_quantity
                                  ? row?.cartQuantity
                                  : row?.product_quantity}
                                {/* <Button   variant="outline" sx={{px:2,ml:2}} onClick={()=>increaseQuantity(row?._id)}   >
                        <Iconify icon="eva:plus-fill" />
                      </Button> */}
                              </TableCell>
                              {/* <TableCell align="center"  >
                      <p className={row?.product_quantity_by == 'cartoon' ? "order_delivered" : row?.product_quantity_by =='piece' ? 'order_pending': '' }  >
                          
                          {row?.product_quantity_by} 
                          </p>
                        </TableCell> */}
                              {/* {row?.product_delivery_status ? 
                        <TableCell align="center" sx={{fontSize:26,color:palette.primary.main}} > <Iconify   icon="mdi:truck-check" /> </TableCell>
                        :
                        <TableCell align="center" sx={{fontSize:26,color:'#e8e6e6'}} > <Iconify   icon="mdi:truck-check" /> </TableCell>  
                      } */}
                              <TableCell align="center">
                                <p
                                  style={{
                                    color: palette.primary.main,
                                    fontWeight: "600",
                                  }}
                                >
                                  {" "}
                                  ₹{" "}
                                  {!row?.product_quantity
                                    ? row?.cartQuantity * row?.price
                                    : row?.product_quantity * row?.price}{" "}
                                </p>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      {!orderDetail?.products?.length > 0 && (
                        <TableCell colSpan={9}>
                          {" "}
                          <div className="search-not-found">
                            <img
                              className="search-not-found-img"
                              src={searchNotFound}
                              alt="searchNotFound"
                            />
                            <Typography
                              variant="h6"
                              id="tableTitle"
                              component="div"
                            >
                              Products Not Found !!
                            </Typography>
                          </div>{" "}
                        </TableCell>
                      )}
                      {emptyRows > 0 && (
                        <TableRow
                          style={{
                            height: (dense ? 33 : 53) * emptyRows,
                          }}
                        >
                          <TableCell colSpan={6} />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
            </div>
          </div>
          <div style={{ paddingBottom: 70 }}></div>
        </div>
      </Container>
    </>
  );
}

export default ViewOrder;
