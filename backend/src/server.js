import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import discoverRoutes from "./routes/discover.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const TMDB_KEY = process.env.TMDB_API_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const ADDON_TIMEOUT = Number(process.env.ADDON_TIMEOUT || 5000);
const ADDON_DEADLINE = Number(process.env.ADDON_DEADLINE || 6000);
const TOKEN_TTL = Number(process.env.TOKEN_TTL || 21600) * 1000;
const TMDB_CACHE_TTL = Number(process.env.TMDB_CACHE_TTL || 3600000);
const FINAL_URL_TTL = Number(process.env.FINAL_URL_TTL || 600000);
const MAX_CACHE_ENTRIES = Number(process.env.MAX_CACHE_ENTRIES || 2000);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

// TorBox
const TORBOX_KEY = process.env.TORBOX_API_KEY || "";
const TORBOX_API = "https://api.torbox.app/v1/api";

// CORS must be registered before API routes.
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.FRONTEND_URL || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "1mb" }));

// Discover route must be registered after CORS middleware.
app.use("/api", discoverRoutes);

function loadAddons() {
  return Object.keys(process.env)
    .filter(k => /^ADDON_\d+$/.test(k))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
    .map(key => {
      try {
        const raw = (process.env[key] || "").trim();
        if (!raw) return null;

        const i = raw.indexOf("|");
        const name = i >= 0 ? raw.slice(0, i).trim() : new URL(raw).hostname;
        const input = i >= 0 ? raw.slice(i + 1).trim() : raw;
        const base = input.replace(/\/manifest\.json\/?$/i, "").replace(/\/+$/, "");
        const parsed = new URL(base);

        if (parsed.protocol !== "https:") {
          throw new Error(`${key} must use HTTPS`);
        }

        return { name, base };
      } catch (e) {
        console.warn(`[addon] Skipping ${key}: ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

const ADDONS = loadAddons();

class TTLCache {
  constructor(max = MAX_CACHE_ENTRIES) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    const item = this.map.get(key);
    if (!item) return undefined;

    if (item.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }

    return item.value;
  }

  set(key, value, ttl) {
    if (this.map.size >= this.max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }

    this.map.set(key, {
      value,
      expires: Date.now() + ttl
    });
  }
}

const tmdbCache = new TTLCache();
const dnsCache = new TTLCache();
const finalCache = new TTLCache();
const tokenStore = new Map();
const inflight = new Map();

async function cached(cache, key, ttl, fn) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  if (inflight.has(key)) return inflight.get(key);

  const p = fn()
    .then(v => {
      cache.set(key, v, ttl);
      return v;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

async function fetchJSON(url, timeout = 15000) {
  const r = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PvrPlay/2.0"
    },
    signal: AbortSignal.timeout(timeout)
  });

  if (!r.ok) throw new Error(`Upstream HTTP ${r.status}`);
  return r.json();
}

async function tmdb(endpoint, params = {}) {
  if (!TMDB_KEY) {
    throw new Error("TMDB_API_KEY missing in backend/.env");
  }

  const u = new URL(`${TMDB_BASE}/${endpoint.replace(/^\/+/, "")}`);
  u.searchParams.set("api_key", TMDB_KEY);

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      u.searchParams.set(k, String(v));
    }
  }

  return cached(
    tmdbCache,
    u.toString(),
    TMDB_CACHE_TTL,
    () => fetchJSON(u, 15000)
  );
}

function formatMedia(m, type) {
  return {
    tmdb_id: m.id,
    title: m.title || m.name || "Untitled",
    release_date: m.release_date || m.first_air_date || "",
    rating: Number(m.vote_average || 0),
    overview: m.overview || "",
    poster: m.poster_path
      ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
      : null,
    backdrop: m.backdrop_path
      ? `https://image.tmdb.org/t/p/original${m.backdrop_path}`
      : null,
    media_type: type
  };
}

// ---------- Addons (no retry, hard deadline) ----------

async function fetchAddon(addon, kind, id) {
  const url = `${addon.base}/stream/${kind}/${encodeURIComponent(id).replace(/%3A/gi, ":")}.json`;

  try {
    const data = await fetchJSON(url, ADDON_TIMEOUT);

    return (Array.isArray(data.streams) ? data.streams : [])
      .map(s => ({ ...s, _addon: addon.name }));
  } catch (e) {
    console.warn(`[${addon.name}] ${e.message}`);
    return [];
  }
}

const withDeadline = (p, ms) =>
  Promise.race([
    p,
    new Promise(r => setTimeout(() => r([]), ms))
  ]);

async function fetchAllStreams(kind, id) {
  console.log(`🔄 [ADDON] Fetching fresh streams for: ${kind}:${id}`);

  const batches = await Promise.all(
    ADDONS.map(a =>
      withDeadline(fetchAddon(a, kind, id), ADDON_DEADLINE)
    )
  );

  const flat = batches.flat();
  console.log(`✅ [ADDON] Received ${flat.length} streams`);
  return flat;
}

const QUALITY_ORDER = {
  "2160p": 0,
  "1080p": 1,
  "720p": 2,
  "480p": 3,
  "Unknown": 4
};

function metadata(s) {
  const h = s.behaviorHints || {};
  const filename = h.filename || s.filename || "";
  const text = [
    filename,
    s.name || "",
    s.title || "",
    s.description || ""
  ].join(" ");

  const has = p => new RegExp(p, "i").test(text);

  let quality = "Unknown";

  for (const [p, q] of [
    ["2160p|4k|uhd", "2160p"],
    ["1080p", "1080p"],
    ["720p", "720p"],
    ["480p", "480p"]
  ]) {
    if (has(p)) {
      quality = q;
      break;
    }
  }

  let size = "Size not provided";
  let size_bytes = 0;

  if (Number.isFinite(Number(h.videoSize)) && Number(h.videoSize) > 0) {
    size_bytes = Number(h.videoSize);
    size = `${(size_bytes / 1024 ** 3).toFixed(2)} GB`;
  } else {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i);

    if (m) {
      const n = Number(m[1]);
      const u = m[2].toUpperCase();
      size = `${n} ${u}`;
      size_bytes = n * ({
        TB: 1024 ** 4,
        GB: 1024 ** 3,
        MB: 1024 ** 2
      }[u]);
    }
  }

  const is_hindi = has("hindi|\\bhin\\b|\\bhind\\b|🇮🇳");
  const is_english = has("english|\\beng\\b|🇬🇧|🇺🇸");

  const languages = [];

  if (is_hindi) languages.push({ name: "Hindi", code: "in" });
  if (is_english) languages.push({ name: "English", code: "us" });

  const collect = pairs =>
    pairs.filter(([p]) => has(p)).map(([, v]) => v);

  const codec = collect([
    ["\\bHEVC\\b|\\bH\\.?265\\b|x265", "HEVC"],
    ["\\bAVC\\b|\\bH\\.?264\\b|x264", "H.264"],
    ["\\bAV1\\b", "AV1"]
  ]);

  const hdr = collect([
    ["Dolby Vision|\\bDV\\b", "DV"],
    ["\\bHDR10\\+?\\b", "HDR10"],
    ["\\bHDR\\b", "HDR"],
    ["10[- ]?bit", "10bit"]
  ]);

  const audio = collect([
    ["Dolby Atmos", "Atmos"],
    ["\\bDDP\\b|\\bEAC3\\b|\\bDD\\+", "DD+"],
    ["DTS-HD", "DTS-HD"],
    ["\\bDTS\\b", "DTS"],
    ["\\bAAC\\b", "AAC"],
    ["\\bFLAC\\b", "FLAC"],
    ["TrueHD", "TrueHD"]
  ]);

  let source = "Unknown";

  for (const [p, v] of [
    ["REMUX", "REMUX"],
    ["BluRay|BDRip|BRRip", "BluRay"],
    ["WEB[- .]?DL", "WEB-DL"],
    ["WEBRip", "WEBRip"],
    ["HDTV", "HDTV"]
  ]) {
    if (has(p)) {
      source = v;
      break;
    }
  }

  return {
    file_title: filename || s.title || s.description || s.name || "Unknown file",
    quality,
    size,
    size_bytes,
    is_hindi,
    languages,
    codec,
    hdr,
    audio,
    source
  };
}

function purgeTokens() {
  const now = Date.now();

  for (const [t, v] of tokenStore) {
    if (now - v.created > TOKEN_TTL) tokenStore.delete(t);
  }
}

async function isPublicHost(host) {
  if (dnsCache.get(host) !== undefined) return dnsCache.get(host);

  try {
    if (net.isIP(host)) {
      const ip = host.toLowerCase();

      const bad =
        ip === "::1" ||
        ip === "::" ||
        ip.startsWith("fc") ||
        ip.startsWith("fd") ||
        ip.startsWith("fe8") ||
        ip.startsWith("fe9") ||
        ip.startsWith("fea") ||
        ip.startsWith("feb") ||
        ip.startsWith("ff") ||
        ip.startsWith("::ffff:");

      const ok = net.isIPv4(ip) ? isPublicIPv4(ip) : !bad;
      dnsCache.set(host, ok, 600000);
      return ok;
    }

    const records = await dns.lookup(host, {
      all: true,
      verbatim: true
    });

    const ok =
      records.length > 0 &&
      records.every(r =>
        net.isIPv4(r.address)
          ? isPublicIPv4(r.address)
          : isPublicIPv6(r.address)
      );

    dnsCache.set(host, ok, 600000);
    return ok;
  } catch {
    return false;
  }
}

function isPublicIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a === 255
  );
}

