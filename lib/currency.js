// lib/currency.js
// Converts amounts between currencies using historical daily rates from
// the Frankfurter API (api.frankfurter.dev) - free, no API key, no rate
// limit, ECB-sourced rates going back to 1999. We cache each date/currency
// pair we look up in the ExchangeRate table so repeat conversions
// (e.g. re-loading the dashboard) don't re-hit the API every time.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Frankfurter has no rates before this - if an order predates it
// (extremely unlikely for BrickLink), we fall back to this earliest date.
const EARLIEST_SUPPORTED_DATE = "1999-01-04";

function toDateString(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

// Returns the multiplier to convert 1 unit of `from` into `to`, for the
// given date. Returns 1 if from === to.
export async function getExchangeRate(dateInput, from, to) {
  if (from === to) return 1;

  let dateStr = toDateString(dateInput);
  if (dateStr < EARLIEST_SUPPORTED_DATE) dateStr = EARLIEST_SUPPORTED_DATE;

  const cached = await prisma.exchangeRate.findUnique({
    where: { date_fromCurrency_toCurrency: { date: dateStr, fromCurrency: from, toCurrency: to } },
  });
  if (cached) return cached.rate;

  const url = `https://api.frankfurter.dev/v1/${dateStr}?base=${from}&symbols=${to}`;
  const res = await fetch(url);
  const json = await res.json();

  const rate = json?.rates?.[to];
  if (!rate) {
    throw new Error(`Could not get exchange rate for ${from} -> ${to} on ${dateStr}`);
  }

  await prisma.exchangeRate.upsert({
    where: { date_fromCurrency_toCurrency: { date: dateStr, fromCurrency: from, toCurrency: to } },
    update: { rate },
    create: { date: dateStr, fromCurrency: from, toCurrency: to, rate },
  });

  return rate;
}

// Converts a single amount on a given date.
export async function convertAmount(amount, dateInput, from, to) {
  const rate = await getExchangeRate(dateInput, from, to);
  return amount * rate;
}
