import { ADDONS, ADDON_TIMEOUT, TORBOX_API_KEY } from "../config/env.js";
import { fetchJSON } from "../utils/fetch.js";
import { metadata, QUALITY_ORDER } from "../utils/metadata.js";
import { validatePlaybackURL } from "../utils/security.js";
import { purgeTokens, issueToken } from "../utils/token.js";

const TORBOX_API = "https://api.torbox.app/v1/api";

async function fetchAddon(addon, kind, id) {
  const url = `${addon.base}/stream/${kind}/${encodeURIComponent(id).replace(/%3A/gi,":")}.json`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const data = await fetchJSON(url, ADDON_TIMEOUT);
      return (Array.isArray(data.streams) ? data.streams : []).map(s => ({ ...s, _addon: addon.name }));
    } catch (e) {
      console.warn(`[${addon.name}] attempt ${attempt}: ${e.message}`);
      if (attempt === 2) return [];
    }
  }
}
// NO CACHE - Addon Fresh Data
export async function fetchAllStreams(kind, id) {
  console.log(`🔄 [ADDON] Fetching fresh streams for: ${kind}:${id}`);
  const batches = await Promise.all(ADDONS.map((a) => fetchAddon(a, kind, id)));
  const flat = batches.flat();
  console.log(`✅ [ADDON] Received ${flat.length} streams`);
  return flat;
}

// ==========================================
// TorBox cached check (sirf Hindi / Hindi dub streams ke liye)
// ==========================================

// Stream se 40-char infoHash nikalo (infoHash, magnet, ya https playback URL / bingeGroup)
export function extractHash(stream) {
  const direct = stream.infoHash || stream.behaviorHints?.infoHash;
  if (direct && /^[a-f0-9]{40}$/i.test(direct)) return direct.toLowerCase();

  const magnet = String(stream.url || "").match(/urn:btih:([a-f0-9]{40})/i);
  if (magnet) return magnet[1].toLowerCase();

  const text = `${stream.url || ""} ${stream.behaviorHints?.bingeGroup || ""}`;
  const m = text.match(/(?:^|[^a-f0-9])([a-f0-9]{40})(?![a-f0-9])/i);
  return m ? m[1].toLowerCase() : null;
}

const cachedMemo = new Map(); // hash -> { ok, exp }
const MEMO_TTL = 5 * 60 * 1000;

export async function getTorBoxCachedHashes(hashes) {
  const cached = new Set();
  if (!TORBOX_API_KEY || hashes.length === 0) return cached;

  const now = Date.now();
  const toCheck = [];
  for (const h of hashes) {
    const m = cachedMemo.get(h);
    if (m && m.exp > now) {
      if (m.ok) cached.add(h);
    } else toCheck.push(h);
  }

  console.log(`🔍 [TorBox] Checking ${toCheck.length} Hindi hashes (${hashes.length - toCheck.length} memo)...`);

  for (let i = 0; i < toCheck.length; i += 50) {
    const chunk = toCheck.slice(i, i + 50);
    try {
      const res = await fetch(`${TORBOX_API}/torrents/checkcached?format=list&list_files=false`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TORBOX_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hashes: chunk }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.warn(`[TorBox] Check failed with status ${res.status}`);
        continue;
      }
      const json = await res.json();
      const d = json.data;

      // list format: [{ hash, name, size }] ya ["hash"] | object format: { hash: {...} }
      const found = new Set();
      if (Array.isArray(d)) {
        for (const item of d) {
          const h = typeof item === "string" ? item : item?.hash || item?.infoHash;
          if (h) found.add(h.toLowerCase());
        }
      } else if (d && typeof d === "object") {
        for (const [h, v] of Object.entries(d)) if (v) found.add(h.toLowerCase());
      }

      for (const h of chunk) {
        const ok = found.has(h);
        cachedMemo.set(h, { ok, exp: now + MEMO_TTL });
        if (ok) cached.add(h);
      }
    } catch (e) {
      console.warn("[TorBox] Cache check failed:", e.message);
    }
  }

  console.log(`✅ [TorBox] Found ${cached.size} cached Hindi torrents`);
  return cached;
}

export async function buildResults(raw, title) {
  purgeTokens();
  const seen = new Set();
  const unique = [];
  for (const s of raw)
    if (typeof s.url === "string" && !seen.has(s.url)) {
      seen.add(s.url);
      unique.push(s);
    }

  const checks = await Promise.all(
    unique.map(async (s) => {
      try {
        await validatePlaybackURL(s.url);
        return true;
      } catch {
        return false;
      }
    })
  );

  // Metadata + hash (sirf valid URLs)
  const enriched = unique
    .filter((_, i) => checks[i])
    .map((s) => ({ stream: s, meta: metadata(s), hash: extractHash(s) }));

  // Sirf Hindi hashes TorBox se check karo
  const hindiHashes = [
    ...new Set(enriched.filter((e) => e.meta.is_hindi && e.hash).map((e) => e.hash)),
  ];
  const cachedSet = hindiHashes.length ? await getTorBoxCachedHashes(hindiHashes) : new Set();

  const out = enriched.map(({ stream, meta, hash }) => {
    const isCached = !!(meta.is_hindi && hash && cachedSet.has(hash));
    const token = issueToken(stream.url, title, meta);
    return {
      token,
      name: stream._addon || "Addon",
      ...meta,
      is_torbox_cached: isCached,
      cached: isCached,
    };
  });

  // Sort: Hindi cached → Hindi → Quality → Size
  out.sort((a, b) => {
    const aTop = a.is_hindi && a.is_torbox_cached;
    const bTop = b.is_hindi && b.is_torbox_cached;
    if (aTop !== bTop) return aTop ? -1 : 1;
    if (a.is_hindi !== b.is_hindi) return a.is_hindi ? -1 : 1;
    return (
      (QUALITY_ORDER[a.quality] ?? 4) - (QUALITY_ORDER[b.quality] ?? 4) ||
      b.size_bytes - a.size_bytes
    );
  });

  console.log(
    `⚡ [ADDON] Hindi cached: ${out.filter((x) => x.is_hindi && x.is_torbox_cached).length} | Hindi: ${out.filter((x) => x.is_hindi).length} | all: ${out.length}`
  );
  return out;
}