/**
 * Live SEO verification after strengthen.
 */
const ORIGIN = "https://www.simplecartstore.com";
const pages = [
  "/",
  "/collections",
  "/collections/drinkware",
  "/contact",
  "/shipping-policy",
  "/return-policy",
  "/products/colorful-drinking-kunststof-straws-bar-party-wedding-kitchen-pajitas-plastic-bev",
];

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

for (const path of pages) {
  const res = await fetch(`${ORIGIN}${path}`, { cache: "no-store" });
  const html = await res.text();
  const title = pick(html, /<title[^>]*>([^<]*)<\/title>/i);
  const desc = pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonical = pick(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    || pick(html, /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const ogTitle = pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)
    || pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  const ogImg = pick(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i)
    || pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
  const robots = pick(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)
    || pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i);
  console.log(JSON.stringify({ path, status: res.status, title, descLen: desc?.length, canonical, ogTitle, hasOgImg: Boolean(ogImg), robots }, null, 2));
}
