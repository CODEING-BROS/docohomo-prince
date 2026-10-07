import PostCardFive from "../../Post/PostCardFive";
import SectionTitleOne from "../../Sections/SectionTitle/SectionTitleOne";

export default function BlogThree({ data }) {
  return (
    <div className="blog-three">
      <div className="container">
        <SectionTitleOne titleSize={36 / 16 + "em"} align="center">
          Tips & Tricks
        </SectionTitleOne>
        <div className="row">
          {data.map((item, index) => (
            <div key={index} className="col-12 col-md-6">
              <PostCardFive data={item} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
