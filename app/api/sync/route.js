// app/api/sync/route.js
// Pulls the bulk order list from BrickLink and stores/updates orders.
// Only uses summary fields (item total, grand total, status, dates) - the
// bulk endpoint doesn't provide shipping/tax/country breakdown anyway
// (that requires a slow per-order detail call, which we've dropped since
// item total is all that's needed here).

import { PrismaClient } from "@prisma/client";
import { fetchOrders } from "@/lib/bricklink";

const prisma = new PrismaClient();

function extractFields(order) {
  const cost = order.cost || {};
  return {
    itemTotal: parseFloat(cost.subtotal || 0),
    grandTotal: parseFloat(cost.grand_total || 0),
    uniqueCount: order.unique_count || 1,
  };
}

export async function POST() {
  try {
    const results = { in: 0, out: 0 };

    for (const direction of ["in", "out"]) {
      const orders = await fetchOrders(direction);

      for (const order of orders) {
        const fields = extractFields(order);

        await prisma.order.upsert({
          where: { blOrderId: order.order_id },
          update: {
            status: order.status,
            currencyCode: order.cost.currency_code,
            ...fields,
            rawJson: JSON.stringify(order),
            syncedAt: new Date(),
          },
          create: {
            blOrderId: order.order_id,
            direction,
            status: order.status,
            dateOrdered: new Date(order.date_ordered),
            buyerOrSeller: direction === "in" ? order.buyer_name : order.seller_name,
            currencyCode: order.cost.currency_code,
            ...fields,
            rawJson: JSON.stringify(order),
          },
        });
      }

      await prisma.syncLog.create({ data: { direction, ordersFound: orders.length } });
      results[direction] = orders.length;
    }

    return Response.json({ success: true, results });
  } catch (err) {
    console.error(err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
