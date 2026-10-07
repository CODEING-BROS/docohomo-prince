"use client";

import { Bell, CalendarClock, IndianRupee, Package, ShoppingCart, Stethoscope, Trash2, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { useState } from "react";
import { GradientAvatar } from "@/components/custom/avatar";
import { Callout } from "@/components/custom/callout";
import { ColHead, DataTable, DataTableRow, DataTableToolbar, PaginationBar } from "@/components/custom/data-table";
import { DetailList } from "@/components/custom/detail-list";
import { ConfirmDialog, FormDialog, ReasonDialog } from "@/components/custom/dialogs";
import { EmptyState } from "@/components/custom/empty-state";
import { FilterChips } from "@/components/custom/filter-chips";
import { CheckboxRow, FormField, OtpField, PasswordField, PhoneField, QuantityStepper, SearchField, SwitchRow } from "@/components/custom/form-field";
import { ILLUSTRATION_NAMES, Illustration } from "@/components/custom/illustration";
import { Shortcut } from "@/components/custom/kbd";
import { LabelTag } from "@/components/custom/label-tag";
import { ButtonSpinner, CardSkeleton, ListSkeleton, Spinner, StatSkeleton, TableSkeleton } from "@/components/custom/loaders";
import { Money } from "@/components/custom/number";
import { PageHero } from "@/components/custom/page-hero";
import { ProgressBar, ProgressRing } from "@/components/custom/progress-ring";
import { SectionCard } from "@/components/custom/section-card";
import { StatCard } from "@/components/custom/stat-card";
import { StatusPill } from "@/components/custom/status-pill";
import { STATUS } from "@/components/custom/status-registry";
import { Stepper } from "@/components/custom/stepper";
import { ThemeToggle } from "@/components/custom/theme-toggle";
import { Timeline } from "@/components/custom/timeline";
import { TONE_LIST } from "@/components/custom/tone";
import { Eyebrow, Folio, Mono, Title } from "@/components/custom/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

// A gallery of every custom component with sample data, for checking the design by eye.
// Only served on development machines.

// fixed sample times, so rendering is pure
const DAY = 864e5;
const NOW = Date.parse("2026-10-07T09:00:00+05:30");
const ORDERS = [
  { number: "DH-24091", customer: "Asha Verma", status: "DELIVERED", total: 1245, channel: "D2C" },
  { number: "DH-24092", customer: "Dr. Rakesh Nair", status: "SHIPPED", total: 8620, channel: "B2B" },
  { number: "DH-24093", customer: "Meera Pillai", status: "PROCESSING", total: 430, channel: "D2C" },
  { number: "DH-24094", customer: "Sunil Rao", status: "CANCELLED", total: 990, channel: "D2C" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-foreground/18 pt-6">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </section>
  );
}

export default function DesignGallery() {
  const [chip, setChip] = useState("all");
  const [seg, setSeg] = useState("mobile");
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState(false);
  const [form, setForm] = useState(false);
  const [qty, setQty] = useState(2);
  const [otp, setOtp] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(true);
  const [page, setPage] = useState(1);
  const [value, setValue] = useState(184_320);

  if (process.env.NODE_ENV !== "development" && process.env.NEXT_PUBLIC_DEMO_LOGINS !== "true") notFound();

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <PageHero eyebrow="Design · Dispensary Ledger" title="Component gallery" description="Every piece of the library with sample data, in both themes." actions={<><ThemeToggle variant="segmented" /><Button size="lg" onClick={() => setValue((v) => v + 4_321)}>Tick the numbers</Button></>} />

      <PageHero tone="ink" eyebrow="Tuesday, 7 October" title="Good morning, Admin" description="Here is how the shop is doing this week." overlap />
      <div className="relative grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={value} format="currency" change={12.4} icon={IndianRupee} sparkline={[12, 18, 15, 22, 20, 28, 31]} />
        <StatCard label="Orders" value={1284} change={-3.1} icon={Package} sparkline={[40, 38, 44, 41, 39, 36, 35]} />
        <StatCard label="Average order" value={value / 1284} format="currency" change={0} icon={ShoppingCart} />
        <StatCard label="New customers" value={96} change={null} hint="No earlier data to compare" icon={UserRound} href="/design" />
      </div>

      <Section title="Typography">
        <Title>A section title in Fraunces</Title>
        <p className="text-sm">Body text stays in Public Sans. Order <Mono upper>dh-24091</Mono> was packed at 10:42.</p>
        <Folio value="0421" />
        <Shortcut keys={["Ctrl", "K"]} label="Search" />
      </Section>

      <Section title="Status pills">
        <div className="flex flex-wrap gap-2">
          {Object.keys(STATUS).map((status) => <StatusPill key={status} status={status} />)}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill status="SHIPPED" size="md" />
          <StatusPill status="PENDING" kind="refund" size="md" />
          <StatusPill status="APPROVED" kind="doctor" size="md" asChild />
          <StatusPill status="PROCESSING" busy size="md" />
        </div>
      </Section>

      <Section title="Label tags">
        <div className="flex flex-wrap items-center gap-3">
          <LabelTag tone="terracotta" variant="sticker">18% off</LabelTag>
          <LabelTag tone="danger" variant="sticker">Out of stock</LabelTag>
          <LabelTag variant="stamp">Rx</LabelTag>
          <LabelTag tone="primary" variant="stamp">Paid</LabelTag>
          <LabelTag variant="ribbon">Test mode</LabelTag>
          <LabelTag tone="neutral">(you)</LabelTag>
          <LabelTag tone="plum">Wholesale</LabelTag>
        </div>
      </Section>

      <Section title="Callouts">
        <div className="grid gap-3 md:grid-cols-2">
          {TONE_LIST.map((tone) => (
            <Callout key={tone} tone={tone} title={`A ${tone} note`} action={<Button variant="link" size="xs">Open</Button>}>Short explanation of what happened and what to do next.</Callout>
          ))}
          <Callout tone="warning" compact action={<Button variant="link" size="xs">Fix</Button>}>Compact: the courier has no pickup address chosen.</Callout>
        </div>
      </Section>

      <Section title="Filter chips">
        <FilterChips ariaLabel="Order status" value={chip} onChange={setChip} options={[{ value: "all", label: "All", count: 1284 }, { value: "open", label: "Open", count: 42, tone: "warning" }, { value: "shipped", label: "Shipped", count: 17, tone: "info" }, { value: "delivered", label: "Delivered", count: 1180, tone: "success" }, { value: "cancelled", label: "Cancelled", count: 45, tone: "danger" }]} />
        <FilterChips variant="segmented" ariaLabel="Sign in with" value={seg} onChange={setSeg} options={[{ value: "mobile", label: "Mobile number" }, { value: "password", label: "Password" }]} />
      </Section>

      <Section title="Data table">
        <SectionCard title="Latest orders" description="Rows open on click or Enter; the button inside does not." action={<Button size="sm" variant="outline">Export</Button>} flush>
          <DataTableToolbar search={<SearchField value={search} onChange={setSearch} placeholder="Search orders" shortcut={["/"]} />} hasFilters={Boolean(search)} onClear={() => setSearch("")} actions={<Button size="sm">New order</Button>} />
          <DataTable isPending={false} isError={false} isEmpty={false} empty={{ title: "No orders" }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <ColHead sortable sorted="desc">Order</ColHead>
                  <ColHead>Customer</ColHead>
                  <ColHead>Status</ColHead>
                  <ColHead align="right">Total</ColHead>
                  <ColHead align="right"><span className="sr-only">Actions</span></ColHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ORDERS.map((order) => (
                  <DataTableRow key={order.number} onOpen={() => alert(`open ${order.number}`)}>
                    <TableCell className="pl-4"><Mono upper>{order.number}</Mono> <StatusPill status={order.channel} dot={false} className="ml-1" /></TableCell>
                    <TableCell><span className="flex items-center gap-2"><GradientAvatar name={order.customer} size="xs" />{order.customer}</span></TableCell>
                    <TableCell><StatusPill status={order.status} kind="order" /></TableCell>
                    <TableCell className="ledger text-right"><Money value={order.total} animate={false} /></TableCell>
                    <TableCell className="pr-4 text-right"><Button variant="ghost" size="icon-xs" aria-label="Delete" onClick={() => setConfirm(true)}><Trash2 /></Button></TableCell>
                  </DataTableRow>
                ))}
              </TableBody>
            </Table>
          </DataTable>
          <PaginationBar page={page} pageCount={12} pageSize={20} total={231} noun="orders" onPage={setPage} onPageSize={() => {}} />
        </SectionCard>
      </Section>

      <Section title="Timeline and stepper">
        <div className="grid gap-6 md:grid-cols-2">
          <SectionCard title="Order history">
            <Timeline
              current="3"
              items={[
                { id: "1", title: "Order placed", at: new Date(NOW - 3 * DAY).toISOString(), tone: "success" },
                { id: "2", title: "Invoice issued", description: "INV-2026-0421", at: new Date(NOW - 3 * DAY + 6e4).toISOString(), tone: "success" },
                { id: "3", title: "Courier booked", description: "Delhivery · AWB 1234567890", at: new Date(NOW - 2 * DAY).toISOString(), icon: Package },
                { id: "4", title: "Stock out", delta: -12, balance: 38, at: new Date(NOW - 1 * DAY).toISOString() },
              ]}
            />
          </SectionCard>
          <SectionCard title="Registration">
            <Stepper steps={[{ id: "a", label: "Sign up", state: "done" }, { id: "b", label: "Details", state: "done" }, { id: "c", label: "Verification", state: "current", description: "Reviewed within a day" }, { id: "d", label: "Test", state: "upcoming" }]} />
            <div className="mt-6">
              <Stepper orientation="vertical" steps={[{ id: "a", label: "Placed", state: "done", at: "3 Oct" }, { id: "b", label: "Packed", state: "done", at: "4 Oct" }, { id: "c", label: "Shipped", state: "current" }, { id: "d", label: "Delivered", state: "upcoming" }, { id: "e", label: "Returned", state: "skipped" }]} />
            </div>
          </SectionCard>
        </div>
      </Section>

      <Section title="Detail list and progress">
        <div className="grid gap-6 md:grid-cols-3">
          <SectionCard title="Order summary">
            <DetailList
              items={[{ label: "Items (3)", value: <Money value={1180} animate={false} /> }, { label: "Delivery", value: "Free", tone: "success" }, { label: "Coupon WELCOME10", value: <Money value={-118} animate={false} /> }, { label: "Tracking", value: "1234567890", mono: true, copyable: true }]}
              savings="You save ₹118"
              total={{ label: "Total", value: <Money value={1062} />, note: "incl. GST" }}
            />
          </SectionCard>
          <SectionCard title="Customer">
            <DetailList columns={2} items={[{ label: "Name", value: "Asha Verma" }, { label: "Phone", value: "+91 98765 43210", mono: true, copyable: "9876543210" }, { label: "City", value: "Pune" }, { label: "Orders", value: "12" }]} />
          </SectionCard>
          <SectionCard title="Stock health">
            <div className="flex flex-col gap-6">
              <ProgressRing value={842} max={1000} sublabel="in stock" segments={[{ value: 842, tone: "success", label: "In stock" }, { value: 98, tone: "warning", label: "Running low" }, { value: 60, tone: "danger", label: "Out" }]} />
              <ProgressBar value={620} max={999} tone="terracotta" gradient label="Add ₹379 more for free delivery" hint="₹620 of ₹999" size="md" />
            </div>
          </SectionCard>
        </div>
      </Section>

      <Section title="Form fields">
        <SectionCard title="Sign in" number={1}>
          <div className="grid gap-5 md:grid-cols-2">
            <FormField label="Mobile number" hint="We will text a code">{(id) => <PhoneField id={id} value={phone} onChange={setPhone} />}</FormField>
            <FormField label="Password" optional>{(id) => <PasswordField id={id} placeholder="At least 8 characters" />}</FormField>
            <FormField label="Code" error={otp.length === 6 && otp !== "123456" ? "That code is not right" : undefined}><OtpField value={otp} onChange={setOtp} /></FormField>
            <FormField label="Full name">{(id) => <Input id={id} className="h-10" placeholder="As on your ID" />}</FormField>
            <CheckboxRow bordered label="Remember this device" hint="Stay signed in for 30 days" checked={tick} onCheckedChange={setTick} />
            <SwitchRow bordered label="Email me order updates" checked={!tick} onCheckedChange={(v) => setTick(!v)} />
            <div className="flex items-center gap-4">
              <QuantityStepper value={qty} onChange={setQty} max={10} labelNoun="bottle" />
              <QuantityStepper value={qty} onChange={setQty} size="lg" labelNoun="bottle" />
              <Button loading>Saving</Button>
              <Button variant="outline" disabled>Disabled</Button>
            </div>
          </div>
        </SectionCard>
      </Section>

      <Section title="Empty states and illustrations">
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyState illustration="cart" title="Your cart is empty" description="Medicines you add will wait here." action={<Button>Browse medicines</Button>} bordered />
          <EmptyState variant="error" title="Could not load orders" onRetry={() => {}} bordered />
          <EmptyState variant="locked" title="Not part of your role" links={[{ label: "Orders", href: "#" }, { label: "Returns", href: "#" }]} bordered />
        </div>
        <EmptyState size="sm" icon={Bell} title="All caught up" description="Nothing needs attention right now." bordered />
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {ILLUSTRATION_NAMES.map((name) => (
            <div key={name} className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-foreground/18 p-3">
              <Illustration name={name} size={96} />
              <Eyebrow as="span">{name}</Eyebrow>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Avatars and loaders">
        <div className="flex flex-wrap items-center gap-4">
          {["Asha Verma", "Dr. Rakesh Nair", "Meera Pillai", "Sunil Rao", "Kozmo", "Admin"].map((name, i) => (
            <GradientAvatar key={name} name={name} size={(["xs", "sm", "md", "lg", "xl", "hero"] as const)[i]} ring={i === 1 ? "terracotta" : undefined} status={i === 3 ? "success" : undefined} />
          ))}
          <Spinner size="lg" /><Button variant="outline"><ButtonSpinner /> Loading</Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3"><StatSkeleton /><CardSkeleton /><ListSkeleton rows={3} avatar /></div>
        <div className="rounded-xl border"><TableSkeleton rows={3} /></div>
      </Section>

      <Section title="Dialogs">
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" onClick={() => setConfirm(true)}>Delete order</Button>
          <Button variant="outline" onClick={() => setReason(true)}>Reject with reason</Button>
          <Button onClick={() => setForm(true)}>Add a brand</Button>
        </div>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this order?" description="It will be gone for good, and the stock will not come back." tone="destructive" confirmLabel="Delete" onConfirm={() => setConfirm(false)} />
        <ReasonDialog open={reason} onOpenChange={setReason} title="Reject this doctor?" description="The doctor will see the reason you give." confirmLabel="Reject" placeholder="What is missing or wrong" onConfirm={() => setReason(false)} />
        <FormDialog open={form} onOpenChange={setForm} title="Add a brand" formId="brand-form" submitLabel="Add brand" onSubmit={(e) => { e.preventDefault(); setForm(false); }}>
          <div className="space-y-4">
            <FormField label="Name">{(id) => <Input id={id} placeholder="SBL, Dr. Reckeweg…" />}</FormField>
            <FormField label="Website" optional>{(id) => <Input id={id} placeholder="https://" />}</FormField>
          </div>
        </FormDialog>
      </Section>

      <Section title="Icons in tiles">
        <div className="flex flex-wrap gap-3">
          <Callout tone="plum" icon={Stethoscope} title="Wholesale account" compact>Doctor tier · 15% off every medicine</Callout>
          <Callout tone="terracotta" icon={CalendarClock} compact>Next consultation in 2 hours</Callout>
        </div>
      </Section>
    </div>
  );
}
