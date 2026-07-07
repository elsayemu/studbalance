// app/api/export/route.js
// GET /api/export?from=2024-01-01&to=2024-12-31&currency=CAD&format=xlsx
// format can be: xlsx (default), html, csv, xml.
// All formats show the same underlying data: sales, purchases, and manual
// expenses for the selected date range, with cancelled orders marked but
// excluded from totals.

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { getExchangeRate } from "@/lib/currency";

const prisma = new PrismaClient();

function isCancelled(status) {
  return status?.toUpperCase() === "CANCELLED";
}

async function gatherData(from, to, displayCurrency) {
  const orders = await prisma.order.findMany({
    where: { dateOrdered: { gte: from, lte: to } },
    orderBy: { dateOrdered: "asc" },
  });
  const expenses = await prisma.expense.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });

  const ordersWithConversion = [];
  for (const o of orders) {
    let rate = 1;
    try { rate = await getExchangeRate(o.dateOrdered, o.currencyCode, displayCurrency); } catch {}
    ordersWithConversion.push({
      ...o,
      cancelled: isCancelled(o.status),
      convertedItemTotal: o.itemTotal * rate,
      convertedGrandTotal: o.grandTotal * rate,
    });
  }
  const expensesWithConversion = [];
  for (const e of expenses) {
    let rate = 1;
    try { rate = await getExchangeRate(e.date, e.currencyCode, displayCurrency); } catch {}
    expensesWithConversion.push({ ...e, converted: e.amount * rate });
  }

  const totals = { sales: 0, purchases: 0, other: 0 };
  ordersWithConversion.forEach((o) => {
    if (o.cancelled) return;
    if (o.direction === "in") totals.sales += o.convertedItemTotal;
    else totals.purchases += o.convertedGrandTotal;
  });
  expensesWithConversion.forEach((e) => (totals.other += e.converted));
  totals.net = totals.sales - totals.purchases - totals.other;

  return { orders: ordersWithConversion, expenses: expensesWithConversion, totals };
}

// Flattens everything into one unified row list - used by CSV/XML/HTML,
// which show a single combined list rather than separate workbook sheets.
function buildUnifiedRows(orders, expenses, displayCurrency) {
  const rows = orders.map((o) => ({
    type: o.direction === "in" ? "Sale" : "Purchase",
    orderId: o.blOrderId,
    date: o.dateOrdered.toISOString().slice(0, 10),
    who: o.buyerOrSeller,
    status: o.cancelled ? `${o.status} (excluded)` : o.status,
    itemTotal: o.itemTotal.toFixed(2),
    originalCurrency: o.currencyCode,
    converted: o.convertedItemTotal.toFixed(2),
    orderTotal: o.grandTotal.toFixed(2),
  }));
  expenses.forEach((e) => {
    rows.push({
      type: "Expense",
      orderId: "",
      date: e.date.toISOString().slice(0, 10),
      who: e.description,
      status: e.category,
      itemTotal: e.amount.toFixed(2),
      originalCurrency: e.currencyCode,
      converted: e.converted.toFixed(2),
      orderTotal: "",
    });
  });
  return rows;
}

const CSV_HEADERS = ["Type", "Order ID", "Date", "Who", "Status", "Item Total", "Original Currency", `Converted`, "Order Total"];

function toCsvValue(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows, currency) {
  const header = CSV_HEADERS.map((h) => (h === "Converted" ? `Converted (${currency})` : h));
  const lines = [header.map(toCsvValue).join(",")];
  rows.forEach((r) => {
    lines.push(
      [r.type, r.orderId, r.date, r.who, r.status, r.itemTotal, r.originalCurrency, r.converted, r.orderTotal]
        .map(toCsvValue)
        .join(",")
    );
  });
  return lines.join("\r\n");
}