function isPublicIPv6(ip) {
  const x = ip.toLowerCase();

  return !(
    x === "::" ||
    x === "::1" ||
    x.startsWith("fc") ||
    x.startsWith("fd") ||
    x.startsWith("fe8") ||
    x.startsWith("fe9") ||
    x.startsWith("fea") ||
    x.startsWith("feb") ||
    x.startsWith("ff") ||
    x.startsWith("::ffff:")
  );
}

async function validatePlaybackURL(value) {
  const u = new URL(value);

  if (u.protocol !== "https:" || u.username || u.password) {
    throw new Error("Blocked playback URL");
  }

  if (
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    u.hostname.endsWith(".local") ||
    !(await isPublicHost(u.hostname))
  ) {
    throw new Error("Blocked playback host");
  }

  return u;
}

// ---------- TorBox cached check (sirf Hindi / Hindi dub) ----------

function extractHash(stream) {
  const direct = stream.infoHash || stream.behaviorHints?.infoHash;

  if (direct && /^[a-f0-9]{40}$/i.test(direct)) {
    return direct.toLowerCase();
  }

  const magnet = String(stream.url || "")
    .match(/urn:btih:([a-f0-9]{40})/i);

  if (magnet) return magnet[1].toLowerCase();

  const text = `${stream.url || ""} ${stream.behaviorHints?.bingeGroup || ""}`;
  const m = text.match(/(?:^|[^a-f0-9])([a-f0-9]{40})(?![a-f0-9])/i);

  return m ? m[1].toLowerCase() : null;
}

