import { useNavigate } from "react-router-dom";

/*
  NOTE: `id` wahi rakho jo aapke PlatformsDropdown / backend (`/platforms?ott=ID`)
  me use hota hai. Neeche TMDB provider ids hain - apne hisaab se badal lo.
  Apni list pass karni ho to: <PlatformStrip platforms={myList} />
*/
const DEFAULT_PLATFORMS = [
  {
    id: 8,
    name: "NETFLIX",
    tile: "from-red-600/45 to-red-950/70 border-red-400/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_28px_rgba(229,9,20,0.3)]",
    text: "text-red-500 font-black tracking-tight text-xl md:text-2xl",
  },
  {
    id: 119,
    name: "prime video",
    tile: "from-sky-500/35 to-blue-950/70 border-sky-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_28px_rgba(56,189,248,0.25)]",
    text: "text-white font-bold text-lg md:text-xl",
  },
  {
    id: 122,
    name: "Hotstar",
    tile: "from-violet-500/35 to-indigo-950/70 border-violet-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_28px_rgba(139,92,246,0.3)]",
    text: "text-white font-bold text-lg md:text-xl",
  },
  {
    id: 350,
    name: "Apple TV+",
    tile: "from-white/20 to-white/[0.04] border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_28px_rgba(255,255,255,0.12)]",
    text: "text-white font-semibold text-lg md:text-xl",
  },
  {
    id: 237,
    name: "SonyLIV",
    tile: "from-blue-500/35 to-blue-950/70 border-blue-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_28px_rgba(59,130,246,0.3)]",
    text: "text-white font-extrabold text-lg md:text-xl",
  },
  {
    id: 232,
    name: "ZEE5",
    tile: "from-emerald-500/30 to-emerald-950/70 border-emerald-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_28px_rgba(16,185,129,0.3)]",
    text: "text-emerald-300 font-black text-xl md:text-2xl",
  },
  {
    id: 970,
    name: "JioCinema",
    tile: "from-pink-500/35 to-rose-950/70 border-pink-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_28px_rgba(236,72,153,0.3)]",
    text: "text-white font-bold text-lg md:text-xl",
  },
  {
    id: 1899,
    name: "max",
    tile: "from-indigo-500/35 to-blue-950/70 border-indigo-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_28px_rgba(99,102,241,0.3)]",
    text: "text-white font-black text-2xl md:text-3xl",
  },
];

export default function PlatformStrip({ platforms = DEFAULT_PLATFORMS, onSelect }) {
  const navigate = useNavigate();

  return (
    <section
      aria-label="Streaming platforms"
      className="mt-5 md:mt-6 flex gap-2.5 md:gap-3 overflow-x-auto hide-scrollbar pt-1 pb-2 px-1"
    >
      {platforms.map((p) => (
        <button
          key={p.id}
          onClick={() => (onSelect ? onSelect(p) : navigate(`/platforms?ott=${p.id}`))}
          aria-label={`Browse ${p.name}`}
          className={`flex-1 min-w-[132px] sm:min-w-[150px] h-16 md:h-20 rounded-2xl border bg-gradient-to-br backdrop-blur-xl flex items-center justify-center transition duration-300 hover:-translate-y-0.5 hover:brightness-125 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${p.tile}`}
        >
          <span className={`${p.text} drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]`}>{p.name}</span>
        </button>
      ))}
    </section>
  );
}