"use client";

import { BadgePercent, IndianRupee, Package, PiggyBank, ReceiptText } from "lucide-react";
import Link from "next/link";
import { PageHeader, StatCard, StatusBadge } from "@/components/admin/parts";
import { useWholesale, WholesaleGate } from "@/components/doctor/wholesale-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney, formatMoneyExact } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/shop";

function Orders() {
  const { data } = useWholesale();
  if (!data?.account || !data.stats) return null;
  const { account, stats, orders } = data;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={BadgePercent} label="Your pricing" value={account.tier ?? "Wholesale"} hint={account.discountPercent ? `${account.discountPercent}% off retail, more on bulk` : "Doctor prices on every product"} />
        <StatCard icon={Package} label="Orders placed" value={String(stats.orders)} hint="Not counting cancelled ones" />
        <StatCard icon={IndianRupee} label="Bought so far" value={formatMoney(stats.spent)} hint={account.gstNumber ? `Billed to GSTIN ${account.gstNumber}` : `Billed to ${account.businessName}`} />
        {account.creditLimit > 0
          ? <StatCard icon={ReceiptText} label="Credit used" value={formatMoney(account.creditUsed)} hint={`Of ${formatMoney(account.creditLimit)}, pay within ${account.creditDays} days`} />
          : <StatCard icon={PiggyBank} label="Saved against retail" value={formatMoney(stats.saved)} hint="Compared with the MRP" />}
      </div>

      <Card>
        <CardContent>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Package className="size-5" /></span>
              <p className="font-medium">No orders yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">Medicines you order for your practice are listed here with their delivery status.</p>
              <Button asChild className="mt-1"><Link href="/doctor/wholesale">Order medicines</Link></Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead>Payment</TableHead><TableHead>Status</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.orderNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(order.placedAt)}</TableCell>
                      <TableCell className="text-right ledger">{order.items}</TableCell>
                      <TableCell className="text-right font-medium ledger">{formatMoneyExact(order.grandTotal)}</TableCell>
                      <TableCell><span className="mr-2 text-sm text-muted-foreground">{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}</span><StatusBadge status={order.paymentStatus} /></TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/doctor/orders/${order.id}`}>View</Link></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DoctorOrdersPage() {
  return (
    <>
      <PageHeader title="My orders" description="Medicines you have ordered for your practice at wholesale prices.">
        <Button asChild><Link href="/doctor/wholesale">Order medicines</Link></Button>
      </PageHeader>
      <WholesaleGate><Orders /></WholesaleGate>
    </>
  );
}
