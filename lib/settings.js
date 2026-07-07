// lib/settings.js
// Reads/writes the single Settings row that holds BrickLink API credentials
// and the store name - entered via the in-app Setup screen rather than a
// .env file, so the packaged desktop app needs zero manual configuration.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getSettings() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return (
    settings || {
      id: 1,
      consumerKey: "",
      consumerSecret: "",
      tokenValue: "",
      tokenSecret: "",
      storeName: "",
    }
  );
}

export async function isConfigured() {
  const s = await getSettings();
  return Boolean(s.consumerKey && s.consumerSecret && s.tokenValue && s.tokenSecret);
}

export async function saveSettings(data) {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
}
