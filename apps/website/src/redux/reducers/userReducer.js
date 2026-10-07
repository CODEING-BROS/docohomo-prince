// userReducer.js

import { removeCookie } from "../../lib/session";

// Initial state for the user
const initialState = {
    isAuthenticated: false,
    user: null,
  };
  
  // Define action types
  const LOGIN_USER = 'LOGIN_USER';
  const LOGOUT_USER = 'LOGOUT_USER';
  
  // Define action creators
  export const loginUser = (user) => (
    {
    type: LOGIN_USER,
    payload: user,
  });
  
  export const logoutUser = () => ({
    type: LOGOUT_USER,
  });
  
  // User reducer
  const userReducer = (state = initialState, action) => {
    switch (action.type) {
      case LOGIN_USER:
        return {
          ...state,
          isAuthenticated: true,
          user: action.payload,
        };
      case LOGOUT_USER:
        removeCookie('token');
        return {
          ...state,
          isAuthenticated: false,
          user: null,
        };
      default:
        return state;
    }
  };
  
  export default userReducer;
  