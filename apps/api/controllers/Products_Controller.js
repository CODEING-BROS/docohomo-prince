const Products_Schema = require("../modals/Products");
const Brands_Schema = require("../modals/Brands");
const product_status = require("../utils/configs/product_status");
const Utils = require("../utils/Utils");

// Add a review to a product
const addReview = async (req, res) => {
  const { productId } = req.params;
  const { jwt } = req.cookies;
  console.log("api called");
  try {
    // if (!jwt) {
    //   return res.send({ message: "Please login" });
    // }

    const { desc, rating, username, userid } = req.body;
    const userId = userid;
    // const userId = await Utils.verifying_Jwt(jwt, process.env.JWT_TOKEN_SECRET);
    const product = await Products_Schema.findById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const createdAt = new Date().toUTCString()?.slice(5, 16);
    const newReview = {
      userID: userId,
      username: username || "user",
      desc,
      rating,
      createdAt: createdAt,
    };

    product.review.push(newReview);
    await product.save();

    res.status(201).json({ message: "Review added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Delete a review from a product
const deleteReview = async (req, res) => {
  const { productId, reviewId } = req.params;

  try {
    const product = await Products_Schema.findById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const reviewIndex = product.review.findIndex(
      (review) => review._id.toString() === reviewId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({ error: "Review not found" });
    }

    product.review.splice(reviewIndex, 1);
    await product.save();

    res.status(200).json({ message: "Review deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Edit a review for a product
const editReview = async (req, res) => {
  const { productId, reviewId, desc } = req.body;

  try {
    const product = await Products_Schema.findById(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const review = product.review.id(reviewId);

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    review.desc = desc;
    // review.rating = rating;

    await product.save();

    res.status(200).json({ message: "Review edited successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// create new product

const createProducts = async (req, res) => {
  try {
    // const checkExisting = await Products_Schema.findOne({product_code:req.body.product_code})
    // if(checkExisting.length > 0 ){
    //     return res.status(203).send({status:false,message:'product code already exists !!'})

    // }
    const getProductsCount = await Products_Schema.find().count();
    const productCustomId = "prod_00" + (getProductsCount + 1);
    const create = new Products_Schema({
      product_id: productCustomId,
      product_name: req.body.product_name?.toLowerCase(),
      product_sub_description: req.body.product_sub_description,
      product_slug: req.body.product_name?.toLowerCase(),
      product_code: req.body.product_code,
      product_regular_price: req.body.product_regular_price,
      product_sale_price: req.body.product_sale_price,
      quantity: req.body.product_quantity,
      original_quantity: req.body.product_quantity,
      product_images: req.body.product_images,
      product_brand: req.body.product_brand,
      product_main_category: req.body.product_main_category?.toLowerCase(),
      product_main_category_slug: req.body.product_main_category?.toLowerCase(),
      product_category: req.body.product_category?.toLowerCase(),
      product_category_slug: req.body.product_category?.toLowerCase(),
      product_subcategory: req.body.product_subcategory?.toLowerCase(),
      product_subcategory_slug: req.body.product_subcategory?.toLowerCase(),
      new_arrival: req.body?.new_arrival,
      cartoon_total_products: req.body?.cartoon_total_products,
      color: req.body?.color?.toLowerCase(),
      size: req.body?.size?.toLowerCase(),
      product_tag: req.body?.product_tag?.toLowerCase(),
      product_description: req.body.product_description?.toLowerCase(),
      product_variant: req.body.product_variant?.toLowerCase(),
    });
    const result = await create.save();
    // res.status(200).send(result)
    res
      .status(200)
      .send({ status: true, message: "product created successfully !" });
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

// get all products for admin
// get all products
// const getAllProductsAdmin = async (req, res) => {
//   try {
//     // const { startIndex, endIndex, page } = req.pagination;
//     const getProductsCount = await Products_Schema.find({}).count();
//     const categoryForFilter = await Brands_Schema.aggregate([
//       { $group: { _id: "$main_category_name" } },
//     ]);
//     const all_category_for_filter = await Brands_Schema.find({});
//     const allProducts = await Products_Schema.find({}).sort({ createdAt: -1 });
//     // console.log(startIndex);
//     // console.log(endIndex);
//     res.status(200).send({
//       allProducts: allProducts,
//       //  page: page,
//       count: allProducts.length,
//       getProductsCount: getProductsCount,
//       getAllProductStatus: product_status,
//       categoryForFilter: categoryForFilter,
//       all_category_for_filter: all_category_for_filter,
//     });
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Something went wrong !!");
//   }
// };

// get all products 
const getAllProductsAdmin = async(req,res)=>{
  const {by_status,by_stock,by_type,date_from,date_to,by_category,by_product_status} = req.query;
  const searchValue = req.query.search;
  const searchRegex = Utils.createRegex(searchValue);
  const limit  = req.query.limit  || 25; 
  const page  = req.query.page; 
  let count;
  let result;
  try{
    // result = await Products_Schema.find({})
    // count = await Products_Schema.find({}).count()
    // return res.status(200).send({allProducts:result,count:count});
    // category list for filter
    let categoryForFilter = await Brands_Schema.aggregate([
          {$group:{_id:"$main_category_name"}}
      ]).sort({_id:1})
    // category list for filter
    //   ====== for filter category list ======
    //   ====== for filter category list ======

    // ============ SEARCH FOR PRODUCTS ============
if(searchValue){
  result = await Products_Schema.find({product_name:{$regex:searchRegex}})
  .sort({createdAt:-1})
        .limit(limit)
        .skip((page - 1) * limit);
  count = await Products_Schema.find({product_name:{$regex:searchRegex}}).count();
  if(!result.length > 0){
      result = await Products_Schema.find({product_code:{$regex:searchRegex}})
      .sort({createdAt:-1})
          .limit(limit)
          .skip((page - 1) * limit);
      count = await Products_Schema.find({product_code:{$regex:searchRegex}}).count();
      }
  return res.status(200).send({allProducts:result,pages:Math.ceil(count / limit),getProductsCount:count,categoryForFilter:categoryForFilter});

    }
    // ============ SEARCH FOR PRODUCTS ============

    // ========= FILTER FOR PRODUCTS =========
    const endDate = new Date(`${date_to}`);
    // seconds * minutes * hours * milliseconds = 1 day 
    const dayTime = 60 * 60 * 24 * 1000;
    let increaseEndDateByOne = new Date(endDate.getTime() + dayTime);
    // console.log("INCREASED DATE",increaseEndDateByOne)


    // filter users by todays date and by their status 
if(date_from && date_to && by_category ){ 
  if(by_category!= 'all'){
        result = await Products_Schema.aggregate([{
          $match:{
          product_main_category:by_category,
          createdAt:{
              $lte:Utils.convertDate(increaseEndDateByOne),
              $gte:Utils.convertDate(date_from)
            }
          },
  },{$sort:{createdAt:-1}}, {$skip: (page - 1) * limit },
  {$limit: limit } ],)
  count =  await Products_Schema.aggregate([{
      product_main_category:by_category,
      createdAt:{
          $lte:Utils.convertDate(increaseEndDateByOne),
          $gte:Utils.convertDate(date_from)
          }
  },{$count:'product_count'}],)
     return res.status(200).send({allProducts:result,pages:Math.ceil(count[0]?.product_count / limit),getProductsCount:count[0]?.product_count,getAllProductStatus:product_status,categoryForFilter:categoryForFilter});
      }
    }
  else{
      result = await Products_Schema.find({product_main_category:by_category}).sort({createdAt:-1})
      // return res.status(200).send(result)

    }


if(date_from && date_to){
      result = await Products_Schema.aggregate([{
                      $match:{
                      createdAt:{
                          $lte:Utils.convertDate(increaseEndDateByOne),
                          $gte:Utils.convertDate(date_from)
          }
        },
              },{$sort:{createdAt:-1}}, {$skip: (page - 1) * limit },
              {$limit: limit } ],)
      count = await Products_Schema.aggregate([{
              $match:{
              createdAt:{
                  $lte:Utils.convertDate(increaseEndDateByOne),
                  $gte:Utils.convertDate(date_from)
          }
        },
      },{$count:'product_count'}],)
          return res.status(200).send({allProducts:result,pages:Math.ceil(count[0]?.product_count / limit),getProductsCount:count[0]?.product_count,getAllProductStatus:product_status,categoryForFilter:categoryForFilter});
    }

  if(by_category != 'all'){
      result = await Products_Schema.find({product_main_category:by_category})
      .sort({createdAt:-1})
        .limit(limit)
        .skip((page - 1) * limit);
      count = await Products_Schema.find({product_main_category:by_category}).count();

      return  res.status(200).send({allProducts:result,pages:Math.ceil(count / limit),getProductsCount:count,getAllProductStatus:product_status,categoryForFilter:categoryForFilter});

    }
  if(by_product_status != 'all'){
      result = await Products_Schema.find({product_status:by_product_status})
      .sort({createdAt:-1})
        .limit(limit)
        .skip((page - 1) * limit);
      count = await Products_Schema.find({product_status:by_product_status}).count();
      return  res.status(200).send({allProducts:result,pages:Math.ceil(count / limit),getProductsCount:count,getAllProductStatus:product_status,categoryForFilter:categoryForFilter});

    }
  if(by_stock != 'all'){
      result = await Products_Schema.find({quantity:{ $lte: by_stock} })
      .sort({createdAt:-1})
        .limit(limit)
        .skip((page - 1) * limit);
      count = await Products_Schema.find({quantity:{ $lte: by_stock} }).count();
      return  res.status(200).send({allProducts:result,pages:Math.ceil(count / limit),getProductsCount:count,getAllProductStatus:product_status,categoryForFilter:categoryForFilter});

    }
  if(by_type != 'all'){
    if(by_type == 'new_arrivals' ){
      result = await Products_Schema.find({new_arrival:true})
      .sort({createdAt:-1})
          .limit(limit)
          .skip((page - 1) * limit);
      count = await Products_Schema.find({new_arrival:true}).count();
      return  res.status(200).send({allProducts:result,pages:Math.ceil(count / limit),getProductsCount:count,getAllProductStatus:product_status,categoryForFilter:categoryForFilter});
      }
    if(by_type == 'trending' ){
      result = await Products_Schema.find({trending_product:true})
      .sort({createdAt:-1})
          .limit(limit)
          .skip((page - 1) * limit);
      count = await Products_Schema.find({trending_product:true}).count();
      return  res.status(200).send({allProducts:result,pages:Math.ceil(count / limit),getProductsCount:count,getAllProductStatus:product_status,categoryForFilter:categoryForFilter});
      }

    }

    // ========= FILTER FOR PRODUCTS =========


    result = await Products_Schema.find({})
      .sort({createdAt:-1})
      .limit(limit)
      .skip((page - 1) * limit);
    count = await Products_Schema.find({}).count();
      res.status(200).send({allProducts:result,pages:Math.ceil(count / limit),getProductsCount:count,getAllProductStatus:product_status,categoryForFilter:categoryForFilter});

  }
  catch(err){
    console.log(err)
    res.status(500).send("Something went wrong product !!")
  }
}


// get all products
const getAllProducts = async (req, res) => {
  try {
    const { startIndex, endIndex, page } = req.pagination;
    const getProductsCount = await Products_Schema.find({}).count();
    const categoryForFilter = await Brands_Schema.aggregate([
      { $group: { _id: "$main_category_name" } },
    ]);
    const all_category_for_filter = await Brands_Schema.find({});
    let allProducts;
    if (parseInt(req.query.sort) === 0) {
      allProducts = await Products_Schema.find({}).sort({ createdAt: -1 });
    } else if (parseInt(req.query.sort) === -1) {
      allProducts = await Products_Schema.find({}).sort({
        product_sale_price: 1,
      });
    } else if (parseInt(req.query.sort) === 1) {
      allProducts = await Products_Schema.find({}).sort({
        product_sale_price: -1,
      });
    }
    // const allProducts = await Products_Schema.find({}).sort({ createdAt: -1 });
    res.status(200).send({
      allProducts: allProducts.slice(startIndex, endIndex),
      page: page,
      count: allProducts.length,
      getProductsCount: getProductsCount,
      getAllProductStatus: product_status,
      categoryForFilter: categoryForFilter,
      all_category_for_filter: all_category_for_filter,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};
// get all products
const CatalougeProducts = async (req, res) => {
  try {
    const allProducts = await Products_Schema.find({}).sort({ createdAt: -1 });
    // const client = new google.auth.JWT(
    //   keys.client_email,
    //   null,
    //   keys.private_key,
    //   ['https://www.googleapis.com/auth/spreadsheets']
    // );
    
    // client.authorize((err, tokens) => {
    //   if (err) {
    //       console.error('Error authorizing Google Sheets API:', err);
    //       return;
    //   }
    //   console.log('Connected to Google Sheets API');
      
    //   // Access Google Sheets API
    //   const sheets = google.sheets({ version: 'v4', auth: client });
    //   sheets.spreadsheets.values.get({
    //       spreadsheetId: '1s8sDYEJW7LxxImZsIVLktwHUoMvsT6RE',
    //       range: 'Sheet1', // Range of cells to read
    //   }, (err, response) => {
    //       if (err) {
    //           console.error('The API returned an error:', err);
    //           res.status(500).send('Error fetching data from spreadsheet');
    //           return;
    //       }
    //       // const rows = response.data.values;
    //       if (response) {
    //           console.log('Data:');
    //           return res.json(response.data);
    //       } else {
    //           console.log('No data found.');
    //           return res.send('No data found in spreadsheet');
    //       }
    //   });
    // });
// console.log(allProducts[0])
//     let product = allProducts.map((e) => {

//       if(e.product_name && e.product_images[0]?.image_url){
//         return {id: e._id,
//         title: e.product_name, 
//         availability: "in stock",
//         condition: "new",
//         description: e.product_sub_description || e.product_name,
//         price: e.product_regular_price+" INR",
//         link: `https://dochomoeo.com/product/${e.product_name?.trim()}/${e._id}`,
//         image_link: e.product_images[0].image_url,
//         brand: e.product_brand,
//         quantity: e.original_quantity,
//         sale_price: e.product_sale_price,}
//       }
//       else ""
//     })

  res.status(200).send({allProducts});
} catch (err) {
  console.log("error",err);
  res.status(500).send("Something went wrong !!");
}
};

// get all products for filter in website
const getAllProductsFilter = async (req, res) => {
  try {
    const filter = req.query.filter;
    const { startIndex, endIndex, page } = req.pagination;
    const getProductsCount = await Products_Schema.find({
      product_brand: filter,
    }).count();
    const categoryForFilter = await Brands_Schema.aggregate([
      { $group: { _id: "$main_category_name" } },
    ]);
    const all_category_for_filter = await Brands_Schema.find({});
    var allProducts;
    if (!parseInt(req.query.sort) && !parseInt(req.query.iscat)) {
      allProducts = await Products_Schema.find({ product_brand: filter }).sort({
        createdAt: -1,
      });
    } else if (!parseInt(req.query.sort) && parseInt(req.query.iscat) === 1) {
      allProducts = await Products_Schema.find({
        product_main_category: filter,
      }).sort({ createdAt: -1 });
    } else if (
      parseInt(req.query.sort) === 0 &&
      parseInt(req.query.iscat) !== 1
    ) {
      allProducts = await Products_Schema.find({ product_brand: filter }).sort({
        createdAt: -1,
      });
    } else if (
      parseInt(req.query.sort) === -1 &&
      parseInt(req.query.iscat) !== 1
    ) {
      allProducts = await Products_Schema.find({ product_brand: filter }).sort({
        product_sale_price: 1,
      });
    } else if (
      parseInt(req.query.sort) === 1 &&
      parseInt(req.query.iscat) !== 1
    ) {
      allProducts = await Products_Schema.find({ product_brand: filter }).sort({
        product_sale_price: -1,
      });
    } else if (
      parseInt(req.query.sort) === 1 &&
      parseInt(req.query.iscat) === 1
    ) {
      allProducts = await Products_Schema.find({
        product_main_category: filter,
      }).sort({ product_sale_price: -1 });
    } else if (
      parseInt(req.query.sort) === -1 &&
      parseInt(req.query.iscat) === 1
    ) {
      allProducts = await Products_Schema.find({
        product_main_category: filter,
      }).sort({ product_sale_price: 1 });
    } else if (
      parseInt(req.query.sort) === 0 &&
      parseInt(req.query.iscat) === 1
    ) {
      allProducts = await Products_Schema.find({
        product_main_category: filter,
      }).sort({ createdAt: 1 });
    }
    res.status(200).send({
      allProducts: allProducts?.slice(startIndex, endIndex),
      page: page,
      count: allProducts?.length,
      getProductsCount: getProductsCount,
      getAllProductStatus: product_status,
      categoryForFilter: categoryForFilter,
      all_category_for_filter: all_category_for_filter,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

// get product by id
const getproductById = async (req, res) => {
  const productId = req.params.product_id;
  try {
    if (!productId) {
      return res
        .status(404)
        .send({ status: false, message: "product not found !!" });
    }
    const findProductById = await Products_Schema.findById(productId);
    if (!findProductById) {
      return res
        .status(404)
        .send({ status: false, message: "product not found !!" });
    }
    // console.log(findProductById);
    res.status(200).send(findProductById);
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

// edit products
const editProduct = async (req, res) => {
  const productId = req.params.product_id;
  // console.log("productId=>", productId);
  // console.log(req.body);
  try {
    if (!productId) {
      return res.status(404).send("Not Found !!");
    }
    const updateProduct = await Products_Schema.findByIdAndUpdate(productId, {
      $set: req.body,
    });
    if (!updateProduct) {
      return res.status(404).send("product not found !!");
    }
    res.status(200).send(updateProduct);
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

// homepage products
const homeProducts = async (req, res) => {
  try {
    const brands = await Brands_Schema.find();
    const bdata = brands.slice(0, 4);
    const data = [];

    // Use Promise.all to wait for all async operations to complete
    await Promise.all(
      bdata.map(async (i) => {
        const pr = await Products_Schema.find({
          product_main_category: i.main_category_name,
        })
          .sort({ createdAt: -1 })
          .limit(10);
        data.push(pr);
      })
    );

    res.status(200).send(data);
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

//SEARCH for admin IN PRODUCTS
const adminSearchProducts = async (req, res) => {
  const searchValue = req.query.search;
  //const { startIndex, endIndex, page } = req.pagination;
  //  console.log(searchValue);
  const searchRegex = Utils.createRegex(searchValue);
  let result;
  try {
    result = await Products_Schema.find({
      product_brand: { $regex: searchRegex },
    }).sort({ createdAt: 1 });

    if (!result.length > 0) {
      result = await Products_Schema.find({
        product_main_category: { $regex: searchRegex },
      }).sort({ createdAt: 1 });
    }
    if (!result.length > 0) {
      result = await Products_Schema.find({
        product_name: { $regex: searchRegex },
      }).sort({ createdAt: 1 });
    }
    if (!result.length > 0) {
      result = await Products_Schema.find({
        product_code: { $regex: searchRegex },
      }).sort({ createdAt: 1 });
    }

    if (!result.length > 0) {
      result = await Products_Schema.find({
        product_subcategory: { $regex: searchRegex },
      }).sort({ createdAt: 1 });
    }

    // console.log(result);
    res.status(200).send({
      result: result,
      count: result?.length,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

//SEARCH IN PRODUCTS
const searchProducts = async (req, res) => {
  const searchValue = req.query.search.replace(/(\D)(\d)/g, '$1 $2').replace(/\s+/g," ");
  const { startIndex, endIndex, page } = req.pagination;
  // console.log(searchValue);
  const searchRegex1 = Utils.createRegex(searchValue);
  const searchRegex2 = Utils.createRegex(searchValue.replace(/(\D) (\d)/g, '$1$2'));
  // console.log(searchRegex1,searchRegex2);
  let result;
  try {
    result = await Products_Schema.find({
      $or:[
        {product_brand: { $regex: searchRegex1 },},
        {product_brand: { $regex: searchRegex2 },},
      ]
    }).sort({ product_name: 1 });

    if (!result.length > 0) {
      result = await Products_Schema.find({
        $or:[
          {product_main_category: { $regex: searchRegex1 },},
          {product_main_category: { $regex: searchRegex2 },},
        ]
      }).sort({ product_name: 1 });
    }
    if (!result.length > 0) {
      result = await Products_Schema.find({
        $or:[
          {product_name: { $regex: searchRegex1 },},
          {product_name: { $regex: searchRegex2 },},
        ]
      }).sort({ product_name: 1 });
    }
    if (!result.length > 0) {
      result = await Products_Schema.find({
        $or:[
          {product_code: { $regex: searchRegex1 },},
          {product_code: { $regex: searchRegex2 },},
        ]
      }).sort({ product_name: 1 });
    }

    if (!result.length > 0) {
      result = await Products_Schema.find({
        $and:[
          {product_subcategory: { $regex: searchRegex1 },},
          {product_subcategory: { $regex: searchRegex2 },},
        ]
      }).sort({ product_name: 1 });
    }

    // console.log(result);
    res.status(200).send({
      result: result.slice(startIndex, endIndex),
      count: result?.length,
      page: page,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

//SEARCH PRODUCTS WITH CATEGORY NAME
const searchProductsWithCategoryName = async (req, res) => {
  const searchValue = req.query.search;
  const { startIndex, endIndex, page } = req.pagination;
  const searchRegex = Utils.createRegex(searchValue);
  let result;
  try {

    result = await Products_Schema.find({
      product_main_category: { $regex: searchRegex },
    }).sort({ createdAt: -1 });

    // console.log(result);
    res.status(200).send({
      result: result.slice(startIndex, endIndex),
      count: result?.length,
      page: page,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};
//SEARCH PRODUCTS WITH SUB CATEGORY NAME
const searchProductsWithSubCategoryName = async (req, res) => {
  const searchValue = req.query.search;
  const { startIndex, endIndex, page } = req.pagination;
  const searchRegex = Utils.createRegex(searchValue);
  let result;
  try {

    result = await Products_Schema.find({
      product_subcategory: { $regex: searchRegex },
    }).sort({ createdAt: -1 });

    // console.log(result);
    res.status(200).send({
      result: result.slice(startIndex, endIndex),
      count: result?.length,
      page: page,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

// search Products With Brand Name
const searchProductsWithBrandName = async (req, res) => {
  const searchValue = req.query.search;
  const { startIndex, endIndex, page } = req.pagination;
  const searchRegex = Utils.createRegex(searchValue);
  let result;
  try {
    result = await Products_Schema.find({
      product_brand: { $regex: searchRegex },
    }).sort({ createdAt: -1 });

    // console.log(result);
    res.status(200).send({
      result: result.slice(startIndex, endIndex),
      count: result?.length,
      page: page,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Something went wrong !!");
  }
};

// const searchProducts = async (req, res) => {
//   const searchValue = req.query.search;
//   console.log(searchValue);
//   const searchRegex = Utils.createRegex(searchValue?.toLowerCase());
//   console.log(searchRegex);
//   let result = [];

//   try {
//     const searchQueries = [
//       {
//         product_slug: { $regex: searchRegex },
//       },
//       { product_name: { $regex: searchRegex } },
//       { product_code: { $regex: searchRegex } },
//       { product_brand: { $regex: searchRegex } },
//       { product_main_category: { $regex: searchRegex } },
//       { product_subcategory: { $regex: searchRegex } },
//       { product_main_category_slug: { $regex: searchRegex } },
//       { product_subcategory_slug: { $regex: searchRegex } },
//       { product_category: { $regex: searchRegex } },
//       { product_category_slug: { $regex: searchRegex } },
//     ];

//     for (const query of searchQueries) {
//       const queryResult = await Products_Schema.find(query).sort({
//         createdAt: -1,
//       });
//       if (queryResult.length > 0) {
//         result = result.concat(queryResult);
//       }
//     }

//     if (result.length > 0) {
//       res.status(200).send(result);
//     } else {
//       res.status(404).send("No results found.");
//     }
//   } catch (err) {
//     console.log(err);
//     res.status(500).send("Something went wrong !!");
//   }
// };

// Filter for products table
const filterProducts = async (req, res) => {
  const { by_status, date_from, date_to, by_category, by_product_status,by_stock} =
    req.query;
  let result;
  //const { startIndex, endIndex } = req.pagination;
  // console.log("by_status,date_from,date_to", by_status, date_from, date_to);
  try {
    const endDate = new Date(`${date_to}`);
    // seconds * minutes * hours * milliseconds = 1 day
    const dayTime = 60 * 60 * 24 * 1000;
    let increaseEndDateByOne = new Date(endDate.getTime() + dayTime);
    // console.log("INCREASED DATE",increaseEndDateByOne)

    // filter users by todays date and by their status
    let user_status;
    if (date_from && date_to && by_category) {
      if (by_category != "all") {
        result = await Products_Schema.aggregate([
          {
            $match: {
              product_main_category: by_category,
              createdAt: {
                $lte: Utils.convertDate(increaseEndDateByOne),
                $gte: Utils.convertDate(date_from),
              },
            },
          },
        ]).sort({ createdAt: -1 });
        return res.status(200).send(result);
      }
    } else {
      result = await Products_Schema.find({
        product_main_category: by_category,
      }).sort({ createdAt: -1 });
      // return res.status(200).send(result)
    }

    if (date_from && date_to) {
      result = await Products_Schema.aggregate([
        {
          $match: {
            createdAt: {
              $lte: Utils.convertDate(increaseEndDateByOne),
              $gte: Utils.convertDate(date_from),
            },
          },
        },
      ]).sort({ createdAt: -1 });
      return res.status(200).send(result);
    }

    if (by_category != "all") {
      result = await Products_Schema.find({
        product_main_category: by_category,
      }).sort({ createdAt: -1 });
      return res.status(200).send(result);
    }
    if (by_stock == "true") {
      result = await Products_Schema.find({
        quantity: 0,
      }).sort({ createdAt: -1 });
      return res.status(200).send(result);
    }
    if (by_product_status != "all") {
      result = await Products_Schema.find({
        product_status: by_product_status,
      }).sort({ createdAt: -1 });
      return res.status(200).send(result);
    }
  } catch (err) {
    console.log(err);
    res.status(200).send("Somthing went wrong !!");
  }
};

// By Shashikant

// Filter for products table
const multiCategory = async (req, res) => {
  try {
    const { category } = req.body;

    if (category.length <= 0) {
      const findResult = await Products_Schema.find({}).sort({ createdAt: -1 });
      return res.status(200).send({
        allProducts: findResult,
      });
    }

    // console.log(category);

    const findResult = await Products_Schema.find({
      product_main_category: category,
    });

    // console.log(findResult);

    return res.status(200).send({
      allProducts: findResult,
    });
  } catch (err) {
    console.log(err);
    res.status(200).send("Somthing went wrong !!");
  }
};

// recommended products
const recommended = async (req, res) => {
  try {
    const { id } = req.body;

    // if (category.length <= 0) {
    //   const findResult = await Products_Schema.find({}).limit(10).sort({ createdAt: -1 });
    //   return res.status(200).send({
    //     allProducts: findResult,
    //   });
    // }

    // console.log(category);

    const pr = await Products_Schema.findById(id);

    const findResult = await Products_Schema.find({
      product_main_category: pr?.product_main_category,
    }).limit(10);


    return res.status(200).send({
      allProducts: findResult,
    });
  } catch (err) {
    console.log(err);
    res.status(200).send("Somthing went wrong !!");
  }
};

// delete products
const deleteProducts = async (req, res) => {
  // console.log("body=>",req.body)
  // console.log("body=>",req.body?.length)
  try {
    if (req.body?.length) {
      const deleteSelected = await Products_Schema.deleteMany({
        _id: {
          $in: req.body,
        },
      });
      if (!deleteSelected) {
        return res
          .status(200)
          .send({ message: "product delete failed", status: false });
      }
      return res
        .status(200)
        .send({ message: "product delete success", status: true });
    }

    res.status(200).send({ message: "product delete failed", status: false });
  } catch (err) {
    console.log(err);
    res.status(200).send({ message: "product delete failed", status: false });
  }
};

//  delete product image
const deleteProductImage = async (req, res) => {
  const productId = req.params.product_id;
  const productImageName = req.params.product_image;
  try {
    if (!productId) {
      return res
        .status(404)
        .send({ status: false, message: "product not found !!" });
    }
    const findProduct = await Products_Schema.findById(productId).select(
      "product_images"
    );
    let result = findProduct;
    const filteredProductsImages = await result?.product_images?.filter(
      (value, index) => value.image_name !== productImageName
    );
    const updateProductImage = await Products_Schema.findByIdAndUpdate(
      productId,
      { $set: { product_images: filteredProductsImages } }
    );
    res
      .status(200)
      .send({ status: true, message: "product image deleted successfully !!" });
  } catch (err) {
    console.log(err);
    res.status(200).send({ status: false, message: "image delete failed !!" });
  }
};

// set  new arrivals products
const setNewArrivalProducts = async (req, res) => {
  // console.log("body=>",req.body)
  // console.log("body=>",req.body?.data)
  try {
    if (req.body?.data?.length) {
      const updateSelected = await Products_Schema.updateMany(
        { _id: { $in: req.body.data } },
        { $set: { new_arrival: true } },
        { multi: true }
      );
      if (!updateSelected) {
        return res.status(200).send({
          message: "product set as new arrival failed",
          status: false,
        });
      }
      return res
        .status(200)
        .send({ message: "product set as new arrival success", status: true });
    }
    res
      .status(200)
      .send({ message: "product set as new arrival failed", status: false });
  } catch (err) {
    console.log(err);
    res
      .status(200)
      .send({ message: "product set as new arrival failed", status: false });
  }
};

// Remove new arrivals products
const removeNewArrivalProducts = async (req, res) => {
  // console.log("body=>",req.body)
  // console.log("body=>",req.body?.data)
  try {
    if (req.body?.data?.length) {
      const updateSelected = await Products_Schema.updateMany(
        { _id: { $in: req.body.data } },
        { $set: { new_arrival: false } },
        { multi: true }
      );
      if (!updateSelected) {
        return res.status(200).send({
          message: "product remove as new arrival failed",
          status: false,
        });
      }
      return res.status(200).send({
        message: "product remove as new arrival success",
        status: true,
      });
    }
    res
      .status(200)
      .send({ message: "product remove as new arrival failed", status: false });
  } catch (err) {
    console.log(err);
    res
      .status(200)
      .send({ message: "product remove as new arrival failed", status: false });
  }
};

// set trending products
const setTrendingProducts = async (req, res) => {
  try {
    if (req.body?.data?.length) {
      const updateSelected = await Products_Schema.updateMany(
        { _id: { $in: req.body.data } },
        { $set: { trending_product: true } },
        { multi: true }
      );
      if (!updateSelected) {
        return res.status(200).send({
          message: "product set as trending product failed",
          status: false,
        });
      }
      return res.status(200).send({
        message: "product set as trending product success",
        status: true,
      });
    }
    res.status(200).send({
      message: "product set as trending product failed",
      status: false,
    });
  } catch (err) {
    console.log(err);
    res.status(200).send({
      message: "product set as trending product failed",
      status: false,
    });
  }
};

// Remove trending products
const removeTrendingProducts = async (req, res) => {
  try {
    if (req.body?.data?.length) {
      const updateSelected = await Products_Schema.updateMany(
        { _id: { $in: req.body.data } },
        { $set: { trending_product: false } },
        { multi: true }
      );
      if (!updateSelected) {
        return res.status(200).send({
          message: "product remove as trending product failed",
          status: false,
        });
      }
      return res.status(200).send({
        message: "product remove as trending product success",
        status: true,
      });
    }
    res.status(200).send({
      message: "product remove as trending product failed",
      status: false,
    });
  } catch (err) {
    console.log(err);
    res.status(200).send({
      message: "product remove as trending product failed",
      status: false,
    });
  }
};

exports.createProducts = createProducts;
exports.multiCategory = multiCategory;
exports.getAllProducts = getAllProducts;
exports.getAllProductsAdmin = getAllProductsAdmin;
exports.getproductById = getproductById;
exports.editProduct = editProduct;
exports.deleteProducts = deleteProducts;
exports.searchProducts = searchProducts;
exports.filterProducts = filterProducts;
exports.deleteProductImage = deleteProductImage;
exports.setNewArrivalProducts = setNewArrivalProducts;
exports.removeNewArrivalProducts = removeNewArrivalProducts;
exports.setTrendingProducts = setTrendingProducts;
exports.removeTrendingProducts = removeTrendingProducts;
exports.addReview = addReview;
exports.deleteReview = deleteReview;
exports.editReview = editReview;
exports.homeProducts = homeProducts;
exports.recommended = recommended;
exports.adminSearchProducts = adminSearchProducts;
exports.getAllProductsFilter = getAllProductsFilter;
exports.CatalougeProducts = CatalougeProducts;

exports.searchProductsWithCategoryName = searchProductsWithCategoryName;
exports.searchProductsWithBrandName = searchProductsWithBrandName;
exports.searchProductsWithSubCategoryName = searchProductsWithSubCategoryName;

