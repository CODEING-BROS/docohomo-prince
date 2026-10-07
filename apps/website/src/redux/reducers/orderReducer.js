// Initial state for the order
const initialState = {
    orderData: null
  };
  
  // Define action types
  const ADD_ORDER_DATA = 'ADD_ORDER_DATA';
  const REMOVE_ORDER_DATA = 'REMOVE_ORDER_DATA';
  
  // Define action creators
  export const addOrderData = (orderData) => ({
    type: ADD_ORDER_DATA,
    payload: orderData,
  });
  
  export const removeOrderData = () => ({
    type: REMOVE_ORDER_DATA,
  });
  
  // User reducer
  const orderReducer = (state = initialState, action) => {
    switch (action.type) {
      case ADD_ORDER_DATA:
        return {
          ...state,
          orderData: action.payload,
        };
      case REMOVE_ORDER_DATA:
        return {
          ...state,
          orderData: null,
        };
      default:
        return state;
    }
  };
  
  export default orderReducer;
  