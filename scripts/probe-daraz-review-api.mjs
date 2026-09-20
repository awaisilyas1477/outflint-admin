/**
 * Try known Daraz/Lazada review API endpoints for an item.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const itemId = process.argv[2] || "563842089";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const endpoints = [
  `https://my.daraz.pk/p/review/get_list?itemId=${itemId}&pageSize=20&filter=0&sort=0&pageNo=1`,
  `https://my.daraz.pk/p/review/item/list?itemId=${itemId}&pageSize=20&pageNo=1`,
  `https://www.daraz.pk/p/review/get_list?itemId=${itemId}&pageSize=20&pageNo=1`,
  `https://acs-m.daraz.pk/h5/mtop.global.social.ugc.review.list/1.0/?data=%7B%22itemId%22%3A%22${itemId}%22%2C%22pageSize%22%3A20%2C%22pageNo%22%3A1%7D`,
  `https://www.daraz.pk/rate/getProductItemReviews.htm?itemId=${itemId}&pageSize=20&pageNo=1`,
  `https://my.daraz.pk/rate/getProductItemReviews.htm?itemId=${itemId}&pageSize=20&pageNo=1`,
];

const results = [];
for (const url of endpoints) {
  try {
    const body = execSync(
      `curl.exe -sL -A "${UA}" -H "Accept: application/json,text/plain,*/*" -H "Referer: https://www.daraz.pk/" "${url}"`,
      { timeout: 60000, encoding: "utf8", maxBuffer: 5_000_000 },
    );
    const snippet = body.slice(0, 400).replace(/\s+/g, " ");
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* not json */
    }
    results.push({
      url,
      len: body.length,
      snippet,
      keys: parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 20) : null,
      modelKeys:
        parsed?.model && typeof parsed.model === "object"
          ? Object.keys(parsed.model).slice(0, 20)
          : null,
      dataKeys:
        parsed?.data && typeof parsed.data === "object"
          ? Object.keys(parsed.data).slice(0, 20)
          : null,
    });
    console.log("OK", url.slice(0, 80), "len", body.length, "keys", results.at(-1).keys);
  } catch (e) {
    results.push({ url, error: String(e.message || e) });
    console.log("FAIL", url.slice(0, 80), e.message);
  }
}

writeFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), ".daraz-review-api-probe.json"),
  JSON.stringify(results, null, 2),
);
