// next build --output=standalone produces .next/standalone with a minimal
// server, but it does NOT copy the `public/` folder or `.next/static` into
// it — those are expected to be served by a reverse proxy in Vercel's
// infra. On Railway (and anywhere else running the standalone server
// directly), you have to copy them in yourself or every CSS/JS/image
// request 404s in production even though `npm run dev` looked fine.
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(standalone)) {
  console.warn(
    "[copy-standalone-assets] .next/standalone not found — did `next build` run with output: \"standalone\" in next.config.ts?"
  );
  process.exit(0);
}

copyDir(path.join(root, "public"), path.join(standalone, "public"));
copyDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));

console.log("[copy-standalone-assets] Copied public/ and .next/static into .next/standalone");
