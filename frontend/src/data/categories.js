import {
  Zap, Compass, Star, Smile, ShieldAlert, FileText,
  Ghost, Heart, Music, Film, Search, Tv, Clapperboard, Swords, Rocket,
} from "lucide-react";

// Categories page + Browse page (genre chips) dono yahi data use karte hain
export const CATEGORIES_DATA = {
  movie: [
    { id: 28, name: "Action", color: "from-red-900/80 to-[#1a0505]", icon: Zap },
    { id: 12, name: "Adventure", color: "from-emerald-900/80 to-[#05140b]", icon: Compass },
    { id: 16, name: "Animation", color: "from-purple-900/80 to-[#0f051a]", icon: Star },
    { id: 35, name: "Comedy", color: "from-amber-900/80 to-[#1a0f05]", icon: Smile },
    { id: 80, name: "Crime", color: "from-red-950/80 to-[#120303]", icon: ShieldAlert },
    { id: 99, name: "Documentary", color: "from-blue-900/80 to-[#050f1a]", icon: FileText },
    { id: 18, name: "Drama", color: "from-cyan-900/80 to-[#05141a]", icon: Film },
    { id: 10751, name: "Family", color: "from-green-900/80 to-[#051a0f]", icon: Smile },
    { id: 14, name: "Fantasy", color: "from-fuchsia-900/80 to-[#1a0514]", icon: Star },
    { id: 36, name: "History", color: "from-orange-900/80 to-[#1a0d05]", icon: FileText },
    { id: 27, name: "Horror", color: "from-slate-800/80 to-[#0a0a0a]", icon: Ghost },
    { id: 10402, name: "Music", color: "from-pink-900/80 to-[#1a0510]", icon: Music },
    { id: 9648, name: "Mystery", color: "from-indigo-900/80 to-[#05051a]", icon: Search },
    { id: 10749, name: "Romance", color: "from-rose-900/80 to-[#1a050a]", icon: Heart },
    { id: 878, name: "Sci-Fi", color: "from-teal-900/80 to-[#051a1a]", icon: Rocket },
    { id: 53, name: "Thriller", color: "from-amber-950/80 to-[#140a05]", icon: Zap },
    { id: 10752, name: "War", color: "from-gray-700/80 to-[#0a0a0a]", icon: Swords },
    { id: 37, name: "Western", color: "from-yellow-900/80 to-[#1a1505]", icon: Compass },
  ],
  tv: [
    { id: 10759, name: "Action & Adventure", color: "from-red-900/80 to-[#1a0505]", icon: Zap },
    { id: 16, name: "Animation", color: "from-purple-900/80 to-[#0f051a]", icon: Star },
    { id: 35, name: "Comedy", color: "from-amber-900/80 to-[#1a0f05]", icon: Smile },
    { id: 80, name: "Crime", color: "from-red-950/80 to-[#120303]", icon: ShieldAlert },
    { id: 99, name: "Documentary", color: "from-blue-900/80 to-[#050f1a]", icon: FileText },
    { id: 18, name: "Drama", color: "from-cyan-900/80 to-[#05141a]", icon: Film },
    { id: 10751, name: "Family", color: "from-green-900/80 to-[#051a0f]", icon: Smile },
    { id: 9648, name: "Mystery", color: "from-indigo-900/80 to-[#05051a]", icon: Search },
    { id: 10764, name: "Reality", color: "from-orange-900/80 to-[#1a0d05]", icon: Tv },
    { id: 10765, name: "Sci-Fi & Fantasy", color: "from-teal-900/80 to-[#051a1a]", icon: Rocket },
    { id: 10766, name: "Soap", color: "from-pink-900/80 to-[#1a0510]", icon: Heart },
    { id: 10767, name: "Talk", color: "from-sky-900/80 to-[#05101a]", icon: Clapperboard },
    { id: 10768, name: "War & Politics", color: "from-gray-700/80 to-[#0a0a0a]", icon: Swords },
  ],
};