import { format } from "date-fns";
import { getTimeZone, zoneShortName } from "@/lib/timezone";

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const rupeesExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en-IN");

export const formatMoney = (value: number) => rupees.format(value);
export const formatMoneyExact = (value: number) => rupeesExact.format(value);
export const formatCompact = (value: number) => compact.format(value);
export const formatNumber = (value: number) => plain.format(value);

// Times are shown in the timezone picked in the header (India by default), not the device's own.
const formatters = new Map<string, { day: Intl.DateTimeFormat; time: Intl.DateTimeFormat }>();
const formatterFor = (zone: string) => {
  let found = formatters.get(zone);
  if (!found) {
    found = {
      day: new Intl.DateTimeFormat("en-IN", { timeZone: zone, day: "numeric", month: "short", year: "numeric" }),
      time: new Intl.DateTimeFormat("en-IN", { timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true }),
    };
    formatters.set(zone, found);
  }
  return found;
};

export const formatDate = (value: string | Date) => formatterFor(getTimeZone()).day.format(new Date(value));
export const formatDateTime = (value: string | Date) => {
  const zone = getTimeZone();
  const { day, time } = formatterFor(zone);
  return `${day.format(new Date(value))}, ${time.format(new Date(value)).toUpperCase()} ${zoneShortName(zone)}`;
};

/** yyyy-MM-dd, the date format the API takes. */
export const toDay = (value: Date) => format(value, "yyyy-MM-dd");

/** "OUT_FOR_DELIVERY" -> "Out for delivery" */
export const humanize = (value: string) => {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Old product names are stored in lower case; show them in title case. */
export const titleCase = (value: string) => value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
