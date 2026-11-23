import "dotenv/config";

export const PORT = Number(process.env.PORT || 5000);
export const TMDB_KEY = process.env.TMDB_API_KEY || "";
export const TMDB_BASE = "https://api.themoviedb.org/3";
export const ADDON_TIMEOUT = Number(process.env.ADDON_TIMEOUT || 10000);
export const TOKEN_TTL = Number(process.env.TOKEN_TTL || 21600) * 1000;
export const STREAM_CACHE_TTL = Number(process.env.STREAM_CACHE_TTL || 300000);
export const TMDB_CACHE_TTL = Number(process.env.TMDB_CACHE_TTL || 3600000);
export const MAX_CACHE_ENTRIES = Number(process.env.MAX_CACHE_ENTRIES || 2000);
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export const FRONTEND_ORIGINS = (
  process.env.FRONTEND_URL || "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((s) => s.trim());

// ---------- Addon loader ----------
function loadAddons() {
  return Object.keys(process.env)
    .filter((k) => /^ADDON_\d+$/.test(k))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
    .map((key) => {
      try {
        const raw = (process.env[key] || "").trim();
        if (!raw) return null;
        const i = raw.indexOf("|");
        const name = i >= 0 ? raw.slice(0, i).trim() : new URL(raw).hostname;
        const input = i >= 0 ? raw.slice(i + 1).trim() : raw;
        const base = input.replace(/\/manifest\.json\/?$/i, "").replace(/\/+$/, "");
        const parsed = new URL(base);
        if (parsed.protocol !== "https:") throw new Error(`${key} must use HTTPS`);
        return { name, base };
      } catch (e) {
        console.warn(`[addon] Skipping ${key}: ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

export const ADDONS = loadAddons();