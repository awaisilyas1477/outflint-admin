const res = await fetch("https://www.simplecartstore.com/");
const html = await res.text();
const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
const desc = (html.match(/name="description" content="([^"]*)"/i) || [])[1];
console.log("HOME title:", title);
console.log("HOME desc:", desc);

const p = await fetch(
  "https://www.simplecartstore.com/products/tumbler-bottle-1200ml",
);
const ph = await p.text();
console.log("PDP status", p.status);
console.log("PDP title:", (ph.match(/<title>([^<]*)<\/title>/i) || [])[1]);
console.log(
  "PDP desc:",
  (ph.match(/name="description" content="([^"]*)"/i) || [])[1],
);

const sm = await fetch("https://www.simplecartstore.com/sitemap.xml");
console.log("sitemap", sm.status);
