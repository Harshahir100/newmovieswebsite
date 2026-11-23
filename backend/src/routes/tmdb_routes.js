// backend/src/routes/tmdb_routes.js
import express from "express";
import { tmdb, formatMedia, enrichMedia, resolveMedia } from "../services/tmdb.js";
import { fetchAllStreams, buildResults } from "../services/addons.js";
import { ADDONS } from "../config/env.js";
import { tokenStore } from "../utils/token.js";

const router = express.Router();

const wrap = (fn) => async (req, res) => {
  try {
    const result = await fn(req, res);
    if (!res.headersSent && result !== undefined) res.json(result);
  } catch (e) {
    console.error("TMDB route error:", e.message);
    if (!res.headersSent) res.status(e.status || 502).json({ error: e.message });
  }
};

// ==========================================
// HEALTH
// ==========================================
router.get("/health", (req, res) =>
  res.json({
    status: "ok",
    addons: ADDONS.map((a) => a.name),
    addon_count: ADDONS.length,
    active_tokens: tokenStore.size,
    uptime: process.uptime(),
  })
);

// ==========================================
// SEARCH — GET /api/search?query=odyssey&type=multi
// ==========================================
router.get(
  "/search",
  wrap(async (req) => {
    const query = String(req.query.query || "").trim();
    const type = String(req.query.type || "multi");
    if (query.length < 2) return { results: [] };
    if (!["movie", "tv", "multi"].includes(type))
      return { error: "type must be movie, tv or multi", results: [] };
    const data = await tmdb(`search/${type}`, {
      query,
      include_adult: "false",
      language: "en-US",
      page: 1,
    });
    const results = (data.results || [])
      .filter((m) => type !== "multi" || ["movie", "tv"].includes(m.media_type))
      .map((m) => formatMedia(m, type === "multi" ? m.media_type : type));
    return { results: await enrichMedia(results) };
  })
);

// ==========================================
// TRENDING / CATEGORY LISTS
// ==========================================
router.get(
  "/trending",
  wrap(async (req) => {
    const type = req.query.type === "tv" ? "tv" : "movie";
    const allowed =
      type === "movie"
        ? ["popular", "top_rated", "upcoming", "now_playing"]
        : ["popular", "top_rated", "airing_today", "on_the_air"];
    const category = allowed.includes(req.query.category) ? req.query.category : "popular";

    const params = {
      language: "en-US",
      page: 1,
    };

    if (type === "movie" && category === "upcoming") {
      params.region = "IN";
    }

    const d = await tmdb(`${type}/${category}`, params);
    const results = (d.results || []).map((m) => formatMedia(m, type));
    return { results: await enrichMedia(results) };
  })
);

// ==========================================
// DETAILS
// ==========================================
async function sendDetails(type, req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid TMDB ID" });
    }
    const d = await tmdb(`${type}/${id}`, {
      language: "en-US",
      append_to_response: "credits,videos,images,external_ids",
      include_image_language: "en,null",
    });
    res.json({ ...d, tmdb_id: d.id, media_type: type });
  } catch (e) {
    console.error("TMDB details error:", e.message);
    if (!res.headersSent) res.status(e.status || 502).json({ error: e.message });
  }
}

router.get("/movie/:id/details", (req, res) => sendDetails("movie", req, res));
router.get("/tv/:id/details", (req, res) => sendDetails("tv", req, res));

// ==========================================
// TV SEASONS & EPISODES
// ==========================================
router.get(
  "/tv/:id/seasons",
  wrap(async (req) => {
    const d = await tmdb(`tv/${Number(req.params.id)}`);
    return {
      seasons: (d.seasons || [])
        .filter((s) => s.season_number > 0)
        .map((s) => ({
          number: s.season_number,
          name: s.name,
          episodes: s.episode_count,
        })),
    };
  })
);

router.get(
  "/tv/:id/season/:season",
  wrap(async (req) => {
    const d = await tmdb(
      `tv/${Number(req.params.id)}/season/${Number(req.params.season)}`
    );
    return {
      episodes: (d.episodes || []).map((e) => ({
        number: e.episode_number,
        name: e.name || `Episode ${e.episode_number}`,
        overview: e.overview || "",           // <-- Add kiya
        still_path: e.still_path || null,     // <-- Add kiya
        air_date: e.air_date || "",           // <-- Optional
        runtime: e.runtime || null,           // <-- Optional
      })),
    };
  })
);

// ==========================================
// STREAMS
// ==========================================
router.get(
  "/movie/:id/streams",
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Invalid TMDB ID", streams: [] });
    const { details, imdb } = await resolveMedia("movie", id);
    const raw = await fetchAllStreams("movie", imdb);
    return {
      title: details.title,
      tmdb_id: id,
      imdb_id: imdb,
      streams: await buildResults(raw, details.title),
    };
  })
);

router.get(
  "/tv/:id/streams",
  wrap(async (req, res) => {
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
    )
      return res.status(400).json({
        error: "Invalid series, season or episode",
        streams: [],
      });
    const { details, imdb } = await resolveMedia("tv", id);
    const raw = await fetchAllStreams("series", `${imdb}:${season}:${episode}`);
    const title = `${details.name} S${String(season).padStart(2, "0")}E${String(
      episode
    ).padStart(2, "0")}`;
    return {
      title,
      tmdb_id: id,
      imdb_id: imdb,
      season,
      episode,
      streams: await buildResults(raw, title),
    };
  })
);

// ==========================================
// DISCOVER
// ==========================================
router.get(
  "/discover",
  wrap(async (req) => {
    const { type, with_genres, with_watch_providers, watch_region } = req.query;
    const mediaType = type === "tv" ? "tv" : "movie";

    const params = { page: 1, language: "en-US" };
    if (with_genres) params.with_genres = with_genres; // ID, not a name
    if (with_watch_providers) params.with_watch_providers = with_watch_providers;
    if (watch_region) params.watch_region = watch_region;

    const d = await tmdb(`discover/${mediaType}`, params);
    const results = (d.results || []).map((m) => formatMedia(m, mediaType));
    return { results: await enrichMedia(results) };
  })
);

// Genres list (name -> ID mapping ke liye)
router.get(
  "/genres/:type",
  wrap(async (req) => {
    const d = await tmdb(`genre/${req.params.type}/list`);
    return d.genres || [];
  })
);

export default router;