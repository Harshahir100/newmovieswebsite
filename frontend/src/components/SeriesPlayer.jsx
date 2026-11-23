import { useState, useEffect } from "react";
import {
  X, Play, Download, Loader2, ChevronDown,
} from "lucide-react";
import api from "../api/client";
import PlayerModal from "./PlayerModal";

const API_BASE = "http://127.0.0.1:5000";
const IMG = "https://image.tmdb.org/t/p";

/* ---------- Glassmorphism helpers ---------- */
const glass =
  "bg-white/[0.06] backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.45)]";
const glassPanel =
  "bg-black/35 backdrop-blur-2xl border-white/10";

// Progressive blur: ye layer [from%..to%] ke baad blur dikhana shuru karta hai
const blurLayer = (px, from, to) => {
  const mask = `linear-gradient(to bottom, transparent ${from}%, #000 ${to}%, #000 100%)`;
  return {
    backdropFilter: `blur(${px}px)`,
    WebkitBackdropFilter: `blur(${px}px)`,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
};

export default function SeriesPlayer({ tmdbId, seriesTitle, seasons, initialSeason, initialEpisode, onClose }) {
  const [selectedSeason, setSelectedSeason] = useState(initialSeason || 1);
  const [episodes, setEpisodes] = useState([]);
  const [activeEpisode, setActiveEpisode] = useState(initialEpisode || null);

  const [streams, setStreams] = useState([]);
  const [activeStream, setActiveStream] = useState(null);

  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [loadingStreams, setLoadingStreams] = useState(false);

  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [streamToPlay, setStreamToPlay] = useState(null);

  useEffect(() => {
    if (!selectedSeason) return;
    const fetchEpisodes = async () => {
      try {
        setLoadingEpisodes(true);
        const res = await api.get(`/tv/${tmdbId}/season/${selectedSeason}`);
        setEpisodes(res.data.episodes || []);
      } catch (err) {
        console.error("Failed to load episodes", err);
      } finally {
        setLoadingEpisodes(false);
      }
    };
    fetchEpisodes();
  }, [tmdbId, selectedSeason]);

  useEffect(() => {
    if (!activeEpisode) return;
    const fetchStreams = async () => {
      try {
        setLoadingStreams(true);
        setStreams([]);
        setActiveStream(null);
        const res = await api.get(`/tv/${tmdbId}/streams?season=${selectedSeason}&episode=${activeEpisode.number}`);
        const fetchedStreams = res.data.streams || [];
        setStreams(fetchedStreams);
        if (fetchedStreams.length > 0) setActiveStream(fetchedStreams[0]);
      } catch (err) {
        console.error("Failed to load streams", err);
      } finally {
        setLoadingStreams(false);
      }
    };
    fetchStreams();
  }, [tmdbId, selectedSeason, activeEpisode]);

  const handlePlay = (stream) => {
    setStreamToPlay(stream);
    setIsVideoOpen(true);
  };

  // Background: active episode ki image se
  const bgPath = activeEpisode?.still_path;
  const bgSharp = bgPath ? `${IMG}/w1280${bgPath}` : null;
  const bgAmbient = bgPath ? `${IMG}/w300${bgPath}` : null;

  return (
    <div className="fixed inset-0 z-[100] flex bg-[#0b0b0b] text-white overflow-hidden">

      {/* ===== BACKGROUND LAYERS ===== */}
      {bgAmbient && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <img
            key={bgAmbient}
            src={bgAmbient}
            alt=""
            className="w-full h-full object-cover scale-125 blur-[80px] saturate-150 opacity-70"
          />
          <div className="absolute inset-0 bg-[#0b0b0b]/55" />
        </div>
      )}

      {bgSharp && (
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            maskImage: "linear-gradient(to bottom, #000 0%, #000 60%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 60%, transparent 100%)",
          }}
        >
          <img key={bgSharp} src={bgSharp} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />

          {/* progressive blur bands: upar sharp -> neeche heavy blur */}
          <div className="absolute inset-0" style={blurLayer(2, 15, 30)} />
          <div className="absolute inset-0" style={blurLayer(6, 28, 42)} />
          <div className="absolute inset-0" style={blurLayer(12, 40, 54)} />
          <div className="absolute inset-0" style={blurLayer(22, 52, 66)} />
          <div className="absolute inset-0" style={blurLayer(36, 64, 80)} />

          {/* progressive dark */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/45 via-40% to-[#0b0b0b]/90" />
        </div>
      )}

      {/* ===== LEFT SIDEBAR: AVAILABLE STREAMS ===== */}
      <div className={`relative z-10 w-[300px] ${glassPanel} border-r flex flex-col shrink-0`}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-bold text-lg text-white">Available Streams ({streams.length})</h3>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white bg-white/10 backdrop-blur-md border border-white/10 hover:bg-red-600 hover:border-red-600 p-1.5 rounded-full transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {loadingStreams ? (
            <div className="flex items-center justify-center h-full text-red-500">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : streams.length === 0 ? (
            <p className="text-gray-400 text-center mt-10">No streams found.</p>
          ) : (
            streams.map((stream, idx) => {
              const isHindi = stream.languages?.some(l => l.code === 'in' || l.name?.toLowerCase().includes('hindi'));
              const isActive = activeStream?.token === stream.token;

              return (
                <div
                  key={idx}
                  onClick={() => setActiveStream(stream)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all backdrop-blur-md ${
                    isActive
                      ? 'bg-white/10 border-red-500/70 shadow-[0_0_20px_rgba(220,38,38,0.25)]'
                      : 'bg-white/[0.04] border-white/10 hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">
                      {stream.quality || "HD"}
                      {isHindi && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded">HINDI</span>}
                      {stream.cached && (
                        <span className="text-[10px] bg-green-600/90 text-white px-1.5 py-0.5 rounded font-bold shadow-[0_0_10px_rgba(22,163,74,0.5)]">
                          ⚡ CACHED
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-300">{stream.size || "Size N/A"}</span>
                  </div>

                  <div className="text-[11px] text-gray-400 mb-3 truncate">
                    {stream.languages?.map(l => l.name).join(', ') || "Unknown"}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePlay(stream); }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition ${
                        isActive
                          ? 'bg-red-600 text-white shadow-[0_4px_16px_rgba(220,38,38,0.4)]'
                          : 'bg-white text-black hover:bg-gray-200'
                      }`}
                    >
                      <Play size={12} fill={isActive ? "white" : "black"} /> Play
                    </button>
                    <a
                      href={`${API_BASE}/api/download/${stream.token}`}
                      className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-white transition"
                      download
                    >
                      <Download size={14} />
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ===== CENTER: PREVIEW ===== */}
      <div className="relative z-10 flex-1 flex flex-col">
        <div className="relative w-full h-full flex flex-col items-center justify-center">
          {activeEpisode ? (
            <div className="w-full max-w-4xl px-8 text-center">
              <div className="relative aspect-video rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)] bg-black/40 border border-white/15 group">
                {activeEpisode.still_path ? (
                  <img
                    src={`${IMG}/original${activeEpisode.still_path}`}
                    alt={activeEpisode.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">No Image</div>
                )}

                <div
                  onClick={() => activeStream && handlePlay(activeStream)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                >
                  <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.7)] hover:scale-110 transition">
                    <Play size={32} fill="white" className="ml-1 text-white" />
                  </div>
                </div>
              </div>

              <div className={`${glass} rounded-2xl px-6 py-5 mt-6 inline-block w-full`}>
                <h1 className="text-3xl font-bold mb-2 drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
                  {seriesTitle} - S{String(selectedSeason).padStart(2, '0')}E{String(activeEpisode.number).padStart(2, '0')}
                </h1>
                <p className="text-gray-300 text-sm max-w-2xl mx-auto">
                  {activeEpisode.overview || "No description available."}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-lg">Select an episode to preview</div>
          )}
        </div>
      </div>

      {/* ===== RIGHT SIDEBAR: EPISODE SELECTION ===== */}
      <div className={`relative z-10 w-[340px] ${glassPanel} border-l flex flex-col shrink-0`}>
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="relative">
            <select
              value={selectedSeason}
              onChange={(e) => { setSelectedSeason(Number(e.target.value)); setActiveEpisode(null); }}
              className="appearance-none bg-transparent text-xl font-bold text-white pr-8 outline-none cursor-pointer"
            >
              {seasons?.map(s => <option key={s.number} value={s.number} className="bg-[#1a1a1a] text-sm">Season {s.number}</option>)}
            </select>
            <ChevronDown size={18} className="absolute right-0 top-1/2 -translate-y-1/2 text-white pointer-events-none" />
          </div>
          <span className="text-xs font-bold text-gray-400 tracking-wider">{episodes.length} EPISODES</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {loadingEpisodes ? (
            <div className="flex justify-center py-10 text-red-500"><Loader2 className="animate-spin" size={32} /></div>
          ) : episodes.map(ep => {
            const isSelected = activeEpisode?.number === ep.number;
            return (
              <div
                key={ep.number}
                onClick={() => setActiveEpisode(ep)}
                className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all border backdrop-blur-md ${
                  isSelected
                    ? 'border-red-500/60 bg-white/10 shadow-[0_0_18px_rgba(220,38,38,0.2)]'
                    : 'border-transparent hover:bg-white/10 hover:border-white/10'
                }`}
              >
                <div className="w-24 h-14 shrink-0 rounded-lg overflow-hidden bg-white/5 relative">
                  {ep.still_path ? (
                    <img src={`${IMG}/w300${ep.still_path}`} alt={ep.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">No Img</div>
                  )}
                  {isSelected && (
                    <div className="absolute inset-0 bg-red-600/30 flex items-center justify-center">
                      <Play size={16} fill="white" className="text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-bold mb-0.5 ${isSelected ? 'text-red-400' : 'text-gray-400'}`}>
                    EP {ep.number}
                  </div>
                  <h4 className="text-xs font-semibold text-white truncate">{ep.name || `Episode ${ep.number}`}</h4>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PLAYER MODAL */}
      {isVideoOpen && streamToPlay && (
        <PlayerModal
          streams={streams}
          initialStream={streamToPlay}
          title={`${seriesTitle} S${String(selectedSeason).padStart(2, '0')}E${String(activeEpisode.number).padStart(2, '0')}`}
          onClose={() => setIsVideoOpen(false)}
        />
      )}
    </div>
  );
}