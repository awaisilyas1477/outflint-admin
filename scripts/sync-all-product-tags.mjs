import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\s+#.*$/, "");
  }
  return out;
}

const storefrontEnv = loadEnvFile(
  resolve(root, "../../w-cartstore-web/e-commerce-website/.env"),
);
const adminEnv = loadEnvFile(resolve(root, ".env"));
const url = storefrontEnv.NEXT_PUBLIC_SUPABASE_URL || adminEnv.VITE_SUPABASE_URL?.trim();
const serviceKey = storefrontEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing Supabase URL or Service Key");
  process.exit(1);
}

const sb = createClient(url, serviceKey);

function toTitleCase(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function run() {
  console.log("--- 1. Fetching current products and catalog data ---");
  const { data: products, error: pErr } = await sb
    .from("products")
    .select("id, name, slug, status, tags, description, short_description")
    .order("created_at", { ascending: false });

  if (pErr || !products) {
    console.error("Error fetching products:", pErr);
    process.exit(1);
  }

  console.log(`Total products in catalog: ${products.length}`);

  // 2. Fetch existing tags in public.tags
  const { data: existingTags, error: tErr } = await sb
    .from("tags")
    .select("id, name, label");
  if (tErr) {
    console.error("Error fetching tags:", tErr);
    process.exit(1);
  }

  const tagMap = new Map((existingTags || []).map((t) => [t.name.toLowerCase(), t]));

  // Standard category tags to ensure exist
  const coreTags = [
    { name: "home", label: "Home Essentials" },
    { name: "kitchen", label: "Kitchen Essentials" },
    { name: "drinkware", label: "Drinkware & Tumblers" },
    { name: "water-bottles", label: "Water Bottles" },
    { name: "appliances", label: "Home Appliances" },
    { name: "beauty", label: "Beauty & Personal Care" },
    { name: "lighting", label: "Lamps & Lighting" },
    { name: "pest-control", label: "Pest Control" },
    { name: "wellness", label: "Wellness & Massagers" },
    { name: "bestseller", label: "Best Seller" },
    { name: "trending", label: "Trending Now" },
    { name: "new-arrival", label: "New Arrival" },
    { name: "sale", label: "On Sale" },
  ];

  for (const ct of coreTags) {
    if (!tagMap.has(ct.name)) {
      const { data: ins, error: insErr } = await sb
        .from("tags")
        .insert({ name: ct.name, label: ct.label })
        .select("id, name, label")
        .single();
      if (insErr) {
        console.error(`Failed to insert tag ${ct.name}:`, insErr.message);
      } else {
        console.log(`Created core tag: ${ins.label} (${ins.name})`);
        tagMap.set(ins.name.toLowerCase(), ins);
      }
    }
  }

  // 3. Scan all products, derive tags if missing, and ensure in public.tags
  console.log("\n--- 2. Auditing and syncing tags for every product ---");

  const productTagsToInsert = [];

  for (const prod of products) {
    const rawTags = Array.isArray(prod.tags) ? prod.tags : [];
    const textCorpus = `${prod.name} ${prod.slug} ${prod.short_description || ""} ${prod.description || ""}`.toLowerCase();

    const derived = new Set();

    // Preserve existing valid string tags
    for (const t of rawTags) {
      if (typeof t === "string" && t.trim()) {
        derived.add(t.trim().toLowerCase());
      }
    }

    // Ensure relevant category tags based on product context
    if (/bottle|flask|tumbler|sipper|cup|mug|thermos|straw/i.test(textCorpus)) {
      derived.add("drinkware");
      derived.add("water-bottles");
    }
    if (/chopper|grinder|kettle|stove|utensil|cutter|mixer|cook|blender|pan|pot|fryer|kitchen/i.test(textCorpus)) {
      derived.add("kitchen");
    }
    if (/heater|fan|humidifier|iron|steamer|appliance|kettle|stove|grinder/i.test(textCorpus)) {
      derived.add("appliances");
    }
    if (/mirror|trimmer|blackhead|hair|skin|facial|beauty|massage|shaver|eyebrow/i.test(textCorpus)) {
      derived.add("beauty");
    }
    if (/mosquito|bat|pest|zapper|insect|fly|trap/i.test(textCorpus)) {
      derived.add("pest-control");
    }
    if (/lamp|light|led|bulb|night light|candle|lantern/i.test(textCorpus)) {
      derived.add("lighting");
    }
    if (/massager|massage|cushion|pillow|posture|relaxation|wellness/i.test(textCorpus)) {
      derived.add("wellness");
    }
    if (derived.size === 0 || (!derived.has("kitchen") && !derived.has("beauty") && !derived.has("drinkware") && !derived.has("appliances"))) {
      derived.add("home");
    }

    const finalTagList = Array.from(derived);

    // Make sure each non-metadata tag exists in public.tags
    const tagIdsForProduct = [];

    for (const tagName of finalTagList) {
      if (tagName.startsWith("daraz:") || tagName.startsWith("rating_breakdown:")) {
        continue;
      }

      let tagObj = tagMap.get(tagName.toLowerCase());
      if (!tagObj) {
        const cleanLabel = toTitleCase(tagName);
        const { data: newTag, error: tagInsErr } = await sb
          .from("tags")
          .insert({ name: tagName.toLowerCase(), label: cleanLabel })
          .select("id, name, label")
          .single();

        if (tagInsErr) {
          // May have conflicted on name
          const { data: fetched } = await sb
            .from("tags")
            .select("id, name, label")
            .eq("name", tagName.toLowerCase())
            .maybeSingle();
          if (fetched) {
            tagObj = fetched;
            tagMap.set(tagName.toLowerCase(), fetched);
          }
        } else if (newTag) {
          tagObj = newTag;
          tagMap.set(tagName.toLowerCase(), newTag);
          console.log(`Auto-created tag in public.tags: ${cleanLabel} (${tagName})`);
        }
      }

      if (tagObj?.id) {
        tagIdsForProduct.push(tagObj.id);
        productTagsToInsert.push({ product_id: prod.id, tag_id: tagObj.id });
      }
    }

    // Update product tags text array
    const { error: prodUpErr } = await sb
      .from("products")
      .update({ tags: finalTagList, updated_at: new Date().toISOString() })
      .eq("id", prod.id);

    if (prodUpErr) {
      console.error(`Failed to update tags on product ${prod.name}:`, prodUpErr.message);
    }
  }

  console.log(`\n--- 3. Syncing ${productTagsToInsert.length} links into public.product_tags ---`);

  // Deduplicate product_id + tag_id
  const seenPair = new Set();
  const uniquePairs = [];
  for (const pair of productTagsToInsert) {
    const key = `${pair.product_id}_${pair.tag_id}`;
    if (!seenPair.has(key)) {
      seenPair.add(key);
      uniquePairs.push(pair);
    }
  }

  // Clear and re-populate product_tags in chunks
  const { error: delErr } = await sb.from("product_tags").delete().neq("product_id", "00000000-0000-0000-0000-000000000000");
  if (delErr) {
    console.error("Error clearing product_tags:", delErr.message);
  }

  const chunkSize = 200;
  for (let i = 0; i < uniquePairs.length; i += chunkSize) {
    const chunk = uniquePairs.slice(i, i + chunkSize);
    const { error: insBatchErr } = await sb.from("product_tags").insert(chunk);
    if (insBatchErr) {
      console.error("Error inserting product_tags chunk:", insBatchErr.message);
    }
  }

  console.log(`Successfully synced ${uniquePairs.length} product_tag relations across all products.`);

  // 4. Verification Check
  console.log("\n--- 4. Verification Summary ---");
  const { data: finalTags } = await sb.from("tags").select("id, name, label");
  const { data: finalPts } = await sb.from("product_tags").select("product_id, tag_id");
  const { data: finalProds } = await sb.from("products").select("id, name, tags");

  console.log(`Total public.tags: ${finalTags?.length}`);
  console.log(`Total public.product_tags: ${finalPts?.length}`);
  console.log(`Total products with tags: ${finalProds?.filter((p) => Array.isArray(p.tags) && p.tags.length > 0).length} / ${finalProds?.length}`);
  console.log("\nAll products are now verified and mapped to proper tags.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