const cachedMemo = new Map();

async function getTorBoxCachedHashes(hashes) {
  const cachedSet = new Set();

  if (!TORBOX_KEY) {
    console.warn("[TorBox] TORBOX_API_KEY missing in .env - cached check skipped");
    return cachedSet;
  }

  const now = Date.now();
  const toCheck = [];

  for (const h of hashes) {
    const m = cachedMemo.get(h);

    if (m && m.exp > now) {
      if (m.ok) cachedSet.add(h);
    } else {
      toCheck.push(h);
    }
  }

  console.log(
    `🔍 [TorBox] Checking ${toCheck.length} Hindi hashes (${hashes.length - toCheck.length} memo)...`
  );

  for (let i = 0; i < toCheck.length; i += 50) {
    const chunk = toCheck.slice(i, i + 50);

    try {
      const r = await fetch(
        `${TORBOX_API}/torrents/checkcached?format=list&list_files=false`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${TORBOX_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ hashes: chunk }),
          signal: AbortSignal.timeout(8000)
        }
      );

      if (!r.ok) {
        console.warn(`[TorBox] Check failed with status ${r.status}`);
        continue;
      }

      const d = (await r.json()).data;
      const found = new Set();

      if (Array.isArray(d)) {
        for (const it of d) {
          const h = typeof it === "string"
            ? it
            : it?.hash || it?.infoHash;

          if (h) found.add(h.toLowerCase());
        }
      } else if (d && typeof d === "object") {
        for (const [h, v] of Object.entries(d)) {
          if (v) found.add(h.toLowerCase());
        }
      }

      for (const h of chunk) {
        const ok = found.has(h);
        cachedMemo.set(h, {
          ok,
          exp: now + 300000
        });
        if (ok) cachedSet.add(h);
      }
    } catch (e) {
      console.warn("[TorBox] Cache check failed:", e.message);
    }
  }

  console.log(`✅ [TorBox] Found ${cachedSet.size} cached Hindi torrents`);
  return cachedSet;
}

