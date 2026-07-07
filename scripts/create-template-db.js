// scripts/create-template-db.js
// Builds a fresh, EMPTY SQLite database (all tables created, zero rows) to
// ship alongside the packaged app. On first launch, electron/main.js copies
// this into the user's real data folder - that's how a real end user gets
// working tables without ever needing Prisma's CLI installed.
//
// Re-run this (it's wired into `npm run build:standalone` automatically)
// whenever prisma/schema.prisma changes, so the template stays in sync.

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const templatePath = path.join(root, "prisma", "template.db");

if (fs.existsSync(templatePath)) fs.unlinkSync(templatePath);

console.log("Building a clean template database...");
execSync("npx prisma db push --skip-generate", {
  cwd: root,
  env: { ...process.env, DATABASE_URL: `file:${templatePath}` },
  stdio: "inherit",
});

console.log("Template database created at prisma/template.db (schema only, no data)");