import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const p = resolve(
  "C:/Users/waqar ilyas/.cursor/projects/c-Users-waqar-ilyas-Desktop-w-cartstore-admin-e-commerce-admin/agent-transcripts/8d83abff-7396-4901-828f-9bbea1a7e3ea/8d83abff-7396-4901-828f-9bbea1a7e3ea.jsonl",
);
const text = readFileSync(p, "utf8");

// Match full Daraz product URLs, including slug-less "/-iNNNN-sNNNN.html"
const re = /https:\/\/www\.daraz\.pk\/products\/(?:[^"'\\\s<>?]*?)?-i\d+-s\d+\.html/gi;
const found = text.match(re) || [];
const clean = [
  ...new Set(
    found
      .map((u) => u.replace(/\\+/g, "").split("?")[0].replace(/\/+$/, ""))
      .filter((u) => /-i\d+-s\d+\.html$/i.test(u)),
  ),
];
clean.sort();
writeFileSync(resolve("scripts/.daraz-source-urls.json"), JSON.stringify(clean, null, 2));
console.log("unique urls", clean.length);
for (const u of clean) console.log(u);
