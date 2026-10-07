import MenuThree from "./Menu/MenuThree";
import MenuFour from "./Menu/MenuFour";

export default function HeaderThree(props) {
  return (
    <>
      <MenuThree {...props} hide="search" />
      <MenuFour {...props} hide="cart" />
    </>
  );
}
