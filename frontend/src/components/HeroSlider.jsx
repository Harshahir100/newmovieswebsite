import { useState, useEffect, useRef } from "react";
import { Play, Info } from "lucide-react";

// Poster neeche jaate-jaate transparent -> peeche wala blurred page-bg dikhta hai
const fadeMask = {
  WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)",
  maskImage: "linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%)",
};

// Neeche ka hissa progressively blur hota hai
const blurMask = {
  WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 85%)",
  maskImage: "linear-gradient(to bottom, transparent 0%, #000 85%)",
};

export default function HeroSlider({ movies, onOpenDetails, onIndexChange }) {
  const [idx, setIdx] = useState(0);
  const touchX = useRef(null);
  const count = movies?.length || 0;

  const go = (d) => setIdx((p) => (p + d + count) % count);

  // Auto-slide (6s), manual change par timer restart
  useEffect(() => {
    if (count < 2) return;
    const t = setTimeout(() => setIdx((p) => (p + 1) % count), 6000);
    return () => clearTimeout(t);
  }, [count, idx]);

  // Home ko batao kaunsi slide active hai (page bg isi se badlega)
  useEffect(() => {
    onIndexChange?.(idx);
  }, [idx, onIndexChange]);

  if (!count) return null;

  const hero = movies[idx] || movies[0];
  const year = hero.release_date?.slice(0, 4);

  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  const chip =
    "inline-flex items-center rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1";

  return (
    <section
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={onTouchEnd}
      className="relative w-full h-[75vh] min-h-[520px] md:h-[78vh]"
    >
      {/* ---------- Sharp poster (bottom me fade) ---------- */}
      <div className="absolute inset-0 overflow-hidden" style={fadeMask}>
        {movies.map((m, i) => (
          <img
            key={m.tmdb_id}
            src={m.backdrop}
            alt={i === idx ? m.title : ""}
            className={`absolute inset-0 h-full w-full object-cover object-[center_20%] transition-[opacity,transform] duration-[1400ms] ease-out motion-reduce:transition-none ${
              i === idx ? "opacity-100 scale-100" : "opacity-0 scale-110"
            }`}
          />
        ))}
      </div>

      {/* ---------- Progressive blur (poster neeche se blur) ---------- */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[45%] z-10 backdrop-blur-2xl"
        style={blurMask}
      />

      {/* ---------- Readability gradients ---------- */}
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/75 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-black/60 to-transparent" />

      {/* ---------- Text ---------- */}
      <div className="absolute z-20 left-4 right-4 sm:left-8 md:left-12 bottom-20 md:bottom-36 max-w-xl">
        {hero.logo ? (
          <img
            src={hero.logo}
            alt={hero.title}
            className="max-h-24 sm:max-h-32 md:max-h-40 w-auto max-w-full mb-4 drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]"
          />
        ) : (
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight uppercase mb-3 drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] line-clamp-2">
            {hero.title}
          </h1>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs md:text-sm text-white/85">
          <span className={`${chip} font-bold text-yellow-400`}>
            ★ {Number(hero.rating || 0).toFixed(1)}
          </span>
          {year && <span className={chip}>{year}</span>}
          <span className={chip}>{hero.media_type === "tv" ? "Series" : "Movie"}</span>
        </div>

        <p className="text-white/80 text-sm md:text-base leading-relaxed mb-5 line-clamp-2 sm:line-clamp-3 drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
          {hero.overview}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onOpenDetails(hero)}
            className="flex items-center gap-2 px-6 md:px-8 py-2.5 md:py-3 rounded-full font-bold text-sm md:text-base text-black bg-white hover:bg-white/85 transition shadow-[0_8px_30px_rgba(255,255,255,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Play fill="black" size={18} />
            Play
          </button>
          <button
            onClick={() => onOpenDetails(hero)}
            className="flex items-center gap-2 px-6 md:px-8 py-2.5 md:py-3 rounded-full font-bold text-sm md:text-base text-white bg-white/15 hover:bg-white/25 backdrop-blur-xl border border-white/25 shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Info size={18} />
            More Info
          </button>
        </div>

        {/* Dots (xl se chhoti screens) */}
        {count > 1 && (
          <div className="flex xl:hidden items-center gap-2 mt-6">
            {movies.map((m, i) => (
              <button
                key={m.tmdb_id}
                onClick={() => setIdx(i)}
                aria-label={`Show ${m.title}`}
                className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                  i === idx ? "w-7 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------- HD tag (md+) ---------- */}
      <div className="hidden md:flex absolute z-20 right-0 top-[52%] items-center border-l-2 border-white/70 bg-black/40 backdrop-blur-md pl-4 pr-6 py-2 text-sm font-semibold text-white">
        HD
      </div>

      {/* ---------- Thumbnails (xl+) ---------- */}
      {count > 1 && (
        <div className="hidden xl:flex absolute z-20 bottom-36 right-12 gap-3 p-2 rounded-2xl bg-white/[0.08] backdrop-blur-2xl border border-white/15 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          {movies.map((m, i) => (
            <button
              key={m.tmdb_id}
              onClick={() => setIdx(i)}
              aria-label={`Show ${m.title}`}
              className={`relative w-24 h-14 rounded-lg overflow-hidden transition-all duration-300 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                i === idx
                  ? "ring-2 ring-white scale-105"
                  : "ring-1 ring-white/20 opacity-60 hover:opacity-100"
              }`}
            >
              <img src={m.backdrop} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}