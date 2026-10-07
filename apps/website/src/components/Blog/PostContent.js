import Link from "next/link";
import { useForm } from "react-hook-form";
import Lightbox from "react-image-lightbox";

import { convertToSlug } from "../../common/utils";
import SocialIcons from "../Other/SocialIcons";
import Button from "../Control/Button";
import ImageLightbox from "../Control/ImageLightbox";
import ReactHtmlParser from "react-html-parser";

export default function PostContent({ data, children }) {
  // const { register, handleSubmit, errors } = useForm();
  // const onSearchSubmit = (data) => console.log(data);
  const convertDate = (dateData)=>{
    let newDate=  new Date(dateData)
    return newDate?.getDate()
  }
  const convertMonth = (dateData)=>{
    let newDate=  new Date(dateData)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

    return monthNames[newDate?.getMonth()]
  }


  return (
    <div className="post-content">
      <div className="post-content__header">
        <div className="post-content__header__date">
        <h5>{convertDate(data?.createdAt) }</h5>
            <p> {convertMonth(data?.createdAt)}</p>
        </div>
        <div className="post-content__header__content">
          <div className="post_content__info">
            <p>
            by <span>{data?.blog_author}</span>
            </p>
           
          </div>
          <h1 style={{color: '#111',
    fontSize: '1.875em',
    fontWeight: 500,
    lineHeight: '1.3em'}} >{data.blog_title}</h1>
        </div>
      </div>
      <div className="post-content__body">
        {/* <p className="post-paragraph"> */}
          
         {/* {data?.about_blog} */}
         {ReactHtmlParser(data?.about_blog)}
        {/* </p> */}
        {data?.blog_sub_headings?.map((value,index)=>(
         <div key={index} >
            <div className="post-paragraph">
              
           <p className="blog_sub_heading" >{value?.sub_head_title} </p>
         </div>
          <p className="post-paragraph">
          {/* {value?.sub_head_description} */}
          {ReactHtmlParser(value?.sub_head_description)}
        </p>
         </div>
        ))}
       
        {/* <p className="post-paragraph">
          <span>Eat healthy – </span>
          ‘you are what you eat’. It’s as simple as it sounds. All that caffeine
          that you think your body yearns to keep you awake is eventually going
          to take a bad toll on your skin. In fact, whatever you eat has a
          direct impact on your skin.
        </p> */}
        {/* <ImageLightbox
          className="post-image"
          alt="post image"
          imgSrc={"/assets/images/blog/post_img.png"}
        /> */}
      </div>

      {/* <div className="post-content__footer">
        <div className="post-content__footer__tags">
          <span>Tag:</span>
          {data.tags &&
            data.tags.map((tag, index) => (
              <Button key={index} action="#" color="light" content={tag} />
            ))}
        </div>
        <div className="post-content__footer__share">
          <span>Share:</span>
          <SocialIcons colored />
        </div>
      </div> */}

      {/* <div className="post-content__actions">
        <div className="post-content__actions__change">
          <Link href="#">
            <a className="change-post-btn -prev">
              <i className="fas fa-angle-left"></i>Prev Posts
            </a>
          </Link>
          <Link href="#">
            <a className="change-post-btn -next">
              Next Posts
              <i className="fas fa-angle-right"></i>
            </a>
          </Link>
        </div>
        <div className="post-content__actions__comment">
          <form onSubmit={handleSubmit(onSearchSubmit)}>
            <h5>Leave a comment</h5>
            <div className="row">
              <div className="col-12 col-md-4">
                <div className="input-validator">
                  <input
                    type="text"
                    name="name"
                    placeholder="Name"
                    ref={register({ required: true })}
                  />
                  {errors.name && (
                    <span className="input-error">Pleave provide a name</span>
                  )}
                </div>
              </div>
              <div className="col-12 col-md-4">
                <div className="input-validator">
                  <input
                    type="text"
                    name="email"
                    placeholder="Email"
                    ref={register({ required: true })}
                  />
                  {errors.email && (
                    <span className="input-error">Pleave provide an email</span>
                  )}
                </div>
              </div>
              <div className="col-12 col-md-4">
                <div className="input-validator">
                  <input
                    type="text"
                    name="website"
                    placeholder="Website"
                    ref={register({ required: true })}
                  />
                  {errors.website && (
                    <span className="input-error">
                      Pleave provide a website
                    </span>
                  )}
                </div>
              </div>
              <div className="col-12">
                <div className="input-validator">
                  <textarea
                    name="comment"
                    placeholder="Comment"
                    rows="5"
                    ref={register({ required: true })}
                  />
                  {errors.comment && (
                    <span className="input-error">
                      Pleave leave us a comment
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button className="btn -red">Submit comment</button>
          </form>
        </div>
      </div> */}

    </div>
  );
}
