import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { CSSTransition } from "react-transition-group";
import { useForm } from "react-hook-form";
import outsideClickHandle from "../../../common/ElementOutsideClick";
import { baseUrl } from "../../../../config";
import axios from "axios";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { addToCart } from "../../../redux/actions/cartActions";
// import '../../../styles/layouts/_search_box.scss'

export default function SearchBox({ showSearch, setShowSearch }) {
  const { register, handleSubmit } = useForm();
  const wrapperRef = useRef(null);
  const [text, setText] = useState("");
  const [searchProduct, setSerchProduct] = useState([])
  const router = useRouter()
  const dispatch = useDispatch();
  const cartState = useSelector((state) => state.cartReducer);
  const checkProductInCart = (pid) => {
    return cartState.find((item) => item.id === pid);
  };
  const addToCartHandle = (data) => {
    let productItem = checkProductInCart(data.product_id);
    if (!productItem) {
      const cartData = {
        productID: data._id,
        id: data.product_id,
        category: data.product_main_category,
        name: data.product_name,
        rate: 4,
        regular_price: data.product_regular_price,
        price: data.product_sale_price,
        new: data.new_arrival,
        brand: "",
        code: data.product_code,
        point: 0,
        quantity: data.quantity,
        variation: [],
        thumbImage: data.product_images,
        images: data.product_images,
        description: data.product_description,
        slug: data.product_slug,
        min_order_quantity: data.min_order_quantity,
        max_order_quantity: data.max_order_quantity
      };
      dispatch(addToCart(cartData));
      return toast.success("Product added to cart!");
    }
    else{
      return toast.error("Product already in cart!");
    }
  };

  const getProduct = async ()=>{
    const url = `${baseUrl}/api/search/in/products?page=1&size=12&search=${text}`;
    const res = await axios.get(url, { withCredentials: true });
    setSerchProduct(res.data?.result);
  }

  useEffect(()=>{
    let debounceTimer;

    if (text) {
      debounceTimer = setTimeout(() => {
        getProduct();
      }, 300);
    } else {
      setSerchProduct([]);
    }

    return () => {
      clearTimeout(debounceTimer);
    };
  },[text])

  outsideClickHandle(wrapperRef, () => {
    setShowSearch(false);
  });
  function onSubmit(data) {
    console.log(data);
    window.location.replace(`/search/${text}`)
  }

  function handleChange(e){
    setText(e.target.value)
  }
  const handleClick = (name,id)=>{
    router.push(`/product/${name.trim().replaceAll(" ","-")}/${id}`)
  }

  return (
    <CSSTransition
      in={showSearch}
      unmountOnExit
      timeout={100}
      classNames="search-box"
    >
      <div ref={wrapperRef} className="search-box">
        <form onSubmit={handleSubmit(onSubmit)}>
          <input
            type="text"
            placeholder="What are you looking for?"
            name="search"
            value={text}
            // ref={register}
            onChange={handleChange}
            autocomplete="off"
          />
          <button>
            <img
              src="/assets/images/header/search-icon.png"
              alt="Search icon"
            />
          </button>
        </form>
        {searchProduct.length>0 && <div className="search-product">
          <div className="heading">Products</div>
          <ul className="border">
            {
              searchProduct.map((data,index)=>(
                <li key={index}
                // onClick={()=>handleClick(data._id)}
                >
                  <div className="row m-0">
                    <div className="ribbon-1 text-right">
                      {(
                        ((data.product_regular_price - data.product_sale_price) /
                          data.product_regular_price) *
                        100
                      ).toFixed(0)}
                      %
                      <br />
                      OFF
                    </div>
                    <div className="content" onClick={()=>handleClick(data.product_name,data._id)}>
                      <div>
                        <img src={data.product_images[0]?.image_url} alt={data.product_images[0]?.image_name} width="50px" height="50px" />
                      </div>
                      <div className="p-0">
                        <div className="product-name">{data.product_name}</div>
                        <div><span>{data.product_sale_price}</span> <del>{data.product_regular_price}</del></div>
                      </div>
                    </div>
                    {data.quantity>0&&<div className="addCart">
                      <div className="addCartbtn" onClick={()=>addToCartHandle(data)}>
                        <span>&#43;</span>
                      </div>
                    </div>}
                  </div>
                </li>
              ))
            }
          </ul>
        </div>}
      </div>
    </CSSTransition>
  );
}