async function buildResults(raw, title) {
  purgeTokens();

  const seen = new Set();
  const unique = [];

  for (const s of raw) {
    if (typeof s.url === "string" && !seen.has(s.url)) {
      seen.add(s.url);
      unique.push(s);
    }
  }

  // URL validation (SSRF check) happens in resolveFinal()/upstream()
  // when the user presses play.
  const enriched = unique.map(s => ({
    stream: s,
    meta: metadata(s),
    hash: extractHash(s)
  }));

  const hindi = enriched.filter(e => e.meta.is_hindi);
  const hindiHashes = [
    ...new Set(hindi.filter(e => e.hash).map(e => e.hash))
  ];

  if (hindi.length && !hindiHashes.length) {
    console.warn(
      `[TorBox] ${hindi.length} Hindi streams but 0 hashes found. Sample url: ${hindi[0].stream.url}`
    );
  }

  const cachedSet = hindiHashes.length
    ? await getTorBoxCachedHashes(hindiHashes)
    : new Set();

  const out = enriched.map(({ stream, meta, hash }) => {
    const isCached = !!(
      meta.is_hindi &&
      hash &&
      cachedSet.has(hash)
    );

    const token = crypto.randomBytes(24).toString("base64url");

    tokenStore.set(token, {
      url: stream.url,
      title: title || "video",
      metadata: meta,
      created: Date.now()
    });

    return {
      token,
      name: stream._addon || "Addon",
      ...meta,
      is_torbox_cached: isCached,
      cached: isCached
    };
  });

  // Hindi cached -> Hindi -> remaining; smaller size first in each group.
  const rank = x =>
    x.is_hindi && x.cached ? 0 : x.is_hindi ? 1 : 2;

  const sz = x =>
    x.size_bytes > 0 ? x.size_bytes : Number.MAX_SAFE_INTEGER;

  out.sort((a, b) =>
    rank(a) - rank(b) || sz(a) - sz(b)
  );

  console.log(
    `⚡ [ADDON] Hindi cached: ${out.filter(x => x.cached).length} | Hindi: ${out.filter(x => x.is_hindi).length} | all: ${out.length}`
  );

  return out;
}

async function resolveMedia(type, id) {
  const path = type === "movie" ? `movie/${id}` : `tv/${id}`;
  const d = await tmdb(path, {
    append_to_response: "external_ids"
  });

  const imdb = (d.external_ids || {}).imdb_id;

  if (!imdb) {
    throw Object.assign(
      new Error("IMDb ID not found for this title"),
      { status: 404 }
    );
  }

  return { details: d, imdb };
}

// ==========================================
// DETAILS ROUTES
// ==========================================

async function sendDetails(type, req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Invalid TMDB ID"
      });
    }

    const d = await tmdb(`${type}/${id}`, {
      language: "en-US",
      append_to_response: "credits,videos,images,external_ids",
      include_image_language: "en,null"
    });

    res.json({
      ...d,
      tmdb_id: d.id,
      media_type: type
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}

app.get("/api/movie/:id/details", (req, res) =>
  sendDetails("movie", req, res)
);

app.get("/api/tv/:id/details", (req, res) =>
  sendDetails("tv", req, res)
);

app.get("/api/health", (req, res) =>
  res.json({
    status: "ok",
    addons: ADDONS.map(a => a.name),
    addon_count: ADDONS.length,
    active_tokens: tokenStore.size,
    uptime: process.uptime()
  })
);

app.get("/api/search", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    const type = String(req.query.type || "multi");

    if (query.length < 2) {
      return res.json({ results: [] });
    }

    if (!["movie", "tv", "multi"].includes(type)) {
      return res.status(400).json({
        error: "type must be movie, tv or multi"
      });
    }

    const data = await tmdb(`search/${type}`, {
      query,
      include_adult: "false",
      language: "en-US",
      page: 1
    });

    const results = (data.results || [])
      .filter(m =>
        type !== "multi" ||
        ["movie", "tv"].includes(m.media_type)
      )
      .map(m =>
        formatMedia(
          m,
          type === "multi" ? m.media_type : type
        )
      );

    res.json({ results });
  } catch (e) {
    res.status(502).json({
      error: e.message,
      results: []
    });
  }
});


