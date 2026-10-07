import { WholesaleGate } from "@/components/doctor/wholesale-gate";
import { ShopCart } from "@/components/shop/cart";

// A doctor buying at wholesale prices: only once their wholesale account is switched on.
export default function Page() {
  return (
    <WholesaleGate>
      <ShopCart />
    </WholesaleGate>
  );
}
