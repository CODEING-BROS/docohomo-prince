import { Suspense } from "react";
import { OrderPage } from "@/components/site/order-page";

export default function Page() {
  return (
    <Suspense>
      <OrderPage base="/patient" />
    </Suspense>
  );
}
