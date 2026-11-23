import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import ContentGrid from "../components/ContentGrid";
import CinematicBg from "../components/CinematicBg";
import { CATEGORIES_DATA } from "../data/categories";

/*
  Ek hi page 3 kaam karta hai:
  /movies                    -> All Movies
  /series                    -> All Web Series
  /browse?type=tv&genre=28   -> Category (genre) wali movies / shows
*/
export default function Browse({ onOpenDetails }) {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();

  const type =
    pathname === "/series"
      ? "tv"
      : pathname === "/movies"
      ? "movie"
      : params.get("type") === "tv"
      ? "tv"
      : "movie";
  const genre = params.get("genre");
  const genres = CATEGORIES_DATA[type];
  const genreName = genres.find((g) => String(g.id) === genre)?.name;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const title = genreName
    ? `${genreName} ${type === "tv" ? "Series" : "Movies"}`
    : type === "tv"
    ? "All Web Series"
    : "All Movies";

  const pickGenre = (id) => {
    const next = new URLSearchParams();
    if (pathname === "/browse") next.set("type", type);
    if (id) next.set("genre", id);
    setParams(next);
  };

  const chip = (active) =>
    `shrink-0 px-4 py-2 rounded-full text-sm font-medium transition backdrop-blur-xl border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
      active
        ? "bg-gradient-to-b from-red-500 to-red-700 text-white font-bold border-red-300/30 shadow-[0_0_20px_rgba(229,9,20,0.5)]"
        : "bg-white/[0.07] text-white/75 border-white/15 hover:text-white hover:bg-white/15"
    }`;

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      <CinematicBg />

      <div className="relative z-10 w-full max-w-[1700px] mx-auto pt-24 md:pt-28 pb-20 px-4 md:px-10">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-5 drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
          {title}
        </h1>

        {/* Genre chips */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-3 mb-4 -mx-1 px-1">
          <button onClick={() => pickGenre(null)} className={chip(!genre)}>
            All
          </button>
          {genres.map((g) => (
            <button key={g.id} onClick={() => pickGenre(g.id)} className={chip(String(g.id) === genre)}>
              {g.name}
            </button>
          ))}
        </div>

        <ContentGrid
          key={`${type}-${genre}`}
          type={type}
          genre={genre}
          onOpenDetails={onOpenDetails}
          emptyText="No titles found for this category."
        />
      </div>
    </div>
  );
}