import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  Download,
  Menu,
  X,
  Bell,
  Home,
  Film,
  Tv,
  Radio,
  LayoutGrid,
} from "lucide-react";
import PlatformsDropdown from "./PlatformsDropdown";
import ComingSoonToast from "./ComingSoonToast";

const glass =
  "bg-white/[0.07] backdrop-blur-2xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]";

const glassStrong =
  "bg-[#0d0709]/80 backdrop-blur-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]";

const activeCls =
  "bg-gradient-to-b from-red-500 to-red-700 text-white font-semibold border border-red-300/30 shadow-[0_0_24px_rgba(229,9,20,0.55)]";

const circle =
  "relative flex items-center justify-center w-11 h-11 rounded-full text-white/85 hover:text-white hover:bg-white/15 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 " +
  glass;

function NavBtn({ icon: Icon, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        active
          ? activeCls
          : "text-white/75 hover:text-white hover:bg-white/10 border border-transparent"
      }`}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

export default function Header({ onSearchClick }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null); // 'Live TV' / 'Download App'

  const comingSoon = (label) => {
    setOpen(false);
    setToast(label);
  };

  const isActive = (path) => location.pathname === path;

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (path) => {
    navigate(path);
    setOpen(false);
  };

  // `soon` wale items page nahi kholte, 'Coming soon' toast dikhate hain
  const onNav = (item) => (item.soon ? comingSoon(item.soon) : go(item.path));

  // Desktop nav (lg+)
  const mainNav = [
    { label: "Home", icon: Home, path: "/", active: isActive("/") },
    {
      label: "Movies",
      icon: Film,
      path: "/movies",
      active: isActive("/movies"),
    },
    { label: "Series", icon: Tv, path: "/series", active: isActive("/series") },
    {
      label: "Categories",
      icon: LayoutGrid,
      path: "/categories",
      active:
        isActive("/categories") || location.pathname.startsWith("/browse"),
    },
    { label: "Live TV", icon: Radio, soon: "Live TV" },
  ];

  // Mobile / tablet drawer
  const menuItems = [
    ...mainNav,
    { label: "Trending", icon: Film, path: "/" },
    {
      label: "Platforms",
      icon: LayoutGrid,
      path: "/platforms",
      active: isActive("/platforms"),
    },
    { label: "Tamil/Telugu", icon: Film, path: "/" },
  ];

  return (
    <header className="fixed top-0 inset-x-0 z-50 px-3 md:px-6 pt-3 md:pt-4 pointer-events-none">
      <div className="relative flex items-center gap-3 w-full max-w-[1700px] mx-auto pointer-events-auto">
        {/* LOGO */}
        <button
          onClick={() => go("/")}
          aria-label="vegafilms home"
          className="flex items-center gap-2 mr-1 lg:mr-3 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <span className="flex items-center justify-center w-8 h-8 -mr-2">
            <svg
              viewBox="0 0 24 24"
              className="w-full h-full text-brand fill-current drop-shadow-[0_0_10px_rgba(229,9,20,0.7)]"
            >
              <path d="M3 2h5l4 14 4-14h5l-7 20H10L3 2z" />
            </svg>
          </span>

          <span className="text-xl md:text-2xl font-bold tracking-wide whitespace-nowrap text-white">
            ega<span className="text-brand">Films</span>
          </span>
        </button>

        {/* DESKTOP NAV */}
        <nav
          className={`hidden lg:flex items-center gap-1 rounded-full p-1.5 ${glass}`}
        >
          {mainNav.map((item) => (
            <NavBtn
              key={item.label}
              icon={item.icon}
              active={item.active}
              onClick={() => onNav(item)}
            >
              {item.label}
            </NavBtn>
          ))}
          <PlatformsDropdown
            onSelectPlatform={(p) => navigate(`/platforms?ott=${p.id}`)}
          />
        </nav>

        {/* RIGHT SIDE */}
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {/* Search field (xl+) */}
          <button
            onClick={onSearchClick}
            className={`hidden xl:flex items-center gap-3 h-11 w-[300px] 2xl:w-[360px] rounded-full px-4 text-sm text-white/55 hover:text-white/80 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${glass}`}
          >
            <Search size={18} className="text-white/85" />
            Search movies, series...
          </button>

          {/* Search icon (below xl) */}
          <button
            onClick={onSearchClick}
            aria-label="Search"
            className={`xl:hidden ${circle}`}
          >
            <Search size={18} />
          </button>

          {/* Download App (2xl+) */}
          <button
            onClick={() => comingSoon("Download App")}
            className="hidden 2xl:flex items-center gap-2 h-11 px-5 rounded-full text-sm font-bold text-white bg-gradient-to-b from-red-500 to-red-700 border border-red-300/30 shadow-[0_0_24px_rgba(229,9,20,0.5)] hover:brightness-110 transition"
          >
            <Download size={16} />
            Download App
          </button>

          {/* Notification */}
          <button aria-label="Notifications" className={circle}>
            <Bell size={18} />
            <span className="absolute top-2.5 right-3 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]" />
          </button>

          {/* Menu (below lg) */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className={`lg:hidden ${circle}`}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* MOBILE / TABLET DRAWER */}
        {open && (
          <div
            className={`lg:hidden absolute left-0 right-0 top-full mt-2 rounded-3xl p-3 ${glassStrong}`}
          >
            <div className="grid grid-cols-2 gap-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => onNav(item)}
                    className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                      item.active
                        ? activeCls
                        : "bg-white/[0.06] text-white/80 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => comingSoon("Download App")}
              className="mt-3 w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-b from-red-500 to-red-700 border border-red-300/30 shadow-[0_0_24px_rgba(229,9,20,0.4)]"
            >
              <Download size={16} />
              Download App
            </button>
          </div>
        )}
      </div>
      <ComingSoonToast message={toast} onClose={() => setToast(null)} />
    </header>
  );
}
