import { combineReducers } from "redux";

import cartReducer from "./cartReducer";
import wishlistReducer from "./wishlistReducer";
import shopReducers from "./shopReducers";
import userReducer from "./userReducer";
import orderReducer from "./orderReducer";

const rootReducer = combineReducers({
  cartReducer,
  wishlistReducer,
  shopReducers,
  userReducer,
  orderReducer
});

export default rootReducer;
