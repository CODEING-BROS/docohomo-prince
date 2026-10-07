// use all the below mentioned Utility Functions,
// to create, rmeove and manipulate Cookies. ( in whole project )
// Here, we are using "js-cookie" npm, to work with cookies.
function getCookies(cookieName) {
    const name = cookieName + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const cookieArray = decodedCookie.split(';');
  
    for (let i = 0; i < cookieArray.length; i++) {
      let cookie = cookieArray[i].trim();
      if (cookie.indexOf(name) === 0) {
        return cookie.substring(name.length, cookie.length);
      }
    }
  
    return null; // Return null if the cookie is not found
  }


  function setCookies(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    let expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
  }


export const setCookie = (key, value, exp) => {
  setCookies(key,value,exp);
};

export const removeCookie = key => {
    setCookies(key,"",-1)
};

export const getCookie = (key, req) => {
  return getCookies(key);
};
