const res = await fetch("https://www.simplecartstore.com/sitemap.xml", {
  cache: "no-store",
});
const xml = await res.text();
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const products = locs.filter((u) => u.includes("/products/"));
const collections = locs.filter((u) => u.includes("/collections"));
const policies = locs.filter(
  (u) =>
    !u.includes("/products/") &&
    !u.includes("/collections") &&
    u.replace(/\/$/, "") !== "https://www.simplecartstore.com",
);
const home = locs.filter(
  (u) => u.replace(/\/$/, "") === "https://www.simplecartstore.com",
);

console.log("sitemap status:", res.status);
console.log("total <loc>:", locs.length);
console.log("home:", home.length);
console.log("products:", products.length);
console.log("collections-ish:", collections.length);
console.log("other:", policies.length);
console.log("sample other:");
for (const u of policies.slice(0, 15)) console.log(" ", u);
