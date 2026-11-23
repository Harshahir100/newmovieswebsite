import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clapperboard, Tv } from "lucide-react";
import { CATEGORIES_DATA } from "../data/categories";
import CinematicBg from "../components/CinematicBg";

const glass =
  "bg-white/[0.07] backdrop-blur-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]";

export default function Categories() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("movie"); // 'movie' | 'tv'

  // Category par click -> us genre ki movies / shows
  const handleCategoryClick = (cat) => {
    navigate(`/browse?type=${activeTab}&genre=${cat.id}`);
  };

  const tabs = [
    { key: "movie", label: "Movies", icon: Clapperboard },
    { key: "tv", label: "TV Shows", icon: Tv },
  ];

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      <CinematicBg />

      <div className="relative z-10 w-full max-w-[1700px] mx-auto pt-24 md:pt-28 pb-20 px-4 md:px-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
          Categories
        </h1>
        <p className="mt-2 mb-6 text-white/60 text-sm md:text-base">
          Pick a genre to see matching movies and shows.
        </p>

        {/* Glass segmented tabs */}
        <div role="tablist" className={`inline-flex gap-1 p-1.5 rounded-full mb-8 ${glass}`}>
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                activeTab === key
                  ? "bg-gradient-to-b from-red-500 to-red-700 text-white border border-red-300/30 shadow-[0_0_24px_rgba(229,9,20,0.55)]"
                  : "text-white/70 hover:text-white hover:bg-white/10 border border-transparent"
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </div>

        {/* Glass category tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
          {CATEGORIES_DATA[activeTab].map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={`${activeTab}-${cat.id}`}
                onClick={() => handleCategoryClick(cat)}
                aria-label={`Browse ${cat.name}`}
                className={`group relative text-left h-28 sm:h-32 rounded-2xl overflow-hidden bg-gradient-to-br ${cat.color} backdrop-blur-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_30px_-12px_rgba(0,0,0,0.8)] transition duration-300 hover:-translate-y-1 hover:border-white/35 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_20px_40px_-12px_rgba(0,0,0,0.9)] motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}
              >
                {/* glass sheen */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />

                {/* watermark icon */}
                <Icon
                  size={100}
                  strokeWidth={1.5}
                  className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-25 group-hover:scale-110 transition duration-300 motion-reduce:transition-none"
                />

                <div className="relative z-10 h-full flex flex-col justify-between p-3.5">
                  <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                    <Icon size={17} className="text-white/90" />
                  </span>
                  <span className="font-bold text-sm tracking-wide text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                    {cat.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}