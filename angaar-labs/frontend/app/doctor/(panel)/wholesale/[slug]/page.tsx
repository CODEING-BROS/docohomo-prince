import { WholesaleGate } from "@/components/doctor/wholesale-gate";
import { ShopProduct } from "@/components/shop/product";

// A doctor buying at wholesale prices: only once their wholesale account is switched on.
export default function Page() {
  return (
    <WholesaleGate>
      <ShopProduct />
    </WholesaleGate>
  );
}
