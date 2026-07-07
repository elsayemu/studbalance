// scripts/prepare-standalone.js
// Next.js's "standalone" output doesn't automatically include static
// assets - those need to be copied in manually. (Dependency resolution
// itself is handled differently: the packaged app uses NODE_PATH to point
// at electron-builder's own correctly-bundled node_modules, since
// electron-builder's extraResources strips node_modules folders no matter
// how it's configured - see electron/main.js for details.) Run this after
// `next build`.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const real = fs.realpathSync(s);
      if (fs.statSync(real).isDirectory()) copyDir(real, d);
      else fs.copyFileSync(real, d);
    } else if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

console.log("Copying static assets into standalone build...");
copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copyDir(path.join(root, "public"), path.join(standalone, "public"));

console.log("Copying Prisma schema (needed for `prisma db push` on first run)...");
copyDir(path.join(root, "prisma"), path.join(standalone, "prisma"));

// Prisma's GENERATED client (the actual query engine tailored to your
// schema) lives at node_modules/.prisma/client. 
console.log("Copying Prisma's generated client (avoiding the node_modules name)...");
copyDir(path.join(root, "node_modules", ".prisma"), path.join(standalone, "prisma-support", ".prisma"));

console.log("Copying the empty template database...");
const templateSrc = path.join(root, "prisma", "template.db");
if (fs.existsSync(templateSrc)) {
  fs.copyFileSync(templateSrc, path.join(standalone, "template.db"));
} else {
  console.warn("  ! prisma/template.db not found - run `npm run db:template` first");
}

console.log("Done. Standalone build is ready at .next/standalone");
console.log("(Regular node_modules is intentionally NOT copied - the packaged app");
console.log(" resolves most dependencies via NODE_PATH into electron-builder's own");
console.log(" bundle, plus this special-cased Prisma client folder. See electron/main.js.)");