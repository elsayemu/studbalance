// app/api/expenses/route.js
// POST { date, description, category, amount, currencyCode } to add
// a manual expense (things BrickLink doesn't know about).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request) {
  const body = await request.json();

  const expense = await prisma.expense.create({
    data: {
      date: new Date(body.date),
      description: body.description,
      category: body.category,
      amount: parseFloat(body.amount),
      currencyCode: body.currencyCode || "CAD",
    },
  });

  return Response.json({ success: true, expense });
}
