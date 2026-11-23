import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import MovieCard from "./MovieCard";

// Platform ke liye region. Apne hisaab se badlo ("IN", "US" ...)
const WATCH_REGION = "IN";

/*
  Backend ka /discover route ye params TMDB /discover tak forward karna chahiye:
  type (movie|tv), page, sort_by, with_genres, with_watch_providers, watch_region
*/
async function fetchPage({ type, genre, provider, page }) {
  try {
    const res = await api.get("/discover", {
      params: {
        type,
        page,
        sort_by: "popularity.desc",
        ...(genre ? { with_genres: genre } : {}),
        ...(provider ? { with_watch_providers: provider, watch_region: WATCH_REGION } : {}),
      },
    });
    return res.data;
  } catch (err) {
    // Plain "All Movies / All Series" ke liye trending se fallback
    if (!genre && !provider) {
      const res = await api.get("/trending", { params: { type, category: "popular", page } });
      return res.data;
    }
    throw err;
  }
}

const idOf = (m) => m.tmdb_id ?? m.id;

// Parent me `key` do (type-genre-provider) taaki filter badalte hi state reset ho jaye
export default function ContentGrid({ type, genre, provider, onOpenDetails, emptyText }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0); // retry
  const sentinel = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchPage({ type, genre, provider, page })
      .then((data) => {
        if (cancelled) return;
        const results = data?.results || [];
        setItems((prev) => {
          const seen = new Set(prev.map(idOf));
          return [...prev, ...results.filter((m) => !seen.has(idOf(m)))];
        });
        setHasMore(data?.total_pages ? page < data.total_pages : results.length > 0);
      })
      .catch((e) => {
        console.error("ContentGrid load failed:", e);
        if (!cancelled) setError(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, tick, type, genre, provider]);

  // Neeche scroll karne par agla page apne aap
  useEffect(() => {
    if (!hasMore || loading || error) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setPage((p) => p + 1),
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, error, items.length]);

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-wrap gap-3 md:gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="w-[132px] sm:w-[150px] md:w-[170px] lg:w-[180px] aspect-[2/3] rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl animate-pulse motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="rounded-3xl bg-white/[0.05] backdrop-blur-xl border border-white/10 p-8 text-center">
        <p className="text-white/80 mb-4">Couldn't load titles right now.</p>
        <button
          onClick={() => setTick((t) => t + 1)}
          className="px-6 py-2.5 rounded-full font-bold text-sm bg-gradient-to-b from-red-500 to-red-700 border border-red-300/30 shadow-[0_0_24px_rgba(229,9,20,0.45)] hover:brightness-110 transition"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="rounded-3xl bg-white/[0.05] backdrop-blur-xl border border-white/10 p-8 text-center text-white/70">
        {emptyText || "Nothing found here yet."}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 md:gap-x-4 md:gap-y-6 justify-center sm:justify-start">
        {items.map((m) => (
          <MovieCard key={idOf(m)} movie={m} onClick={onOpenDetails} />
        ))}
      </div>
      <div ref={sentinel} className="h-10" />
      {loading && <p className="text-center text-white/50 text-sm py-4">Loading more…</p>}
    </>
  );
}