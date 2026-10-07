import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import { useForm } from "react-hook-form";
import Review from "../../Control/Review";
import { useState, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/router";
import { toast } from "react-toastify";
import { baseUrl } from "../../../../config";
import { useSelector } from "react-redux";
import parse from "html-react-parser";
import Rating from "@mui/material/Rating";
import { Box, IconButton, TextField } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";

export default function ProductDetailInfoTab({ original, data }) {
  console.log("orignal", original);
  const [value, setValue] = React.useState(0);
  const [hover, setHover] = React.useState(-1);
  const { register, handleSubmit, errors, reset } = useForm();
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [desc, setDesc] = useState("");
  const isAuthenticated = useSelector(
    (state) => state.userReducer.isAuthenticated
  );
  const userdata = useSelector((state) => state.userReducer);
  console.log("userdata", userdata);
  const router = useRouter();
  const slug = data.productID;
  const [show, setShow] = useState(false);
  const [reviewid, setReviewid] = useState("");

  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const labels = {
    1: "1",
    2: "2",
    3: "3",
    4: "4",
    5: "5",
  };
  function getLabelText(value) {
    return `${value} Star${value !== 1 ? "s" : ""}, ${labels[value]}`;
  }

  // Add a useEffect hook to watch for changes in the reviewSubmitted state
  useEffect(() => {
    // You can perform any actions here that you want to happen
    // when a review is submitted successfully, such as fetching
    // updated data or refreshing the component's content.
    // For example, you can fetch updated reviews.

    // In this example, I'm just logging a message to the console.
    if (reviewSubmitted) {
      console.log("Review submitted successfully. Triggering a re-render.");
    }
  }, [reviewSubmitted]);

  // Function to toggle show/hide full description
  const toggleDescription = () => {
    setShowFullDescription(!showFullDescription);
  };

  const truncatedDescription = showFullDescription
    ? data?.description // Show full description if showFullDescription is true
    : data?.description?.slice(0, 200); // Show the first 200 characters if showFullDescription is false

  const onEditReview = async (formData) => {
    const { desc } = formData;

    try {
      const response = await axios.put(
        `${baseUrl}/api/product/edit-review`, // Update with your API endpoint
        { desc: desc, productId: slug, reviewId: reviewid, rating: value }, // Send review data to the server
        {
          withCredentials: true,
        }
      );

      // Handle a successful review submission here, e.g., show a success message or refresh the review section
      console.log(response.data.message);
      setReviewSubmitted(!reviewSubmitted);
      toast.success(response.data.message);
      window.location.reload();
      // Reset the form after submission
      reset();
    } catch (error) {
      // Handle errors, e.g., display an error message to the user
      console.error("Error submitting review:", error);
      toast.error(error);
    }
  };

  const onSubmitReview = async (formData) => {
    const { message, rating } = formData;

    try {
      const response = await axios.post(
        `${baseUrl}/api/product/add-review/${slug}`, // Update with your API endpoint
        { desc: message, rating: value,username:userdata?.user?.user?.username,userid:userdata?.user?.user?.user_id}, // Send review data to the server
        {
          withCredentials: true,
        }
      );

      // Handle a successful review submission here, e.g., show a success message or refresh the review section
      console.log(response.data.message);
      setReviewSubmitted(!reviewSubmitted);
      toast.success(response.data.message);
      window.location.reload();
      // Reset the form after submission
      reset();
    } catch (error) {
      // Handle errors, e.g., display an error message to the user
      console.error("Error submitting review:", error);
      toast.error(error);
    }
  };
  console.log("dataproduct", data);
  return (
    <div className="product-detail__tab">
      <Tabs className="product-detail__tab__content">
        <TabList className="tab__content__header">
          <Tab>Description</Tab>
          {/* <Tab>Shipping & Returns</Tab> */}
          <Tab>Reviews</Tab>
        </TabList>

        <TabPanel className="tab__content__item -description">
          <p>
            <div>{parse(truncatedDescription)}</div>
            {/* Show "show more" link if the description is longer than 200 characters */}
            {data?.description?.length > 200 && (
              <button
                style={{
                  border: "none",
                  background: "none",
                  color: "green",
                }}
                onClick={toggleDescription}
              >
                {showFullDescription ? "Show Less" : "Show More"}
              </button>
            )}
          </p>
        </TabPanel>

        <TabPanel className="tab__content__item -review">
        {!isAuthenticated ? (
            <>
              <span
                style={{
                  fontWeight: "bold",
                  color: "red",
                }}
              >
                To review a product please login...
              </span>
            </>
          ) : (
            <>
              {show ? (
                <>
                  <form
                    onSubmit={handleSubmit(onEditReview)}
                    style={{ marginTop: "20px" }}
                  >
                    <h5 className="ratingheader">Rate the Product</h5>
                    <div className="col-12 ratingarrange">
                      <Rating
                        name="hover-feedback"
                        value={value}
                        precision={1}
                        size="large"
                        // getLabelText={getLabelText}
                        onChange={(event, newValue) => {
                          setValue(newValue);
                        }}
                        onChangeActive={(event, newHover) => {
                          setHover(newHover);
                        }}
                        emptyIcon={
                          <StarIcon
                            style={{ opacity: 0.55 }}
                            fontSize="inherit"
                          />
                        }
                      />
                      {/* <div className="ratingnum">
                        {" "}
                        {value !== null && (
                          <Box sx={{ ml: 2 }}>
                            {labels[hover !== -1 ? hover : value]}/5
                          </Box>
                        )}
                      </div> */}
                    </div>
                    <h5>Edit your review</h5>
                    <div className="col-12">
                      <div className="input-validator">
                        <textarea
                          name="desc"
                          placeholder="description"
                          rows="5"
                          value={desc || ""}
                          onChange={(e) => {
                            setDesc(e.target.value);
                          }}
                          required
                          ref={register({
                            required: "Review message is required",
                          })}
                        />
                      </div>
                      {errors.message && (
                        <span className="input-error">
                          {errors.message.message}
                        </span>
                      )}
                    </div>
                    <div className="col-12">
                      <button className="btn -dark" type="submit">
                        submit
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <form onSubmit={handleSubmit(onSubmitReview)}>
                  <h5 className="ratingheader">Rate the Product</h5>
                  <div className=" ratingarrange">
                    <Rating
                      name="hover-feedback"
                      value={value}
                      precision={1}
                      size="large"
                      getLabelText={getLabelText}
                      onChange={(event, newValue) => {
                        setValue(newValue);
                      }}
                      onChangeActive={(event, newHover) => {
                        setHover(newHover);
                      }}
                      emptyIcon={
                        <StarIcon
                          style={{ opacity: 0.55 }}
                          fontSize="inherit"
                        />
                      }
                    />
                    {/* <div className="ratingnum">
                      {" "}
                      {value !== null && (
                        <Box sx={{ ml: 2 }}>
                          {labels[hover !== -1 ? hover : value]}/5
                        </Box>
                      )}
                    </div> */}
                  </div>
                  <h5 className="ratingheader">Write a review</h5>
                  <div className="">
                    <div className="input-validator">
                      <textarea
                        name="message"
                        placeholder="Message"
                        rows="5"
                        required
                        ref={register({
                          required: "Review message is required",
                        })}
                      />
                    </div>
                    {errors.message && (
                      <span className="input-error">
                        {errors.message.message}
                      </span>
                    )}
                  </div>
                  {/* <div className="input-validator">
              <input
                type="number"
                name="rating"
                placeholder="Rating (1-5)"
                ref={register({
                  required: "Rating is required",
                  min: { value: 1, message: "Rating must be at least 1" },
                  max: { value: 5, message: "Rating must be at most 5" },
                })}
              />
            </div>
            {errors.rating && (
              <span className="input-error">{errors.rating.message}</span>
            )} */}
                  <div className="">
                    <button className="btn -dark" type="submit">
                      Write a review
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          <div className="row">

          {original?.review?.map((item) => {

            return (
              <>
                <div className="allcard_rating col-12 col-md-6">
                  <div className="ratingcard">
                    <div className="leftright_start">
                      <div className="left_right">
                        <div className="rightside">
                          <div
                            className="img mb-0 w-25"
                            style={{
                              borderRadius: "50px",
                              maxWidth: "60px",
                              overflow: "hidden",
                            }}
                          >
                            <img className="m-0 w-100" src="/userimg.png" />
                          </div>
                          <div className="nameanddate">
                            <div className="username">
                              <p>
                                <b>{item?.username}</b>
                              </p>
                            </div>
                            <div className="dateandstart">
                              <div className="userdate">
                                <p>{item?.createdAt}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="startab">
                        <Rating
                          name="read-only"
                          value={item?.rating}
                          readOnly
                          size={"23"}
                        />
                      </div>
                    </div>
                    <div className="centerline"></div>
                    <div className="detailsreview">
                      <p>{item?.desc}</p>
                    </div>
                  </div>
                </div>
                {/* <Review
                  //avatar="https://i1.wp.com/metro.co.uk/wp-content/uploads/2020/03/GettyImages-1211127989.jpg?quality=90&strip=all&zoom=1&resize=644%2C416&ssl=1"
                  name={item?.username}
                  publicDate={item?.createdAt}
                  // rate={item?.rating}
                  productID={slug}
                  id={item?._id}
                  user={item?.userID}
                  show={show}
                  setShow={setShow}
                  desc={desc}
                  setDesc={setDesc}
                  reviewid={reviewid}
                  setReviewid={setReviewid}
                >
                  {item?.desc}
                </Review> */}
              </>
            );
          })}
        </div>
        </TabPanel>
      </Tabs>
    </div>
  );
}

{
  /* <TabPanel className="tab__content__item -ship">
          <h5>
            <span>Ship to </span>New York
          </h5>
          <ul>
            <li>
              Standard Shipping on order over 0kg - 5kg. <span>+10.00</span>
            </li>
            <li>
              Heavy Goods Shipping on oder over 5kg-10kg . <span>+20.00</span>
            </li>
          </ul>
          <h5>Delivery & returns</h5>
          <p>
            We diliver to over 100 countries around the word. For full details
            of the delivery options we offer, please view our Delivery
            information.
          </p>
        </TabPanel> */
}
