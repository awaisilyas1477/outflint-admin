const html = await (await fetch("https://www.simplecartstore.com/collections", { cache: "no-store" })).text();
const hasHub = html.includes("Shop by category");
const title = (html.match(/<title>([^<]+)<\/title>/i) || [])[1];
const admin = await fetch("https://admin.simplecartstore.com/", { cache: "no-store" });
console.log({ storefrontHub: hasHub, collectionsTitle: title, adminStatus: admin.status });
