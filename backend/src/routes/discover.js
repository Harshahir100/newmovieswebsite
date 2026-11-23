
import express from "express";

const router = express.Router();

const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

function normalize(item, mediaType) {
  return {
    tmdb_id: item.id,
    title: item.title || item.name,
    overview: item.overview || "",
    poster: item.poster_path
      ? `${IMG_BASE}/w500${item.poster_path}`
      : null,
    backdrop: item.backdrop_path
      ? `${IMG_BASE}/w1280${item.backdrop_path}`
      : null,
    rating: Number(item.vote_average || 0),
    release_date: item.release_date || item.first_air_date || "",
    media_type: mediaType,
  };
}

router.get("/discover", async (req, res) => {
  const mediaType = req.query.type === "tv" ? "tv" : "movie";

  const params = new URLSearchParams({
    api_key: process.env.TMDB_API_KEY || "",
    language: "en-US",
    page: String(Number(req.query.page) || 1),
    sort_by: String(req.query.sort_by || "popularity.desc"),
    include_adult: "false",
  });

  if (req.query.with_genres) {
    params.set("with_genres", String(req.query.with_genres));
  }

  if (req.query.with_watch_providers) {
    params.set(
      "with_watch_providers",
      String(req.query.with_watch_providers)
    );
    params.set("watch_region", String(req.query.watch_region || "IN"));
    params.set("with_watch_monetization_types", "flatrate|free|ads");
  }

  try {
    if (!process.env.TMDB_API_KEY) {
      return res.status(500).json({
        results: [],
        error: "TMDB_API_KEY missing in backend/.env",
      });
    }

    const response = await fetch(
      `${TMDB_BASE}/discover/${mediaType}?${params.toString()}`,
      { signal: AbortSignal.timeout(10000) }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        results: [],
        error: data.status_message || "TMDB request failed",
      });
    }

    const results = (data.results || [])
      .filter((item) => item.poster_path)
      .map((item) => normalize(item, mediaType));

    return res.json({
      results,
      page: data.page || 1,
      total_pages: Math.min(data.total_pages || 1, 500),
    });
  } catch (error) {
    console.error("TMDB Discover Error:", error.message);

    return res.status(502).json({
      results: [],
      error: error.message,
    });
  }
});

export default router;
