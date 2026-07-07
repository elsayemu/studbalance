// app/api/expenses/[id]/route.js
// DELETE /api/expenses/123 - removes a single manual expense.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await prisma.expense.delete({ where: { id: parseInt(id) } });
    return Response.json({ success: true });
  } catch (err) {
    console.error("delete expense error:", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