app.get("/api/trending", async (req, res) => {
  try {
    const type = req.query.type === "tv" ? "tv" : "movie";

    const allowed = type === "movie"
      ? ["popular", "top_rated", "upcoming", "now_playing"]
      : ["popular", "top_rated", "airing_today", "on_the_air"];

    const category = allowed.includes(req.query.category)
      ? req.query.category
      : "popular";

    const params = {
      language: "en-US",
      page: 1,
    };

    // India-specific upcoming movie releases
    if (type === "movie" && category === "upcoming") {
      params.region = "IN";
    }

    const d = await tmdb(`${type}/${category}`, params);

    const results = (d.results || []).map(m =>
      formatMedia(m, type)
    );

    res.json({ results });

  } catch (e) {
    console.error("Trending API error:", e.message);

    res.status(502).json({
      error: e.message,
      results: [],
    });
  }
});


app.get("/api/tv/:id/seasons", async (req, res) => {
  try {
    const d = await tmdb(`tv/${Number(req.params.id)}`);

    res.json({
      seasons: (d.seasons || [])
        .filter(s => s.season_number > 0)
        .map(s => ({
          number: s.season_number,
          name: s.name,
          episodes: s.episode_count
        }))
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/tv/:id/season/:season", async (req, res) => {
  try {
    const d = await tmdb(
      `tv/${Number(req.params.id)}/season/${Number(req.params.season)}`
    );

    res.json({
      episodes: (d.episodes || []).map(e => ({
        number: e.episode_number,
        name: e.name || `Episode ${e.episode_number}`,
        overview: e.overview || "",
        still_path: e.still_path || null,
        air_date: e.air_date || "",
        runtime: e.runtime || null
      }))
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/movie/:id/streams", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Invalid TMDB ID",
        streams: []
      });
    }

    const { details, imdb } = await resolveMedia("movie", id);
    const raw = await fetchAllStreams("movie", imdb);

    res.json({
      title: details.title,
      tmdb_id: id,
      imdb_id: imdb,
      streams: await buildResults(raw, details.title)
    });
  } catch (e) {
    res.status(e.status || 502).json({
      error: e.message,
      streams: []
    });
  }
});

app.get("/api/tv/:id/streams", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const season = Number(req.query.season || 1);
    const episode = Number(req.query.episode || 1);

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !Number.isInteger(season) ||
      season < 1 ||
      !Number.isInteger(episode) ||
      episode < 1
    ) {
      return res.status(400).json({
        error: "Invalid series, season or episode",
        streams: []
      });
    }

    const { details, imdb } = await resolveMedia("tv", id);
    const raw = await fetchAllStreams(
      "series",
      `${imdb}:${season}:${episode}`
    );

    const title =
      `${details.name} S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;

    res.json({
      title,
      tmdb_id: id,
      imdb_id: imdb,
      season,
      episode,
      streams: await buildResults(raw, title)
    });
  } catch (e) {
    res.status(e.status || 502).json({
      error: e.message,
      streams: []
    });
  }
});

// ==========================================
// Upstream helpers
// ==========================================

async function upstream(url, method, headers = {}, redirects = 5) {
  let current = url;

  for (let i = 0; i <= redirects; i++) {
    await validatePlaybackURL(current);

    const r = await fetch(current, {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(120000)
    });

    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get("location");
      await r.body?.cancel();

      if (!loc) {
        throw new Error("Redirect without location");
      }

      current = new URL(loc, current).href;
      continue;
    }

    return r;
  }

  throw new Error("Too many redirects");
}

// Redirect chain ek baar follow karke final CDN url cache karo.
async function resolveFinal(url, redirects = 5) {
  let cur = url;

  for (let i = 0; i <= redirects; i++) {
    await validatePlaybackURL(cur);

    const r = await fetch(cur, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });

    await r.body?.cancel();

    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get("location");

      if (!loc) {
        throw new Error("Redirect without location");
      }

      cur = new URL(loc, cur).href;
      continue;
    }

    if (!r.ok && r.status !== 206) {
      throw new Error(`Origin HTTP ${r.status}`);
    }

    return cur;
  }

  throw new Error("Too many redirects");
}

function getFinalUrl(token, item) {
  return cached(
    finalCache,
    token,
    FINAL_URL_TTL,
    () => resolveFinal(item.url)
  );
}

function getToken(req, res) {
  const item = tokenStore.get(req.params.token);

  if (!item) {
    res.status(404).json({ error: "Stream expired" });
    return null;
  }

  return item;
}

app.get("/api/stream-info/:token", async (req, res) => {
  const item = getToken(req, res);
  if (!item) return;

  try {
    const r = await upstream(item.url, "HEAD");
    await r.body?.cancel();

    if (!r.ok) {
      return res.status(502).json({
        error: `Origin HTTP ${r.status}`
      });
    }

    res.json({
      content_type: r.headers.get("content-type") || "application/octet-stream",
      content_length: r.headers.get("content-length"),
      accept_ranges: r.headers.get("accept-ranges")
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});


// Download: proxy hi rahega (filename header ke liye)
async function proxy(req, res, download = false, srcUrl = null) {
  const item = getToken(req, res);
  if (!item) return;

  try {
    const headers = {};

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    if (req.headers["if-range"]) {
      headers["If-Range"] = req.headers["if-range"];
    }

    const r = await upstream(
      srcUrl || item.url,
      req.method,
      headers
    );

    res.status(r.status);

    for (const k of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified"
    ]) {
      const v = r.headers.get(k);
      if (v) res.setHeader(k, v);
    }

    if (download) {
      const type = r.headers.get("content-type") || "";

      const ext =
        /matroska|x-matroska/i.test(type) ||
        /\.mkv(?:$|[?#])/i.test(item.url)
          ? ".mkv"
          : ".mp4";

      const safe = String(item.title)
        .replace(/[^\w.-]+/g, "_")
        .slice(0, 100);

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safe}_${item.metadata.quality}${ext}"`
      );
    }

    if (req.method === "HEAD" || !r.body) {
      await r.body?.cancel();
      return res.end();
    }

    const body = Readable.fromWeb(r.body);

    res.on("close", () => {
      if (!res.writableEnded) body.destroy();
    });

    body.on("error", () => {
      if (!res.headersSent) res.status(502);
      res.end();
    });

    body.pipe(res);
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ error: e.message });
    } else {
      res.end();
    }
  }
}

