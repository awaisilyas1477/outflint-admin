import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const url = "https://www.daraz.pk/products/16-rgb-usb-i911993176-s3953711485.html";
const tmp = resolve(tmpdir(), `dcheck-${Date.now()}.html`);
execSync(`curl.exe -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" "${url}" -o "${tmp}"`, {
  timeout: 120000,
  stdio: "pipe",
});
const html = readFileSync(tmp, "utf8");
unlinkSync(tmp);
const m = html.match(/var __moduleData__ = (\{[\s\S]*?\});\s*\n/);
if (!m) {
  console.log("no moduleData", html.length);
  process.exit(0);
}
const mod = JSON.parse(m[1]);
const skuInfos = mod?.data?.root?.fields?.skuInfos || {};
const first = Object.values(skuInfos)[0];
writeFileSync("scripts/.daraz-price-sample.json", JSON.stringify(first?.price ?? first ?? {}, null, 2));
console.log(JSON.stringify(first?.price ?? null, null, 2));
const hits = [...html.matchAll(/"originalPrice"[^}]{0,120}/g)].slice(0, 5).map((x) => x[0]);
console.log("originalPrice hits:", hits);
