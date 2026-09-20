const EXPECTED = "G-TGEHKPS1Z2";
const html = await (await fetch("https://www.simplecartstore.com/", { cache: "no-store" })).text();
const ga = html.match(/G-[A-Z0-9]+/g) || [];
const uniqueGa = [...new Set(ga)];
const hasGtagJs = new RegExp(`gtag/js\\?id=${EXPECTED}`, "i").test(html);
const hasConfig =
  html.includes(`gtag('config',"${EXPECTED}"`) ||
  html.includes(`gtag('config','${EXPECTED}'`) ||
  html.includes(`"config",${JSON.stringify(EXPECTED)}`) ||
  html.includes(EXPECTED);
console.log({
  expected: EXPECTED,
  uniqueGa,
  hasExpected: uniqueGa.includes(EXPECTED),
  hasOld: uniqueGa.includes("G-HLEMH46BSK"),
  hasGtagJs,
  hasConfigSnippet: hasConfig,
});
