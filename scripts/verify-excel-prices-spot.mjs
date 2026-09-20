import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const e = loadEnvFile(resolve(root, "../../w-cartstore-web/e-commerce-website/.env"));
const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);

const checks = [
  { name: "1.2L Multifunction Electric Kettle", want: [{ price: 1899 }] },
  {
    name: "Wavy Bow Glass Tumbler with Bamboo Lid & Glass",
    want: [
      { style: "Simple mug", price: 899 },
      { style: "Line mug", price: 999 },
    ],
  },
  {
    name: "Slim Flask with Leather Bag",
    want: [
      { size: "500 ml", price: 1699 },
      { size: "1000 ml with bag", price: 2199 },
    ],
  },
  {
    name: "2-Speed Electric Meat Grinder",
    want: [
      { size: "2 litter", price: 3499 },
      { size: "3 litter", price: 4199 },
      { size: "5 litter", price: 4999 },
    ],
  },
  {
    name: "Electric Mosquito Insect Killer",
    want: [
      { power: "20w", price: 3999 },
      { power: "30w", price: 4599 },
      { power: "40w", price: 4999 },
    ],
  },
  {
    name: "24-Piece Golden Cutlery Set",
    want: [
      { color: "Full Golden", price: 5499 },
      { color: "Black Golden", price: 6499 },
    ],
  },
  { name: "Pink Comb and Mirror Set", want: [{ price: 799 }] },
];

const failures = [];
for (const c of checks) {
  const { data: p } = await sb.from("products").select("id,name").eq("name", c.name).maybeSingle();
  if (!p) {
    failures.push({ product: c.name, error: "not found" });
    continue;
  }
  const { data: vars } = await sb
    .from("product_variants")
    .select("sku,price,option_values")
    .eq("product_id", p.id);
  console.log(`\n${c.name}`);
  for (const v of vars ?? []) console.log(" ", v.sku, v.price, v.option_values);

  if (c.want.length === 1 && !c.want[0].style && !c.want[0].size) {
    for (const v of vars ?? []) {
      if (Number(v.price) !== c.want[0].price) {
        failures.push({ product: c.name, sku: v.sku, got: v.price, want: c.want[0].price });
      }
    }
    continue;
  }

  for (const w of c.want) {
    const key = w.style ? "style" : w.size ? "size" : w.power ? "power" : w.color ? "color" : "option";
    const label = w.style || w.size || w.power || w.color || w.option;
    const found = (vars ?? []).find((v) => {
      const ov = v.option_values ?? {};
      const val = String(ov[key] ?? "");
      if (val.toLowerCase() !== label.toLowerCase()) {
        const any = Object.values(ov).some(
          (x) => String(x).toLowerCase() === label.toLowerCase(),
        );
        if (!any) return false;
      }
      return Number(v.price) === w.price;
    });
    if (!found) failures.push({ product: c.name, label, want: w, vars });
  }
}

if (failures.length) {
  console.log("\nFAILURES", JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("\nAll spot checks passed.");
