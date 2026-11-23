import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Play, Plus, Star, ChevronDown, Check } from "lucide-react";
import api from "../api/client"; // DetailsModal wala hi axios client (path apne folder ke hisaab se check karo)

// 173 -> "2h 53m"
const fmtRuntime = (min) =>
  min ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : null;

// Ek title ki details sirf ek baar fetch hongi
const detailsCache = new Map();

const getId = (movie) => movie.tmdb_id ?? movie.id;
const getType = (movie) =>
  movie.media_type === "tv" || movie.first_air_date !== undefined ? "tv" : "movie";

async function loadDetails(movie) {
  const type = getType(movie);
  const id = getId(movie);
  const key = `${type}:${id}`;
  if (detailsCache.has(key)) return detailsCache.get(key);

  const res = await api.get(`/${type}/${id}/details`);
  const d = res.data || {};
  const info = {
    genres: (d.genres || []).map((g) => (typeof g === "string" ? g : g.name)).filter(Boolean),
    runtime: d.runtime || d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || null,
  };
  detailsCache.set(key, info);
  return info;
}

// Popup sirf laptop/desktop (mouse wale) par
const canHover = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(min-width: 1024px) and (hover: hover)").matches;
const reduceMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const PANEL_H = 170; // popup ke neeche wale details panel ki lagbhag height

const circleBtn =
  "shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white bg-white/10 hover:bg-white/20 border border-white/30 backdrop-blur-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

