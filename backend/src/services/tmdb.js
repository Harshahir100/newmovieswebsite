// backend/src/services/tmdb.js
import { TMDB_BASE, TMDB_KEY, TMDB_CACHE_TTL } from "../config/env.js";
import { tmdbCache, cached } from "../utils/cache.js";
import { fetchJSON } from "../utils/fetch.js";

export async function tmdb(endpoint, params = {}) {
  if (!TMDB_KEY) throw new Error("TMDB_API_KEY missing in backend/.env");
  const u = new URL(`${TMDB_BASE}/${endpoint.replace(/^\/+/, "")}`);
  u.searchParams.set("api_key", TMDB_KEY);
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  return cached(tmdbCache, u.toString(), TMDB_CACHE_TTL, () => fetchJSON(u, 15000));
}

// Full TMDB genre map (movie + tv)
const GENRE_MAP = {
  // movie
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Science Fiction", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  // tv
  10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

export function formatMedia(m, type) {
  // list endpoints -> genre_ids, details endpoints -> genres: [{ id, name }]
  const fromIds = (m.genre_ids || []).map((id) => GENRE_MAP[id]);
  const fromObjs = (m.genres || []).map((g) => g.name);
  const genres = [...new Set([...fromIds, ...fromObjs].filter(Boolean))];

  return {
    tmdb_id: m.id,
    title: m.title || m.name || "Untitled",
    release_date: m.release_date || m.first_air_date || "",
    rating: Number(m.vote_average || 0),
    overview: m.overview || "",
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : null,
    media_type: type,
    runtime: null, // enrichMedia() fills this
    genres: genres.length ? genres : [type === "tv" ? "Series" : "Movie"],
  };
}

// List endpoints (trending/discover/search) runtime nahi dete aur kai
// unreleased titles ke genre_ids khali hote hain. Isliye har item ki details
// (TMDB cache ke saath) laakar runtime + asli genre names bhar dete hain.
export async function enrichMedia(items) {
  return Promise.all(
    items.map(async (item) => {
      try {
        const type = item.media_type === "tv" ? "tv" : "movie";
        const d = await tmdb(`${type}/${item.tmdb_id}`, { language: "en-US" });

        const mins =
          type === "movie"
            ? d.runtime
            : d.episode_run_time?.[0] || d.last_episode_to_air?.runtime;
        const names = (d.genres || []).map((g) => g.name).filter(Boolean);

        return {
          ...item,
          runtime: mins || null,
          genres: names.length ? names : item.genres,
        };
      } catch (e) {
        return item; // fail ho to basic data hi bhej do
      }
    })
  );
}

export async function resolveMedia(type, id) {
  const path = type === "movie" ? `movie/${id}` : `tv/${id}`;
  const d = await tmdb(path, { append_to_response: "external_ids" });
  const imdb = (d.external_ids || {}).imdb_id;
  if (!imdb)
    throw Object.assign(new Error("IMDb ID not found for this title"), { status: 404 });
  return { details: d, imdb };
}