// Brand logos for the Store's Connectors page (C3, D108), from Simple Icons (CC0,
// public domain), pinned. One-colour SVGs in #000000 (the app paints them in the
// brand colour); the colours go in src/qml/Brands.js. Brands Simple Icons doesn't
// carry get a monogram in the app instead.
// Run: node ui/render-store-logos.mjs
import { writeFileSync } from "node:fs";
const v = "13.21.0";
const dir = new URL("../apps/sios-store/src/icons/", import.meta.url).pathname;
const brands = ["github", "gitlab", "linear", "notion", "slack", "gmail", "googlecalendar", "googledrive", "googlesheets", "googledocs", "sentry", "stripe", "atlassian", "jira", "confluence",
  "asana", "figma", "cloudflare", "vercel", "supabase", "hubspot", "airtable", "zapier", "postgresql", "mongodb", "mysql", "redis", "docker", "kubernetes", "discord", "dropbox",
  "shopify", "twilio", "paypal", "trello", "clickup", "todoist", "obsidian", "spotify", "youtube", "x", "reddit", "zoom", "microsoftteams", "brave", "duckduckgo", "wikipedia",
  "huggingface", "openai", "anthropic", "claude", "googlegemini", "perplexity", "elastic", "grafana", "datadog", "netlify", "heroku", "digitalocean", "firebase", "neo4j",
  "snowflake", "databricks", "box", "miro", "canva", "webflow", "wordpress", "intercom", "zendesk", "pagerduty", "postman", "npm", "pypi", "playwright", "puppeteer", "apify"];
const data = await (await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@${v}/_data/simple-icons.json`)).json();
const list = data.icons || data;
const slug = (t) => t.toLowerCase().replace(/\+/g, "plus").replace(/^\./, "dot-").replace(/\./g, "dot").replace(/&/g, "and").normalize("NFD").replace(/[^a-z0-9]/g, "");
const colors = {};
for (const b of brands) {
  const e = list.find((i) => (i.slug || slug(i.title)) === b);
  const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@${v}/icons/${b}.svg`);
  if (!res.ok || !e) { console.log("no logo:", b); continue; }
  const d = (await res.text()).match(/<path d="([^"]+)"/)[1];
  writeFileSync(`${dir}logo-${b}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#000000"><path d="${d}"/></svg>\n`);
  colors[b] = "#" + e.hex;
}
writeFileSync(new URL("../apps/sios-store/src/qml/Brands.js", import.meta.url).pathname,
  `// Brand colours for the Connectors page's logos (Simple Icons ${v}, CC0), made by ui/render-store-logos.mjs.\n.pragma library\nvar colors = ${JSON.stringify(colors, null, 1)};\n`);
console.log(Object.keys(colors).length, "store logos written");
