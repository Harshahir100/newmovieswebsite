import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clapperboard, Tv } from "lucide-react";
import { OTT_PLATFORMS } from "../data/ottPlatforms";
import ContentGrid from "../components/ContentGrid";
import CinematicBg from "../components/CinematicBg";

const glass =
  "bg-white/[0.07] backdrop-blur-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]";

/*
  /platforms           -> saare OTT platforms ka grid
  /platforms?ott=8     -> us OTT ki saari movies + shows (tabs ke saath)
  Header ke Platforms dropdown se bhi yahi URL khulta hai.
*/
export default function Platforms({ onOpenDetails }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ott = params.get("ott");
  const tab = params.get("type") === "tv" ? "tv" : "movie";
  const platform = OTT_PLATFORMS.find((p) => String(p.id) === String(ott));

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [ott]);

  const tabs = [
    { key: "movie", label: "Movies", icon: Clapperboard },
    { key: "tv", label: "TV Shows", icon: Tv },
  ];

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      <CinematicBg />

      <div className="relative z-10 w-full max-w-[1700px] mx-auto pt-24 md:pt-28 pb-20 px-4 md:px-10">
        {!platform ? (
          <>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-8 drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
              Streaming Platforms
            </h1>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-5">
              {OTT_PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/platforms?ott=${p.id}`)}
                  aria-label={`Browse ${p.name}`}
                  className="group flex flex-col items-center justify-center gap-3 h-36 md:h-40 rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_30px_-12px_rgba(0,0,0,0.8)] transition duration-300 hover:-translate-y-1 hover:bg-white/10 hover:border-white/35 hover:shadow-[0_0_30px_rgba(229,9,20,0.25)] motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <img src={p.logo} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-xl object-cover shadow-lg" />
                  <span className="font-semibold text-sm text-white/90">{p.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => navigate("/platforms")}
              className="mb-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white/80 hover:text-white bg-white/[0.07] hover:bg-white/15 backdrop-blur-xl border border-white/15 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <ArrowLeft size={16} />
              All platforms
            </button>

            <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-4">
                <img
                  src={platform.logo}
                  alt=""
                  className="w-14 h-14 md:w-16 md:h-16 rounded-2xl object-cover border border-white/20 shadow-[0_0_30px_rgba(229,9,20,0.25)]"
                />
                <div>
                  <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
                    {platform.name}
                  </h1>
                  <p className="text-white/60 text-sm">Movies and shows streaming on {platform.name}</p>
                </div>
              </div>

              <div role="tablist" className={`inline-flex gap-1 p-1.5 rounded-full ${glass}`}>
                {tabs.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setParams({ ott: platform.id, type: key })}
                    className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                      tab === key
                        ? "bg-gradient-to-b from-red-500 to-red-700 text-white border border-red-300/30 shadow-[0_0_24px_rgba(229,9,20,0.55)]"
                        : "text-white/70 hover:text-white hover:bg-white/10 border border-transparent"
                    }`}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <ContentGrid
              key={`${platform.id}-${tab}`}
              type={tab}
              provider={platform.id}
              onOpenDetails={onOpenDetails}
              emptyText={`No ${tab === "tv" ? "shows" : "movies"} found on ${platform.name} right now.`}
            />
          </>
        )}
      </div>
    </div>
  );
}