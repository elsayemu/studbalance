// app/api/orders/route.js
// GET /api/orders?from=...&to=...&currency=CAD
// Returns orders + expenses in range, a summary (based on ITEM TOTAL only -
// shipping and tax are pass-through, not profit - and excluding cancelled
// orders), and insights.

import { PrismaClient } from "@prisma/client";
import { getExchangeRate } from "@/lib/currency";

const prisma = new PrismaClient();

function isCancelled(status) {
  const s = status?.toUpperCase() || "";
  return s === "CANCELLED" || s === "CANCELED";
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Converts every dollar figure on an order using ONE rate lookup
// (they all share the same original currency + date).
async function withConversion(o, dateField, displayCurrency) {
  let rate = 1;
  let conversionOk = true;
  try {
    rate = await getExchangeRate(o[dateField], o.currencyCode, displayCurrency);
  } catch (err) {
    conversionOk = false;
    console.warn(`Rate lookup failed (${o.currencyCode}->${displayCurrency}):`, err.message);
  }
  return {
    ...o,
    conversionOk,
    convertedItemTotal: (o.itemTotal ?? 0) * rate,
    convertedShipping: (o.shippingCost ?? 0) * rate,
    convertedTax: (o.taxAmount ?? 0) * rate,
    convertedGrandTotal: (o.grandTotal ?? 0) * rate,
    converted: (o.grandTotal ?? o.amount ?? 0) * rate, // kept for expenses (amount) compatibility
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = new Date(searchParams.get("from") || "2000-01-01");
    const to = new Date(searchParams.get("to") || new Date().toISOString());
    const displayCurrency = searchParams.get("currency") || "CAD";

    const orders = await prisma.order.findMany({
      where: { dateOrdered: { gte: from, lte: to } },
      orderBy: { dateOrdered: "desc" },
    });
    const expenses = await prisma.expense.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
    });
    const lastSync = await prisma.syncLog.findFirst({ orderBy: { syncedAt: "desc" } });

    const ordersWithConversion = [];
    for (const o of orders) {
      const converted = await withConversion(o, "dateOrdered", displayCurrency);
      ordersWithConversion.push({ ...converted, cancelled: isCancelled(o.status) });
    }

    const expensesWithConversion = [];
    for (const e of expenses) {
      let rate = 1, conversionOk = true;
      try {
        rate = await getExchangeRate(e.date, e.currencyCode, displayCurrency);
      } catch (err) {
        conversionOk = false;
        console.warn(`Rate lookup failed for expense ${e.id}:`, err.message);
      }
      expensesWithConversion.push({ ...e, converted: e.amount * rate, conversionOk });
    }

    // --- Summary: Sales = item total (shipping/tax you charge roughly
    // offsets your own shipping cost - a wash). Purchases = order total
    // (grand total) since that's the actual cash you spend, tax and
    // shipping included. Cancelled orders excluded from both. ---
    const summary = { sales: 0, purchases: 0, other: 0 };
    ordersWithConversion.forEach((o) => {
      if (o.cancelled) return;
      if (o.direction === "in") summary.sales += o.convertedItemTotal;
      else summary.purchases += o.convertedGrandTotal;
    });
    expensesWithConversion.forEach((e) => (summary.other += e.converted));
    summary.net = summary.sales - summary.purchases - summary.other;
    summary.currency = displayCurrency;

    // --- Insights (based on non-cancelled SALES orders) ---
    const salesOrders = ordersWithConversion.filter((o) => o.direction === "in" && !o.cancelled);

    const avgOrderValue = salesOrders.length
      ? salesOrders.reduce((sum, o) => sum + o.convertedGrandTotal, 0) / salesOrders.length
      : 0;

    // Average monthly expense (manual expenses only), based on the number
    // of calendar months actually spanned by the selected date range -
    // not just months that happened to have an expense in them.
    const totalOtherExpenses = expensesWithConversion.reduce((sum, e) => sum + e.converted, 0);
    const monthsInRange = Math.max(
      1,
      (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
    );
    const avgMonthlyExpense = totalOtherExpenses / monthsInRange;

    const countryCounts = {};
    salesOrders.forEach((o) => {
      const key = o.countryCode || "Unknown";
      countryCounts[key] = (countryCounts[key] || 0) + 1;
    });
    const ordersByCountry = Object.entries(countryCounts)
      .map(([country, count]) => ({ country, count, percent: (count / salesOrders.length) * 100 }))
      .sort((a, b) => b.count - a.count);

    const monthlyMap = {};
    ordersWithConversion.forEach((o) => {
      if (o.cancelled) return;
      const key = monthKey(o.dateOrdered);
      monthlyMap[key] ??= { month: key, sales: 0, purchases: 0, other: 0 };
      if (o.direction === "in") monthlyMap[key].sales += o.convertedItemTotal;
      else monthlyMap[key].purchases += o.convertedGrandTotal;
    });
    expensesWithConversion.forEach((e) => {
      const key = monthKey(e.date);
      monthlyMap[key] ??= { month: key, sales: 0, purchases: 0, other: 0 };
      monthlyMap[key].other += e.converted;
    });
    const monthlyProfit = Object.values(monthlyMap)
      .map((m) => ({ ...m, profit: m.sales - m.purchases - m.other }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const insights = { avgOrderValue, avgMonthlyExpense, ordersByCountry, monthlyProfit, currency: displayCurrency };

    return Response.json({ orders: ordersWithConversion, expenses: expensesWithConversion, summary, insights, lastSync });
  } catch (err) {
    console.error("orders route error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