// Play: CDN par 302 redirect, SIRF jab final URL me secret (TorBox API key) na ho.
// TorBox ke link me ?token=<API KEY> hota hai, to us case me server proxy karta hai.

const hasSecret = (u) => {
  const secrets = [TORBOX_KEY, TMDB_KEY].filter(Boolean);

  return secrets.some(k =>
    u.includes(k) || u.includes(encodeURIComponent(k))
  );
};

app.all("/api/play/:token", async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    return res.sendStatus(405);
  }

  const item = getToken(req, res);
  if (!item) return;

  try {
    const url = await getFinalUrl(req.params.token, item);

    if (hasSecret(url)) {
      return proxy(req, res, false, url);
    }

    res.setHeader("Cache-Control", "private, max-age=300");
    return res.redirect(302, url);
  } catch (e) {
    console.warn("[play] resolve failed, proxy fallback:", e.message);

    finalCache.map.delete(req.params.token);
    return proxy(req, res, false);
  }
});

app.all("/api/download/:token", (req, res) =>
  ["GET", "HEAD"].includes(req.method)
    ? proxy(req, res, true)
    : res.sendStatus(405)
);

// ==========================================
// ffprobe + transcode (ffmpeg/ffprobe host par installed hone chahiye)
// ==========================================

const LANG = {
  hin: "Hindi",
  hi: "Hindi",
  eng: "English",
  en: "English",
  tam: "Tamil",
  ta: "Tamil",
  tel: "Telugu",
  te: "Telugu",
  mal: "Malayalam",
  ml: "Malayalam",
  kan: "Kannada",
  kn: "Kannada",
  ben: "Bengali",
  bn: "Bengali",
  mar: "Marathi",
  mr: "Marathi",
  pan: "Punjabi",
  pa: "Punjabi",
  jpn: "Japanese",
  ja: "Japanese",
  kor: "Korean",
  ko: "Korean"
};

function audioLanguage(tags = {}) {
  const code = (tags.language || "").toLowerCase();

  if (LANG[code]) return LANG[code];

  const title = (tags.title || "").toLowerCase();

  for (const name of Object.values(LANG)) {
    if (title.includes(name.toLowerCase())) return name;
  }

  return code && code !== "und"
    ? code.toUpperCase()
    : "Unknown";
}

