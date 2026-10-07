import Link from "next/link";


export default function PostCardTwo({ data }) {
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
    <div className="post-card-two">
      <div className="post-card-two__image">
        <img src={data.blog_image?.image_url} alt={data.blog_title} />
        <div className="post-card-two__info">
          <div className="post-card-two__info__date">
            <h5>{convertDate(data?.createdAt) }</h5>
            <p> {convertMonth(data?.createdAt)}</p>
          </div>
          <div className="post-card-two__info__detail" style={{fontSize:12}} >
            {/* <p> */}
         
            {/* </p> */}

              {/* <a>{data.category}</a> */}
              {/* by <span >Lifeantidote.com</span> */}

          </div>
        </div>
      </div>
      <div className="post-card-two__content">
        <Link
          href={process.env.PUBLIC_URL + "/blog/post/[slug]"}
          as={process.env.PUBLIC_URL + "/blog/post/" + data.blog_slug}
        >
          <a>{data.blog_title}</a>
        </Link>
        
      </div>
    </div>
  );
}
