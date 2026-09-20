import { readFileSync } from "node:fs";
const h = readFileSync(
  "C:/Users/waqar ilyas/.cursor/projects/c-Users-waqar-ilyas-Desktop-w-cartstore-admin-e-commerce-admin/agent-tools/7ff6c3b0-6d56-496d-b5fc-ffc85bd4c1a7.txt",
  "utf8",
);
const m = h.match(/([0-9.]+)<!-- -->\/5 \(<!-- -->(\d+)/);
console.log("rating match", m && m.slice(1));
console.log("has 4.7", h.includes("4.7"));
console.log("has 378", h.includes("378"));
console.log("has daraz:", h.includes("daraz:"));
console.log("has 2025-11-20", h.includes("2025-11-20"));
console.log("has lzd-u", h.includes("lzd-u.slatic.net"));