function runProbe(url) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE, [
      "-v", "error",
      "-protocol_whitelist", "http,https,tcp,tls,crypto",
      "-probesize", "5M",
      "-analyzeduration", "5M",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      url
    ], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("ffprobe timeout"));
    }, 30000);

    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);

    p.on("error", e => {
      clearTimeout(timer);
      reject(e);
    });

    p.on("close", code => {
      clearTimeout(timer);

      if (code !== 0) {
        return reject(
          new Error(err.slice(-1000) || "ffprobe failed")
        );
      }

      try {
        resolve(JSON.parse(out || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

const scrub = (m) =>
  String(m).replace(/https?:\/\/[^\s"')]+/gi, "[url]");

const probeCache = new TTLCache(500);

app.get("/api/probe/:token", async (req, res) => {
  const item = getToken(req, res);
  if (!item) return;

  const cachedProbe = probeCache.get(req.params.token);

  if (cachedProbe) {
    return res.json(cachedProbe);
  }

  try {
    const srcUrl = await getFinalUrl(req.params.token, item);
    const d = await runProbe(srcUrl);

    const audio = [];
    let video_codec = null;

    for (const s of d.streams || []) {
      if (s.codec_type === "audio") {
        audio.push({
          index: audio.length,
          lang: audioLanguage(s.tags || {}),
          title: (s.tags || {}).title || "",
          codec: s.codec_name,
          channels: s.channels
        });
      }

      if (s.codec_type === "video" && !video_codec) {
        video_codec = s.codec_name;
      }
    }

    const info = {
      duration: Number(d.format?.duration || 0),
      audio,
      video_codec
    };

    probeCache.set(req.params.token, info, 600000);
    res.json(info);
  } catch (e) {
    res.status(503).json({
      error: `Probe unavailable: ${scrub(e.message)}`
    });
  }
});

// Transcode: final CDN url, reconnect flags, ultrafast re-encode
// (seek ke baad jaldi start)

app.get("/api/transcode/:token", async (req, res) => {
  const item = getToken(req, res);
  if (!item) return;

  let srcUrl;

  try {
    srcUrl = await getFinalUrl(req.params.token, item);
  } catch (e) {
    return res.status(403).json({ error: e.message });
  }

  const audio = Math.max(
    0,
    Math.min(32, Number(req.query.audio) || 0)
  );

  const start = Math.max(
    0,
    Number(req.query.start) || 0
  );

  const reencode = req.query.v === "h264" || start > 0;

  const args = [
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-protocol_whitelist", "http,https,tcp,tls,crypto",
    "-user_agent", "PvrPlay/2.0",
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-probesize", "5M",
    "-analyzeduration", "5M",
    "-fflags", "+genpts"
  ];

  if (start > 0) {
    args.push("-ss", start.toFixed(3));
  }

  args.push(
    "-i", srcUrl,
    "-map", "0:v:0",
    "-map", `0:a:${audio}`
  );

  if (reencode) {
    args.push(
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "zerolatency",
      "-crf", "25",
      "-pix_fmt", "yuv420p",
      "-vf", "scale='min(1920,iw)':-2",
      "-force_key_frames", "expr:gte(t,n_forced*2)"
    );
  } else {
    args.push("-c:v", "copy");
  }

  args.push(
    "-c:a", "aac",
    "-b:a", "192k",
    "-ac", "2",
    "-af", "aresample=async=1:first_pts=0",
    "-sn",
    "-dn",
    "-avoid_negative_ts", "make_zero",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1"
  );

  const p = spawn(FFMPEG, args, {
    stdio: ["ignore", "pipe", "ignore"]
  });

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-store");

  p.stdout.pipe(res);

  const stop = () => {
    if (p.exitCode === null) {
      p.kill("SIGKILL");
    }
  };

  req.on("close", stop);
  res.on("close", stop);

  p.on("error", () => {
    if (!res.headersSent) {
      res.status(503).end("FFmpeg unavailable");
    }
  });
});

setInterval(purgeTokens, 60000).unref();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`vegafilms API listening on :${PORT}`);
  console.log(
    `Addons: ${ADDONS.map(a => a.name).join(", ") || "none configured"}`
  );
  console.log(`TMDB: ${TMDB_KEY ? "configured" : "MISSING"}`);
});