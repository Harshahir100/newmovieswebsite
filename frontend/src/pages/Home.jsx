import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import HeroSlider from "../components/HeroSlider";
import SectionRow from "../components/SectionRow";
import MovieCard from "../components/MovieCard";
import PlatformStrip from "../components/PlatformStrip";
import Top10Row from "../components/Top10Row";
import { Play } from "lucide-react";

/* ---------- Glass loading skeleton ---------- */
function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-[#09060a] px-3 md:px-6 pt-[72px] md:pt-24">
      <div className="h-[420px] rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl animate-pulse motion-reduce:animate-none" />
      <div className="mt-6 flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="min-w-[132px] md:min-w-[170px] aspect-[2/3] rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl animate-pulse motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Continue Watching glass card ---------- */
function ContinueCard({ item, onOpenDetails }) {
  const progress = Math.min(Math.max(item.progress ?? 33, 4), 100); // item.progress (0-100) ho to use hoga

  return (
    <button
      type="button"
      onClick={() => onOpenDetails(item)}
      className="group relative flex-shrink-0 w-[150px] md:w-[200px] text-left rounded-2xl overflow-hidden border border-white/20 bg-white/5 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <img
        src={item.poster}
        alt={item.title}
        loading="lazy"
        className="w-full aspect-[2/3] object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/30" />

      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300">
        <div className="h-14 w-14 rounded-full flex items-center justify-center bg-white/15 backdrop-blur-md border border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.25)]">
          <Play fill="white" size={22} className="text-white ml-0.5" />
        </div>
      </div>

      <div className="absolute inset-x-2 bottom-2 rounded-xl bg-white/10 backdrop-blur-xl border border-white/15 px-3 pt-2.5 pb-3">
        <h3 className="text-white font-semibold truncate text-sm md:text-base">
          {item.title}
        </h3>
        {item.media_type === "tv" && item.season && item.episode && (
          <p className="text-xs text-white/70 mt-0.5">
            Season {item.season}, Episode {item.episode}
          </p>
        )}
        <div className="mt-2 h-1 w-full rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </button>
  );
}

export default function Home({ onOpenDetails }) {
  const navigate = useNavigate();
  const [heroMovies, setHeroMovies] = useState([]);
  const [comingSoon, setComingSoon] = useState([]);
  const [inTheatres, setInTheatres] = useState([]);
  const [trending, setTrending] = useState([]);
  const [popularTV, setPopularTV] = useState([]);
  const [topTen, setTopTen] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0); // hero ki current slide

  // "View All" kahan jaye - apne route ke hisaab se badlo
  const viewAll = () => navigate("/categories");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("continueWatching");
      if (saved) setContinueWatching(JSON.parse(saved));
    } catch {
      setContinueWatching([]);
    }

    const fetchData = async () => {
      try {
        const [trendingRes, upcomingRes, nowPlayingRes, tvRes, topRes] =
          await Promise.all([
            api.get("/trending?type=movie&category=popular"),
            api.get("/trending?type=movie&category=upcoming"),
            api.get("/trending?type=tv&category=upcoming"),
            api.get("/trending?type=movie&category=now_playing"),
            api.get("/trending?type=tv&category=popular"),
            // Top 10 ke liye (agar backend me top_rated na ho to fail nahi hoga, fallback chalega)
            api
              .get("/trending?type=movie&category=top_rated")
              .catch(() => null),
          ]);

        const heroResults = trendingRes.data.results || [];
        setHeroMovies(heroResults.filter((m) => m.backdrop).slice(0, 4));
        // Only show movies that have not been released yet
        const today = new Date();
        const todayDate = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, "0"),
          String(today.getDate()).padStart(2, "0"),
        ].join("-");

        const upcomingMovies = (upcomingRes.data.results || [])
          .filter((movie) => {
            const releaseDate = movie.release_date;

            return (
              releaseDate && releaseDate !== "" && releaseDate >= todayDate
            );
          })
          .sort((a, b) => {
            return a.release_date.localeCompare(b.release_date);
          });

        setComingSoon(upcomingMovies.slice(0, 10));
        setInTheatres(nowPlayingRes.data.results?.slice(0, 10) || []);
        setTrending(trendingRes.data.results?.slice(0, 10) || []);
        setPopularTV(tvRes.data.results?.slice(0, 10) || []);
        const topResults = topRes?.data?.results?.length
          ? topRes.data.results
          : heroResults.length > 10
            ? heroResults.slice(10, 20)
            : heroResults;
        setTopTen(topResults.slice(0, 10));
      } catch (err) {
        console.error("Home fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <HomeSkeleton />;

  return (
    <div className="relative w-full min-h-screen bg-[#09060a] text-white overflow-x-hidden">
      {/* Page background = current slide ke poster ka blurred rang (poori page par) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#09060a]"
      >
        {heroMovies.map((m, i) => (
          <img
            key={m.tmdb_id}
            src={m.backdrop}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover scale-150 blur-3xl saturate-[1.6] transition-opacity duration-[1400ms] motion-reduce:transition-none ${
              i === activeIdx ? "opacity-70" : "opacity-0"
            }`}
          />
        ))}
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      <div className="relative z-10">
        <HeroSlider
          movies={heroMovies}
          onOpenDetails={onOpenDetails}
          onIndexChange={setActiveIdx}
        />

        <div className="relative z-20 w-full max-w-[1700px] mx-auto px-3 md:px-6 pb-16 -mt-16 md:-mt-24">
          <PlatformStrip />

          {continueWatching.length > 0 && (
            <SectionRow title="Continue Watching">
              {continueWatching.map((item) => (
                <ContinueCard
                  key={`${item.tmdb_id}-${item.season}-${item.episode}`}
                  item={item}
                  onOpenDetails={onOpenDetails}
                />
              ))}
            </SectionRow>
          )}

          <SectionRow title="Coming Soon" onViewAll={viewAll}>
            {comingSoon.map((m) => (
              <MovieCard key={m.tmdb_id} movie={m} onClick={onOpenDetails} />
            ))}
          </SectionRow>

          <SectionRow title="Trending Now" onViewAll={viewAll}>
            {trending.map((m) => (
              <MovieCard key={m.tmdb_id} movie={m} onClick={onOpenDetails} />
            ))}
          </SectionRow>

          <Top10Row
            title="Top 10 Movies"
            movies={topTen}
            onOpenDetails={onOpenDetails}
            onViewAll={viewAll}
          />

          <SectionRow title="In Theatres" onViewAll={viewAll}>
            {inTheatres.map((m) => (
              <MovieCard key={m.tmdb_id} movie={m} onClick={onOpenDetails} />
            ))}
          </SectionRow>

          <SectionRow title="Popular TV Series" onViewAll={viewAll}>
            {popularTV.map((m) => (
              <MovieCard key={m.tmdb_id} movie={m} onClick={onOpenDetails} />
            ))}
          </SectionRow>
        </div>
      </div>
    </div>
  );
}
