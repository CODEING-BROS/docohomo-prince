import SectionTitleOne from "../SectionTitle/SectionTitleOne";
import PostCardOne from "../../Post/PostCardOne";

export default function BlogOne({ data }) {
  return (
    <div className="blog-one">
      <div className="container">
        <SectionTitleOne align="center">Beautilicious blog</SectionTitleOne>
        <div className="blog-one__content">
          {data.map((item, index) => (
            <div key={index} className="blog-one__content__item">
              <PostCardOne data={item} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
