/**
 * Detect duplicate GA4 / GTM loads on the live homepage.
 */
const url = "https://www.simplecartstore.com/?nocache=" + Date.now();
const html = await (await fetch(url, { cache: "no-store" })).text();

const gaIds = [...html.matchAll(/\b(G-[A-Z0-9]+)\b/g)].map((m) => m[1]);
const gtmIds = [...html.matchAll(/\b(GTM-[A-Z0-9]+)\b/g)].map((m) => m[1]);

const gtagJsLoads = [
  ...html.matchAll(/googletagmanager\.com\/gtag\/js\?id=(G-[A-Z0-9]+)/gi),
].map((m) => m[1]);
const gtmJsLoads = [
  ...html.matchAll(/googletagmanager\.com\/gtm\.js\?id=(GTM-[A-Z0-9]+)/gi),
].map((m) => m[1]);
const gtmNsLoads = [
  ...html.matchAll(/googletagmanager\.com\/ns\.html\?id=(GTM-[A-Z0-9]+)/gi),
].map((m) => m[1]);

const configCalls = [
  ...html.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"]?(G-[A-Z0-9]+)/gi),
].map((m) => m[1]);

// Also catch JSON.stringify form used by Next: gtag('config',"G-...")
const configCalls2 = [
  ...html.matchAll(/gtag\('config',\"(G-[A-Z0-9]+)\"/gi),
].map((m) => m[1]);

const gaInitScripts = (html.match(/id=["']ga-init["']/g) || []).length;
const gaLoaderScripts = (html.match(/id=["']ga-loader["']/g) || []).length;
const gtmLoaderScripts = (html.match(/id=["']gtm-loader["']/g) || []).length;

function counts(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] || 0) + 1;
  return m;
}

const report = {
  uniqueGaIds: [...new Set(gaIds)],
  uniqueGtmIds: [...new Set(gtmIds)],
  gtagJsLoadCount: gtagJsLoads.length,
  gtagJsById: counts(gtagJsLoads),
  gtmJsLoadCount: gtmJsLoads.length,
  gtmJsById: counts(gtmJsLoads),
  gtmNoscriptCount: gtmNsLoads.length,
  gaConfigCalls: counts([...configCalls, ...configCalls2]),
  scriptTagIds: { gaLoaderScripts, gaInitScripts, gtmLoaderScripts },
};

// Heuristic risk
const risks = [];
if (gtagJsLoads.length > 1) risks.push("gtag.js loaded more than once in HTML");
if (Object.values(counts([...configCalls, ...configCalls2])).some((n) => n > 1)) {
  risks.push("gtag config called more than once in HTML for same ID");
}
if (gtmJsLoads.length > 1) risks.push("gtm.js loaded more than once in HTML");
if (gaIds.includes("G-HLEMH46BSK") && gtmIds.includes("GTM-PHVL8DGG")) {
  risks.push(
    "Both direct GA4 and GTM are present — if GTM also fires G-HLEMH46BSK, pageviews can double (GTM container must be checked in Tag Assistant)",
  );
}

console.log(JSON.stringify({ report, risks }, null, 2));
