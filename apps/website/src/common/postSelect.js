//get post
export const getPosts = (posts, category, limit) => {
  const finalPosts = category
    ? posts.filter(
        (post) => post.category.toLowerCase() === category.toLowerCase()
      )
    : products;

  return (
    finalProducts &&
    finalProducts.slice(0, limit ? limit : finalProducts.length)
  );
};

//get category quantity
export const getCategoryQuantity = (posts, category) => {
  return category
    ? posts.filter(
        (post) => post.category.toLowerCase() === category.toLowerCase()
      ).length
    : 0;
};

//get post by slug
export const getPostBySlug = (posts, slug) => {
  return slug
    ? posts.find((post) => post.slug.toLowerCase() === slug.toLowerCase())
    : null;
};

//get post by keyword
export const getPostByKeyword = (posts, keyword) => {
  return keyword
    ? posts.filter((post) => post.title.toLowerCase().includes(keyword))
    : posts;
};
