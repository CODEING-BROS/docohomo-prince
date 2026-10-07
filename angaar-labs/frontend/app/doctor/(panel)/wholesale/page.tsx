import { WholesaleGate } from "@/components/doctor/wholesale-gate";
import { ShopListing } from "@/components/shop/listing";

// A doctor buying at wholesale prices: only once their wholesale account is switched on.
export default function Page() {
  return (
    <WholesaleGate>
      <ShopListing />
    </WholesaleGate>
  );
}
