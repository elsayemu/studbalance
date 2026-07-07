// app/api/settings/route.js
// GET  -> { configured, storeName } - used on app load to decide whether
//         to show the Setup screen or the dashboard.
// POST -> tests the given BrickLink credentials actually work (by trying
//         a real API call) before saving them. Returns a clear error if
//         they don't, rather than silently saving bad keys.

import { getSettings, saveSettings, isConfigured } from "@/lib/settings";
import { testCredentials } from "@/lib/bricklink";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  const settings = await getSettings();
  const configured = await isConfigured();
  return Response.json({ configured, storeName: settings.storeName });
}

export async function POST(request) {
  const body = await request.json();
  const current = await getSettings();

  // --- Updating API credentials (initial setup, or switching stores) ---
  if (body.consumerKey !== undefined) {
    const { consumerKey, consumerSecret, tokenValue, tokenSecret } = body;
    if (!consumerKey || !consumerSecret || !tokenValue || !tokenSecret) {
      return Response.json({ success: false, error: "All 4 BrickLink API fields are required." }, { status: 400 });
    }

    await saveSettings({ consumerKey, consumerSecret, tokenValue, tokenSecret });

    try {
      await testCredentials();
    } catch (err) {
      // Roll back to whatever worked before, so a bad key doesn't lock the app out.
      await saveSettings({
        consumerKey: current.consumerKey,
        consumerSecret: current.consumerSecret,
        tokenValue: current.tokenValue,
        tokenSecret: current.tokenSecret,
      });
      return Response.json(
        { success: false, error: `Couldn't connect to BrickLink with these keys: ${err.message}` },
        { status: 400 }
      );
    }

    if (body.clearExistingData) {
      await prisma.order.deleteMany({});
      await prisma.syncLog.deleteMany({});
    }
  }

  // --- Updating store name (can happen on its own, no credential test needed) ---
  if (body.storeName !== undefined) {
    await saveSettings({ storeName: body.storeName });
  }

  return Response.json({ success: true });
}
