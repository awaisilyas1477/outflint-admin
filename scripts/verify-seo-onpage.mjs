const pages = [
  "/",
  "/collections",
  "/collections/drinkware-tumblers",
  "/products/colorful-drinking-kunststof-straws-bar-party-wedding-kitchen-pajitas-plastic-bev",
];

for (const path of pages) {
  const html = await (await fetch(`https://www.simplecartstore.com${path}`, { cache: "no-store" })).text();
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  );
  const hasFaq = /Frequently asked questions/i.test(html);
  const hasFaqLd = /"@type"\s*:\s*"FAQPage"/i.test(html);
  const hasBreadcrumbNav = /aria-label="Breadcrumb"/i.test(html);
  const hasProductName = /"@type"\s*:\s*"Product"[\s\S]{0,400}"name"\s*:\s*"Reusable/i.test(html);
  console.log(
    JSON.stringify(
      {
        path,
        title,
        h1,
        hasFaq,
        hasFaqLd,
        hasBreadcrumbNav,
        productSchemaUsesName: path.includes("/products/") ? hasProductName : undefined,
      },
      null,
      2,
    ),
  );
}
