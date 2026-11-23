// Usage (backend folder me, server chalu rakhke):
//   node leak-check.mjs movie 603
//   node leak-check.mjs tv 1396            (S01E01 check karta hai)
// Ye script wahi requests karta hai jo browser play dabane par karta hai,
// aur dekhta hai ki response/headers/redirect me tumhari secrets aa rahi hain ya nahi.

import "dotenv/config";

const API = process.env.API || "http://127.0.0.1:5000";
const type = process.argv[2] || "movie";
const id = process.argv[3] || "603";

// ---- secrets jo kabhi browser tak nahi pahunchni chahiye ----
const secrets = [];
const add = (label, value) => { if (value && String(value).length >= 6) secrets.push({ label, value: String(value) }); };

add("TORBOX_API_KEY", process.env.TORBOX_API_KEY);
add("TMDB_API_KEY", process.env.TMDB_API_KEY);
for (const k of Object.keys(process.env).filter((k) => /^ADDON_\d+$/.test(k))) {
  const raw = (process.env[k] || "").trim();
  const i = raw.indexOf("|");
  const url = (i >= 0 ? raw.slice(i + 1) : raw).trim();
  add(`${k} full url`, url);
  add(`${k} base url`, url.replace(/\/manifest\.json\/?$/i, "").replace(/\/+$/, ""));
  try {
    const u = new URL(url);
    if (u.pathname.length > 8) add(`${k} path (config/key)`, u.pathname.replace(/\/manifest\.json\/?$/i, ""));
    add(`${k} hostname`, u.hostname);
  } catch {}
}

let leaks = 0;
function scan(where, text) {
  const hay = String(text);
  for (const s of secrets) {
    if (hay.includes(s.value) || hay.includes(encodeURIComponent(s.value))) {
      leaks++;
      console.log(`  ❌ LEAK in ${where}: ${s.label}`);
    }
  }
}
const headersText = (res) => JSON.stringify([...res.headers.entries()]);
const redact = (u) => { try { const x = new URL(u); return `${x.origin}${x.pathname.slice(0, 40)}... ${x.search ? `(query: ${[...x.searchParams.keys()].join(",")})` : "(no query)"}`; } catch { return "?"; } };

async function hit(label, url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  const body = await res.text().catch(() => "");
  console.log(`\n• ${label} -> HTTP ${res.status}`);
  scan(`${label} body`, body);
  scan(`${label} headers`, headersText(res));
  return { res, body };
}

console.log(`Checking ${API} | ${secrets.length} secrets loaded from .env`);

// 1) health
await hit("GET /api/health", `${API}/api/health`);

// 2) stream list
const q = type === "tv" ? "?season=1&episode=1" : "";
const { body: listBody } = await hit(`GET /api/${type}/${id}/streams`, `${API}/api/${type}/${id}/streams${q}`);
let streams = [];
try { streams = JSON.parse(listBody).streams || []; } catch {}
console.log(`  streams found: ${streams.length}`);
if (!streams.length) { console.log("Koi stream nahi mili, dusra id try karo."); process.exit(0); }

// 3) play / probe / stream-info / download headers for first few streams
for (const s of streams.slice(0, 3)) {
  const t = s.token;
  console.log(`\n=== stream ${s.quality} ${s.name} ===`);

  const play = await hit(`GET /api/play/<token>`, `${API}/api/play/${t}`, { headers: { Range: "bytes=0-0" } });
  const loc = play.res.headers.get("location");
  if (loc) {
    console.log(`  redirect -> ${redact(loc)}`);
    scan("redirect Location", loc);
    if (/[?&](token|apikey|api_key|key)=/i.test(loc)) {
      console.log("  ⚠️  Final CDN URL me token/key query hai. Ye browser Network tab me dikhega.");
      console.log("      Compare karo ki ye tumhari TorBox API key nahi hai (upar scan me LEAK nahi aaya to key nahi hai).");
    }
  }

  await hit(`GET /api/probe/<token>`, `${API}/api/probe/${t}`);
  await hit(`GET /api/stream-info/<token>`, `${API}/api/stream-info/${t}`);
  await hit(`GET /api/download/<token> (sirf headers)`, `${API}/api/download/${t}`, { headers: { Range: "bytes=0-0" } });
}

console.log(`\n${leaks ? `❌ ${leaks} leak(s) mili. Upar dekho.` : "✅ Koi secret response/headers/redirect me nahi mili."}`);
process.exit(leaks ? 1 : 0);