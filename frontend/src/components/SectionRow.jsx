import { useRef } from "react";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";

const arrowBtn =
  "hidden md:flex absolute top-[48%] -translate-y-1/2 z-40 items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur-xl border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.6)] text-white opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

export default function SectionRow({ title, onViewAll, children }) {
  const scroller = useRef(null);

  const scrollByPage = (dir) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    // Named group (group/row) -> MovieCard ke `group` se conflict nahi hoga
    <div className="group/row relative mt-7 md:mt-9">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h2 className="flex items-center gap-3 text-lg md:text-2xl font-bold tracking-tight text-white">
          <span className="h-5 md:h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-700 shadow-[0_0_12px_rgba(229,9,20,0.8)]" />
          {title}
        </h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-1.5 text-sm font-medium text-white/80 hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-full px-2 py-1"
          >
            View All
            <ArrowRight size={16} />
          </button>
        )}
      </div>

      <div
        ref={scroller}
        className="flex gap-3 md:gap-4 overflow-x-auto hide-scrollbar scroll-smooth pb-3 pt-1 px-1 overscroll-x-contain"
      >
        {children}
      </div>

      <button
        aria-label={`Scroll ${title} left`}
        onClick={() => scrollByPage(-1)}
        className={`${arrowBtn} left-0`}
      >
        <ChevronLeft size={24} />
      </button>
      <button
        aria-label={`Scroll ${title} right`}
        onClick={() => scrollByPage(1)}
        className={`${arrowBtn} right-0`}
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
}