function xmlEscape(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildXml(rows, totals, currency, from, to) {
  const rowsXml = rows
    .map(
      (r) => `  <Record>
    <Type>${xmlEscape(r.type)}</Type>
    <OrderID>${xmlEscape(r.orderId)}</OrderID>
    <Date>${xmlEscape(r.date)}</Date>
    <Who>${xmlEscape(r.who)}</Who>
    <Status>${xmlEscape(r.status)}</Status>
    <ItemTotal>${xmlEscape(r.itemTotal)}</ItemTotal>
    <OriginalCurrency>${xmlEscape(r.originalCurrency)}</OriginalCurrency>
    <Converted currency="${xmlEscape(currency)}">${xmlEscape(r.converted)}</Converted>
    <OrderTotal>${xmlEscape(r.orderTotal)}</OrderTotal>
  </Record>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<BrickLinkExport from="${xmlEscape(from)}" to="${xmlEscape(to)}" currency="${xmlEscape(currency)}">
  <Summary>
    <Sales>${totals.sales.toFixed(2)}</Sales>
    <Purchases>${totals.purchases.toFixed(2)}</Purchases>
    <OtherExpenses>${totals.other.toFixed(2)}</OtherExpenses>
    <Net>${totals.net.toFixed(2)}</Net>
  </Summary>
  <Records>
${rowsXml}
  </Records>
</BrickLinkExport>`;
}

function buildHtml(rows, totals, currency, from, to) {
  const rowsHtml = rows
    .map(
      (r) => `<tr>
      <td>${xmlEscape(r.type)}</td>
      <td>${xmlEscape(r.orderId)}</td>
      <td>${xmlEscape(r.date)}</td>
      <td>${xmlEscape(r.who)}</td>
      <td>${xmlEscape(r.status)}</td>
      <td style="text-align:right">${xmlEscape(r.itemTotal)} ${xmlEscape(r.originalCurrency)}</td>
      <td style="text-align:right"><strong>${xmlEscape(r.converted)} ${xmlEscape(currency)}</strong></td>
      <td style="text-align:right">${xmlEscape(r.orderTotal)}</td>
    </tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>BrickLink Export ${from} to ${to}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 2rem; color: #1a1a1a; }
  h1 { font-size: 1.3rem; }
  .summary { margin: 1rem 0 2rem 0; }
  .summary div { display: flex; justify-content: space-between; max-width: 320px; padding: 4px 0; border-bottom: 1px solid #eee; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  th { background: #f4f4f4; }
  tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
  <h1>StudBalance Export</h1>
  <p>${from} to ${to} &middot; amounts converted to ${currency}</p>
  <div class="summary">
    <div><span>Sales</span><strong>${currency} ${totals.sales.toFixed(2)}</strong></div>
    <div><span>Purchases</span><strong>${currency} ${totals.purchases.toFixed(2)}</strong></div>
    <div><span>Other Expenses</span><strong>${currency} ${totals.other.toFixed(2)}</strong></div>
    <div><span>Net</span><strong>${currency} ${totals.net.toFixed(2)}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Type</th><th>Order ID</th><th>Date</th><th>Who</th><th>Status</th>
        <th>Item Total</th><th>Converted</th><th>Order Total</th>
      </tr>
    </thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get("from") || "2000-01-01";
    const toStr = searchParams.get("to") || new Date().toISOString().slice(0, 10);
    const from = new Date(fromStr);
    const to = new Date(toStr);
    const displayCurrency = searchParams.get("currency") || "CAD";
    const format = (searchParams.get("format") || "xlsx").toLowerCase();

    const { orders, expenses, totals } = await gatherData(from, to, displayCurrency);
    const filenameBase = `studbalance-export-${fromStr}-to-${toStr}`;

    if (format === "csv") {
      const rows = buildUnifiedRows(orders, expenses, displayCurrency);
      const csv = buildCsv(rows, displayCurrency);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
        },
      });
    }

    if (format === "xml") {
      const rows = buildUnifiedRows(orders, expenses, displayCurrency);
      const xml = buildXml(rows, totals, displayCurrency, fromStr, toStr);
      return new Response(xml, {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameBase}.xml"`,
        },
      });
    }

    if (format === "html") {
      const rows = buildUnifiedRows(orders, expenses, displayCurrency);
      const html = buildHtml(rows, totals, displayCurrency, fromStr, toStr);
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameBase}.html"`,
        },
      });
    }

    // --- Default: xlsx (multi-sheet workbook) ---
    const workbook = new ExcelJS.Workbook();

    const orderColumns = (whoLabel) => [
      { header: "Order ID", key: "id", width: 12 },
      { header: "Date", key: "date", width: 14 },
      { header: whoLabel, key: "who", width: 20 },
      { header: "Status", key: "status", width: 22 },
      { header: "Item Total", key: "itemTotal", width: 14 },
      { header: `Item Total (${displayCurrency})`, key: "convItem", width: 20 },
      { header: "Original Currency", key: "currency", width: 16 },
      { header: "Order Total", key: "total", width: 14 },
    ];
    const buildRow = (o) => ({
      id: o.blOrderId,
      date: o.dateOrdered.toISOString().slice(0, 10),
      who: o.buyerOrSeller,
      status: o.cancelled ? `${o.status} (excluded from totals)` : o.status,
      itemTotal: o.itemTotal,
      convItem: Number(o.convertedItemTotal.toFixed(2)),
      currency: o.currencyCode,
      total: o.grandTotal,
    });

    const salesSheet = workbook.addWorksheet("Sales (Income)");
    salesSheet.columns = orderColumns("Buyer");
    orders.filter((o) => o.direction === "in").forEach((o) => salesSheet.addRow(buildRow(o)));

    const purchasesSheet = workbook.addWorksheet("Purchases");
    purchasesSheet.columns = orderColumns("Seller");
    orders.filter((o) => o.direction === "out").forEach((o) => purchasesSheet.addRow(buildRow(o)));

    const expenseSheet = workbook.addWorksheet("Other Expenses");
    expenseSheet.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Description", key: "description", width: 30 },
      { header: "Category", key: "category", width: 20 },
      { header: "Original Currency", key: "currency", width: 16 },
      { header: "Original Amount", key: "amount", width: 16 },
      { header: `Converted (${displayCurrency})`, key: "converted", width: 20 },
    ];
    expenses.forEach((e) =>
      expenseSheet.addRow({
        date: e.date.toISOString().slice(0, 10),
        description: e.description,
        category: e.category,
        currency: e.currencyCode,
        amount: e.amount,
        converted: Number(e.converted.toFixed(2)),
      })
    );

    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Metric", key: "metric", width: 30 },
      { header: `Amount (${displayCurrency})`, key: "amount", width: 20 },
    ];
    summarySheet.addRow({ metric: "Total Sales (item total)", amount: Number(totals.sales.toFixed(2)) });
    summarySheet.addRow({ metric: "Total Purchases (order total incl. tax/shipping)", amount: Number(totals.purchases.toFixed(2)) });
    summarySheet.addRow({ metric: "Total Other Expenses", amount: Number(totals.other.toFixed(2)) });
    summarySheet.addRow({ metric: "Net", amount: Number(totals.net.toFixed(2)) });
    summarySheet.addRow({ metric: "Note", amount: "Cancelled orders excluded. Sales = item total; Purchases = full order total." });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("export route error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}