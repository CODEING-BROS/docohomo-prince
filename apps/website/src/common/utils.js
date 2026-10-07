export function formatCurrency(num, to = 2, currency = "USD") {
  let newNum = Number.parseFloat(num).toFixed(to);
  switch (currency) {
    case "USD":
      return `₹${newNum}`;
    default:
      return `${newNum}VND`;
  }
}

export const formatDate = (dateString) => {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.getMonth() + 1; // Months are zero-indexed
  const year = date.getFullYear();

  // Pad single-digit day and month with leading zeros
  const formattedDay = day < 10 ? `0${day}` : day;
  const formattedMonth = month < 10 ? `0${month}` : month;

  return `${year}-${formattedMonth}-${formattedDay}`;
};  


export function formatSingleNumber(n) {
  return n > 9 ? "" + n : "0" + n;
}

export function convertToSlug(title, id) {
  const renderId = id ? "-" + id : "";
  return title ? title.replace(/ /g, "-").toLowerCase() + renderId : "";
}

export function renderContainer(type) {
  switch (type) {
    case "wide":
      return "container-full-half";
    case "full":
      return "container-full";
    default:
      return "container";
  }
}