export default function MovieCard({ movie, onClick, hideTitle = false }) {
  const [isAdded, setIsAdded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [info, setInfo] = useState(
    () => detailsCache.get(`${getType(movie)}:${getId(movie)}`) || null
  );
  const [err, setErr] = useState(null);
  const asked = useRef(!!info);

  const [pos, setPos] = useState(null); // null = popup band
  const [shown, setShown] = useState(false);
  const posterRef = useRef(null);
  const openT = useRef(null);
  const closeT = useRef(null);
  const isOpen = pos !== null;

  const fetchDetails = () => {
    if (asked.current || !getId(movie)) return;
    asked.current = true;
    loadDetails(movie)
      .then((data) => {
        setErr(null);
        setInfo(data);
      })
      .catch((e) => {
        asked.current = false;
        const msg = e?.response?.status ? `HTTP ${e.response.status}` : e?.message;
        setErr(msg || "request failed");
      });
  };

  const closePop = () => {
    clearTimeout(openT.current);
    clearTimeout(closeT.current);
    setShown(false);
    setPos(null);
  };

  const handleEnter = () => {
    clearTimeout(closeT.current);
    if (isOpen || !canHover()) return;
    clearTimeout(openT.current);
    openT.current = setTimeout(() => {
      const el = posterRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width * 1.2);
      const posterH = Math.round(width * 1.15);
      const total = posterH + PANEL_H;

      // Poster ke center par bada hoke khulta hai, screen ke andar clamp
      let top = r.top + r.height / 2 - posterH / 2 - 40;
      top = Math.max(12, Math.min(top, window.innerHeight - total - 12));
      let left = r.left + r.width / 2 - width / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));

      setPos({ top, left, width });
      fetchDetails();
    }, 40);
  };

  const handleLeave = () => {
    clearTimeout(openT.current);
    closeT.current = setTimeout(closePop, 120);
  };

  // popup khulte hi animation, scroll/resize par band
  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => setShown(true));
    window.addEventListener("scroll", closePop, true);
    window.addEventListener("resize", closePop);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("scroll", closePop, true);
      window.removeEventListener("resize", closePop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(
    () => () => {
      clearTimeout(openT.current);
      clearTimeout(closeT.current);
    },
    []
  );

  const rawGenres = info?.genres?.length ? info.genres : movie.genres || [];
  const genres = rawGenres
    .map((g) => (typeof g === "string" ? g : g?.name))
    .filter(Boolean)
    .slice(0, 3);

  const year = movie.release_date?.slice(0, 4);
  const runtime = fmtRuntime(info?.runtime || movie.runtime);
  const meta = [year, runtime].filter(Boolean);
  const rating = Number(movie.rating || 0).toFixed(1);

  const openDetails = () => onClick?.(movie);

  const poster =
    movie.poster && !imgFailed ? (
      <img
        src={movie.poster}
        alt={movie.title}
        loading="lazy"
        className="w-full h-full object-cover"
        onError={() => setImgFailed(true)}
      />
    ) : (
      <div className="w-full h-full flex items-center justify-center p-3 text-center text-sm text-white/60">
        {movie.title}
      </div>
    );

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="flex-shrink-0 w-[132px] sm:w-[150px] md:w-[170px] lg:w-[180px] relative cursor-pointer"
    >
      {/* ---------- Normal card (hover par yahan kuch resize nahi hota) ---------- */}
      <div
        role="button"
        tabIndex={0}
        onClick={openDetails}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetails();
          }
        }}
        className="rounded-2xl overflow-hidden bg-white/[0.06] backdrop-blur-xl border border-white/20 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <div
          ref={posterRef}
          className="relative w-full aspect-[2/3] bg-gradient-to-b from-white/10 to-white/[0.02]"
        >
          {poster}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg bg-black/45 backdrop-blur-md border border-white/20 px-2 py-1 text-xs font-bold text-white">
            <span className="text-yellow-400">★</span> {rating}
          </span>
        </div>
      </div>

      {!hideTitle && (
        <div className="mt-2 px-1">
          <p className="text-xs sm:text-sm font-semibold truncate text-white/85">{movie.title}</p>
        </div>
      )}

      {/* ---------- Netflix jaisa floating popup (sabke samne, row ke bahar) ---------- */}
      {isOpen &&
        createPortal(
          <div
            onMouseEnter={() => clearTimeout(closeT.current)}
            onMouseLeave={closePop}
            onClick={(e) => {
              e.stopPropagation();
              closePop();
              openDetails();
            }}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 99999,
              transformOrigin: "center",
              transform: shown ? "scale(1)" : "scale(0.9)",
              opacity: shown ? 1 : 0,
              transition: reduceMotion()
                ? "none"
                : "transform 240ms cubic-bezier(0.2,0.8,0.2,1), opacity 180ms ease-out",
            }}
            className="cursor-pointer rounded-2xl overflow-hidden bg-[#14101a]/90 backdrop-blur-2xl border border-white/20 shadow-[0_30px_80px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <div className="w-full aspect-[3/3] bg-white/5">{poster}</div>

            <div className="px-3.5 pt-3.5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <button
                  aria-label="Play"
                  onClick={(e) => {
                    e.stopPropagation();
                    closePop();
                    openDetails();
                  }}
                  className="w-10 h-10 shrink-0 bg-white text-black rounded-full flex items-center justify-center hover:bg-white/85 transition shadow-[0_0_20px_rgba(255,255,255,0.3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <Play size={18} fill="black" className="ml-0.5" />
                </button>
                <button
                  aria-label={isAdded ? "Remove from list" : "Add to list"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAdded(!isAdded);
                  }}
                  className={circleBtn}
                >
                  {isAdded ? <Check size={16} /> : <Plus size={16} />}
                </button>
                <button
                  aria-label="Rate"
                  onClick={(e) => e.stopPropagation()}
                  className={circleBtn}
                >
                  <Star size={16} fill="white" />
                </button>
                <button
                  aria-label="More info"
                  onClick={(e) => {
                    e.stopPropagation();
                    closePop();
                    openDetails();
                  }}
                  className={`${circleBtn} ml-auto`}
                >
                  <ChevronDown size={17} />
                </button>
              </div>

              <p className="text-sm font-bold text-white truncate mb-1.5" title={movie.title}>
                {movie.title}
              </p>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-white/70 mb-2">
                <span className="font-bold text-yellow-400">Score {rating}</span>
                {meta.map((m) => (
                  <span key={m} className="flex items-center gap-2">
                    <span className="text-white/30">-</span>
                    {m}
                  </span>
                ))}
              </div>

              <p className="flex flex-wrap items-center gap-y-0.5 text-[13px] leading-snug text-white/55 min-h-[18px]">
                {genres.map((genre, index) => (
                  <span key={genre} className="flex items-center">
                    {index > 0 && <span className="mx-1.5 text-white/30">•</span>}
                    {genre}
                  </span>
                ))}
                {genres.length === 0 && err && (
                  <span className="text-red-400 text-xs">details error: {err}</span>
                )}
              </p>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}