/**
 * Goes to a page with a full page load.
 * Used whenever who-is-signed-in has just changed (sign in, sign up, registration, sign out):
 * the app remembers pages it already visited, including "you are not signed in, go to the sign-in page",
 * and a normal in-app move would replay that stale answer until the page is refreshed by hand.
 */
export const goFresh = (path: string) => {
  window.location.assign(path);
};
