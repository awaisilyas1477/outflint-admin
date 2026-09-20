const url =
  "https://www.simplecartstore.com/products/imported-electric-kettle-2l-1500w-stainless-steel-with-advanced-automatic-switch?nocache=" +
  Date.now();
const h = await (await fetch(url, { cache: "no-store" })).text();
const idx = h.search(/6,?000/);
console.log("snippet", h.slice(Math.max(0, idx - 250), idx + 350).replace(/\s+/g, " "));
console.log({
  has7400: h.includes("7,400") || h.includes("7400"),
  has6000: h.includes("6,000") || h.includes("6000"),
  hasOff: h.includes("OFF"),
  hasLineThrough: h.includes("line-through"),
});

const draft =
  "https://www.simplecartstore.com/products/crystal-lamp-rose-diamond-table-lamp-16-colors-rgb-with-touch-and-remote-control-k8fr?nocache=" +
  Date.now();
const r = await fetch(draft, { cache: "no-store", redirect: "manual" });
const ht = await r.text();
console.log({
  draftStatus: r.status,
  draftTitle: (ht.match(/<title>([^<]+)/i) || [])[1],
});
