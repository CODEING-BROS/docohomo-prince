import PostCardTwo from "../Post/PostCardTwo";
import PostCardFeatured from "../Post/PostCardFeatured";

export default function BlogContent({ offset, search, data }) {
  const pageLimit = 7;
  return (
    <div className="blog-content">
      {search && (
        <h3 className="search-result">
          Searching for <span>"{search}"</span> keyword
        </h3>
      )}
      {search
        ? data && (
            <div className="row">
              {data.slice(offset, offset + pageLimit).map((item, index) => (
                <div key={index} className="col-12 col-md-6">
                  <PostCardTwo data={item} />
                </div>
              ))}
            </div>
          )
        : data && (
            <div className="row">
              {offset === 0
                ? data.slice(offset, offset + pageLimit).map((item, index) => {
                    if (index === 0) {
                      return (
                        <div key={index} className="col-12">
                          <PostCardFeatured data={item} />
                        </div>
                      );
                    }
                    return (
                      <div key={index} className="col-12 col-md-6">
                        <PostCardTwo data={item} />
                      </div>
                    );
                  })
                : data.slice(offset, offset + pageLimit).map((item, index) => {
                    return (
                      <div key={index} className="col-12 col-md-6">
                        <PostCardTwo data={item} />
                      </div>
                    );
                  })}
            </div>
          )}
    </div>
  );
}
