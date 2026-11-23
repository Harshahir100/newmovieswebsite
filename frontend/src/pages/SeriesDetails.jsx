import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client";
import {
  Play,
  ArrowLeft,
  Star,
  Plus,
  Heart,
  Share2,
  ChevronDown,
  Loader2,
} from "lucide-react";
import SeriesPlayer from "../components/SeriesPlayer";

const IMG = "https://image.tmdb.org/t/p";

/* ---------- Glassmorphism helpers ---------- */
const glass =
  "bg-white/[0.06] backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.45)]";
const glassStrong =
  "bg-black/40 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]";

// Progressive blur: ye layer [from%..to%] ke baad blur dikhana shuru karta hai
const blurLayer = (px, from, to) => {
  const mask = `linear-gradient(to bottom, transparent ${from}%, #000 ${to}%, #000 100%)`;
  return {
    backdropFilter: `blur(${px}px)`,
    WebkitBackdropFilter: `blur(${px}px)`,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
};

const circleBtn = (active = false) =>
  `w-12 h-12 rounded-full border flex items-center justify-center transition backdrop-blur-md ${
    active
      ? "bg-red-600 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)]"
      : "bg-white/10 border-white/25 hover:border-red-500 hover:bg-white/20"
  }`;

export default function SeriesDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [activeTab, setActiveTab] = useState("episodes");
  const [loading, setLoading] = useState(true);
  const [inList, setInList] = useState(false);
  const [liked, setLiked] = useState(false);

  // Player State
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchShowData = async () => {
      try {
        setLoading(true);
        const [detailsRes, seasonsRes] = await Promise.all([
          api.get(`/tv/${id}/details`),
          api.get(`/tv/${id}/seasons`),
        ]);
        setDetails(detailsRes.data);
        setSeasons(seasonsRes.data.seasons || []);
        if (seasonsRes.data.seasons?.length > 0) {
          setSelectedSeason(seasonsRes.data.seasons[0].number);
        }
      } catch (err) {
        console.error("Failed to load series details", err);
      } finally {
        setLoading(false);
      }
    };
    fetchShowData();
  }, [id]);

  // Fetch episodes when season changes
  useEffect(() => {
    if (!selectedSeason) return;
    const fetchEpisodes = async () => {
      try {
        const res = await api.get(`/tv/${id}/season/${selectedSeason}`);
        setEpisodes(res.data.episodes || []);
      } catch (err) {
        console.error("Failed to load episodes", err);
      }
    };
    fetchEpisodes();
  }, [id, selectedSeason]);

  if (loading)
    return (
      <div className="min-h-screen bg-[#0b0b0b] flex items-center justify-center">
        <Loader2 className="animate-spin text-red-500" size={48} />
      </div>
    );
  if (!details)
    return (
      <div className="text-white text-center mt-20">Series not found.</div>
    );

  const bgPath = details.backdrop_path || details.poster_path;
  const backdrop = bgPath ? `${IMG}/w1280${bgPath}` : null;
  const ambient = bgPath ? `${IMG}/w300${bgPath}` : null;

  const logo =
    details.images?.logos?.find((l) => l.iso_639_1 === "en") ||
    details.images?.logos?.[0];
  const logoUrl = logo ? `${IMG}/w500${logo.file_path}` : null;
  const year = (details.first_air_date || "").slice(0, 4);
  const rating = details.vote_average;
  const genres = details.genres?.map((g) => g.name) || [];

  const handleWatchNow = () => {
    if (episodes.length > 0) {
      setCurrentEpisode(episodes[0]);
      setIsPlayerOpen(true);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share)
        await navigator.share({ title: details.name, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
    } catch {}
  };

  return (
    <div className="relative min-h-screen bg-[#0b0b0b] text-white pb-20 overflow-x-hidden">
      {/* 1) AMBIENT GLOW: poster ke colors poore page me (fixed, heavy blur) */}
      {ambient && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img
            src={ambient}
            alt=""
            className="w-full h-full object-cover scale-125 blur-[80px] saturate-150 opacity-70"
          />
          <div className="absolute inset-0 bg-[#0b0b0b]/55" />
        </div>
      )}

      {/* 2) POSTER BG: upar sharp -> neeche gradually blur + dark */}
      {backdrop && (
        <div
          className="absolute top-0 inset-x-0 h-[150vh] z-[1] pointer-events-none"
          style={{
            maskImage:
              "linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%)",
          }}
        >
          <img
            src={backdrop}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top"
          />

          {/* progressive blur bands */}
          <div className="absolute inset-0" style={blurLayer(2, 25, 40)} />
          <div className="absolute inset-0" style={blurLayer(6, 38, 52)} />
          <div className="absolute inset-0" style={blurLayer(12, 50, 64)} />
          <div className="absolute inset-0" style={blurLayer(22, 62, 76)} />
          <div className="absolute inset-0" style={blurLayer(36, 74, 90)} />

          {/* progressive dark */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/35 via-40% to-[#0b0b0b]/90" />
          {/* left cinematic vignette */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
        </div>
      )}

      {/* CONTENT */}
      <div className="relative z-10">
        {/* HERO SECTION */}
        <div className="relative min-h-[85vh] flex items-end">
          <button
            onClick={() => navigate(-1)}
            className={`absolute top-24 left-6 md:left-12 z-10 flex items-center gap-2 ${glassStrong} hover:bg-red-600/80 px-4 py-2 rounded-xl font-semibold transition`}
          >
            <ArrowLeft size={18} /> Back
          </button>

          <div className="relative w-full px-6 md:px-12 pb-16 pt-32">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={details.name}
                className="max-h-32 md:max-h-48 object-contain object-left mb-6 drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]"
              />
            ) : (
              <h1 className="text-5xl md:text-7xl font-black mb-6 drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]">
                {details.name}
              </h1>
            )}

            <div className="flex items-center gap-4 text-sm font-medium mb-4">
              <span className="flex items-center gap-1 text-yellow-400 font-bold">
                <Star size={16} fill="currentColor" />{" "}
                {Number(rating || 0).toFixed(1)}
              </span>
              <span>{year}</span>
              <span>{seasons.length} Seasons</span>
              <span className="border border-white/40 px-1.5 py-0.5 rounded text-xs">
                HD
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {genres.map((g) => (
                <span
                  key={g}
                  className="bg-white/10 backdrop-blur-md border border-white/15 px-4 py-1.5 rounded-full text-sm"
                >
                  {g}
                </span>
              ))}
            </div>

            <p className="max-w-2xl text-gray-100 text-sm md:text-base leading-relaxed mb-8 line-clamp-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {details.overview}
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={handleWatchNow}
                className="bg-white text-black hover:bg-red-600 hover:text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition shadow-[0_8px_30px_rgba(255,255,255,0.15)]"
              >
                <Play size={20} fill="currentColor" /> Watch Now
              </button>
              <button onClick={() => setInList((v) => !v)} className={circleBtn(inList)}>
                <Plus size={22} />
              </button>
              <button onClick={() => setLiked((v) => !v)} className={circleBtn(liked)}>
                <Heart size={22} fill={liked ? "white" : "none"} />
              </button>
              <button onClick={handleShare} className={circleBtn(false)}>
                <Share2 size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="border-b border-white/10 flex justify-center sticky top-[72px] bg-black/30 backdrop-blur-xl z-40">
          {["overview", "episodes", "details", "trailer"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-sm md:text-base font-bold uppercase tracking-wider relative transition ${
                activeTab === tab
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-0 w-full h-[3px] bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.9)]" />
              )}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        <div className="px-6 md:px-12 py-8 max-w-7xl mx-auto">
          {activeTab === "episodes" && (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(Number(e.target.value))}
                    className={`appearance-none ${glass} text-white px-4 py-2.5 pr-10 rounded-xl outline-none cursor-pointer font-semibold`}
                  >
                    {seasons.map((s) => (
                      <option key={s.number} value={s.number} className="bg-[#1a1a1a] text-white">
                        Season {s.number} • {s.episodes} episodes
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {episodes.map((ep) => (
                  <div
                    key={ep.number}
                    onClick={() => {
                      setCurrentEpisode(ep);
                      setIsPlayerOpen(true);
                    }}
                    className={`group cursor-pointer ${glass} hover:bg-white/10 hover:border-white/20 transition rounded-2xl p-3`}
                  >
                    <div className="relative rounded-xl overflow-hidden aspect-video bg-white/5 mb-3">
                      {ep.still_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
                          alt={ep.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                          No Image
                        </div>
                      )}

                      {/* hover play overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition w-11 h-11 rounded-full bg-red-600/90 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.7)]">
                          <Play size={18} fill="white" />
                        </span>
                      </div>

                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded-md text-sm font-bold text-white">
                        {ep.number}
                      </div>
                    </div>
                    <h4 className="font-bold text-sm text-white mb-1 px-1">
                      {ep.name}
                    </h4>
                    <p className="text-xs text-gray-400 line-clamp-2 px-1">
                      {ep.overview || "No description available."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "overview" && (
            <div className={`max-w-4xl ${glass} rounded-2xl p-6`}>
              <h2 className="text-2xl font-bold mb-4">About {details.name}</h2>
              <p className="text-gray-300 leading-relaxed text-lg">
                {details.overview}
              </p>
            </div>
          )}
        </div>
      </div>

      {isPlayerOpen && currentEpisode && (
        <SeriesPlayer
          tmdbId={id}
          seriesTitle={details.name}
          seasons={seasons}
          initialSeason={selectedSeason}
          initialEpisode={currentEpisode}
          onClose={() => setIsPlayerOpen(false)}
        />
      )}
    </div>
  );
}