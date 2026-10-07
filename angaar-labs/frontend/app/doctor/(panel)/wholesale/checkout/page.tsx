import { WholesaleGate } from "@/components/doctor/wholesale-gate";
import { ShopCheckout } from "@/components/shop/checkout";

// A doctor buying at wholesale prices: only once their wholesale account is switched on.
export default function Page() {
  return (
    <WholesaleGate>
      <ShopCheckout />
    </WholesaleGate>
  );
}
