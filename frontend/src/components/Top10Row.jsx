import SectionRow from "./SectionRow";
import MovieCard from "./MovieCard";

// Netflix jaisa: bade outlined number + poster uske upar overlap
export default function Top10Row({ title = "Top 10", movies, onOpenDetails, onViewAll }) {
  const items = (movies || []).slice(0, 10);
  if (!items.length) return null;

  return (
    <SectionRow title={title} onViewAll={onViewAll}>
      {items.map((m, i) => (
        <div key={m.tmdb_id ?? m.id ?? i} className="relative flex flex-shrink-0 items-end">
          <span
            aria-hidden
            className="relative z-0 inline-block min-w-[0.7em] text-right select-none font-black leading-[0.78] -mr-[0.12em] text-[110px] sm:text-[125px] md:text-[140px] lg:text-[155px]"
            style={{
              color: "rgba(0,0,0,0.35)",
              WebkitTextStroke: "3px rgba(255,255,255,0.3)",
            }}
          >
            {i + 1}
          </span>
          <MovieCard movie={m} onClick={onOpenDetails} hideTitle />
        </div>
      ))}
    </SectionRow>
  );
}