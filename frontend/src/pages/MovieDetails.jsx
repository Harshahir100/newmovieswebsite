import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client";
import {
  Play, Download, Loader2, Star, Share2, ArrowLeft, Plus, Heart,
  TrendingUp, Clock, Film,
} from "lucide-react";
import PlayerModal from "../components/PlayerModal";

const API_BASE = "http://127.0.0.1:5000";
const IMG = "https://image.tmdb.org/t/p";

const isHindi = (s) =>
  s.is_hindi ||
  s.languages?.some(l => l.code === 'hi' || /hindi/i.test(l.name || '')) ||
  /hindi|\bhin\b/i.test(s.file_title || '');
const isCached = (s) => !!(s.cached || s.is_torbox_cached);
const fmtRuntime = (min) => (min ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : null);
const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const streamRank = (s) => {
  const hindi = isHindi(s);
  if (hindi && isCached(s)) return 0;
  if (hindi) return 1;
  return 2;
};
const sizeOf = (s) => {
  if (Number(s.size_bytes) > 0) return Number(s.size_bytes);
  const m = String(s.size || '').match(/([\d.]+)\s*(TB|GB|MB|KB)/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const mult = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[m[2].toUpperCase()];
  return parseFloat(m[1]) * mult;
};


const SCROLL_CSS = `
.search-scroll {
  scrollbar-width: thin;
  scrollbar-color: #b91c1c #151318;
}

.search-scroll::-webkit-scrollbar {
  width: 7px;
}

.search-scroll::-webkit-scrollbar-track {
  background: #151318;
  border-radius: 20px;
}

.search-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ef4444, #991b1b, #450a0a);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.12);
}

.search-scroll::-webkit-scrollbar-thumb:hover {
  background: #ef4444;
}
`;

<style>{SCROLL_CSS}</style>

/* ---------- Glassmorphism helpers ---------- */
const glass = "bg-white/[0.06] backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.45)]";
const glassStrong = "bg-black/40 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]";

// Progressive blur: ek layer sirf [from%..to%] ke baad blur dikhata hai
const blurLayer = (px, from, to) => {
  const mask = `linear-gradient(to bottom, transparent ${from}%, #000 ${to}%, #000 100%)`;
  return {
    backdropFilter: `blur(${px}px)`,
    WebkitBackdropFilter: `blur(${px}px)`,
    maskImage: mask,
    WebkitMaskImage: mask,
  };
};

export default function MovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [details, setDetails] = useState(null);
  const [tab, setTab] = useState('overview');
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playingStream, setPlayingStream] = useState(null);
  const [inList, setInList] = useState(false);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setDetails(null);
    api.get(`/movie/${id}/details`)
      .then(res => setDetails(res.data))
      .catch(() => setDetails(null));
  }, [id]);

  const fetchStreams = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/movie/${id}/streams`);
      setStreams(res?.data?.streams || []);
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || "Failed to load streams.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStreams();
  }, [id]);

  const visibleStreams = useMemo(() => {
    return streams
      .map((st, i) => ({ st, i }))
      .sort((a, b) =>
        streamRank(a.st) - streamRank(b.st) ||
        sizeOf(a.st) - sizeOf(b.st) ||
        a.i - b.i
      )
      .map(({ st }) => st);
  }, [streams]);

  if (!details && loading) {
    return <div className="min-h-screen bg-[#0b0b0b] flex items-center justify-center text-red-500"><Loader2 className="animate-spin" size={48} /></div>;
  }

  const d = details || {};
  const title = d.title || "Untitled";
  const overview = d.overview || "";
  const dateRaw = d.release_date || '';
  const year = dateRaw.slice(0, 4);
  const runtimeMin = d.runtime;
  const rating = d.vote_average;
  const votes = d.vote_count;
  const genres = (d.genres || []).map(g => (typeof g === 'string' ? g : g.name));

  // Backdrop (landscape) best lagta hai. Poster chahiye to: d.poster_path use karo
  const bgPath = d.backdrop_path || d.poster_path;
  const backdrop = bgPath ? `${IMG}/w1280${bgPath}` : null;
  const ambient = bgPath ? `${IMG}/w300${bgPath}` : null;

  const logo = d.images?.logos?.find(l => l.iso_639_1 === 'en') || d.images?.logos?.[0];
  const logoUrl = logo ? `${IMG}/w500${logo.file_path}` : null;

  const castFull = d.credits?.cast || [];
  const crew = d.credits?.crew || [];
  const director = uniq(crew.filter(c => c.job === 'Director').map(c => c.name)).join(', ');
  const writer = uniq(crew.filter(c => ['Writer', 'Screenplay', 'Story'].includes(c.job)).map(c => c.name)).join(', ');
  const language = uniq((d.spoken_languages || []).map(l => l.english_name || l.name)).join(', ');
  const country = uniq((d.production_countries || []).map(c => c.name)).join(', ');
  const status = d.status;

  const trailer = (d.videos?.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer')
    || (d.videos?.results || []).find(v => v.site === 'YouTube');

  const detailRows = [
    ['Director', director],
    ['Writer', writer],
    ['Cast', castFull.slice(0, 14).map(c => c.name).join(', ')],
    ['Genre', genres.join(', ')],
    ['Release date', fmtDate(dateRaw)],
    ['Runtime', fmtRuntime(runtimeMin)],
    ['Language', language],
    ['Country', country],
    ['Status', status],
    ['Rating', rating ? `${Number(rating).toFixed(1)}/10${votes ? ` · ${votes.toLocaleString()} votes` : ''}` : null],
  ].filter(([, v]) => v);

  const handleShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
    } catch { }
  };

  const handleWatchNow = () => {
    if (visibleStreams.length > 0) setPlayingStream(visibleStreams[0]);
    else document.getElementById('streams-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const circleBtn = (active) =>
    `w-14 h-14 rounded-full border flex items-center justify-center transition backdrop-blur-md ${active ? 'bg-red-600 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.6)]' : 'bg-white/10 border-white/25 hover:border-red-500 hover:bg-white/20'}`;

  const tabBtn = (key, label) => (
    <button key={key} onClick={() => setTab(key)} className={`relative px-5 py-4 text-sm md:text-base font-extrabold tracking-wider uppercase transition ${tab === key ? 'text-white' : 'text-gray-400 hover:text-gray-200'}`}>
      {label}
      {tab === key && <span className="absolute left-0 right-0 -bottom-px h-[3px] bg-red-600 shadow-[0_0_12px_rgba(220,38,38,0.9)]" />}
    </button>
  );

  return (
    <>
      <style>{SCROLL_CSS}</style>
      <div className="relative min-h-screen bg-[#0b0b0b] text-white pb-20 overflow-x-hidden">

        {/* 1) AMBIENT GLOW: poster ke colors poore page me (fixed, heavy blur) */}
        {ambient && (
          <div className="fixed inset-0 z-0 pointer-events-none">
            <img src={ambient} alt="" className="w-full h-full object-cover scale-125 blur-[80px] saturate-150 opacity-70" />
            <div className="absolute inset-0 bg-[#0b0b0b]/55" />
          </div>
        )}

        {/* 2) POSTER BG: upar sharp -> neeche gradually blur + dark */}
        {backdrop && (
          <div
            className="absolute top-0 inset-x-0 h-[150vh] z-[1] pointer-events-none"
            style={{
              maskImage: 'linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 65%, transparent 100%)',
            }}
          >
            <img src={backdrop} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />

            {/* progressive blur bands */}
            <div className="absolute inset-0" style={blurLayer(2, 25, 40)} />
            <div className="absolute inset-0" style={blurLayer(6, 38, 52)} />
            <div className="absolute inset-0" style={blurLayer(12, 50, 64)} />
            <div className="absolute inset-0" style={blurLayer(22, 62, 76)} />
            <div className="absolute inset-0" style={blurLayer(36, 74, 90)} />

            {/* progressive dark */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/35 via-40% to-[#0b0b0b]/90" />
            {/* left cinematic vignette */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent" />
          </div>
        )}

        {/* CONTENT */}
        <div className="relative z-10">
          {/* HERO */}
          <section className="relative min-h-[88vh] flex items-end">
            <button onClick={() => navigate(-1)} className={`absolute top-24 left-5 md:left-10 z-10 flex items-center gap-2 ${glassStrong} hover:bg-red-600/80 px-4 py-2 rounded-xl font-semibold transition`}>
              <ArrowLeft size={18} /> Back
            </button>

            <div className="relative w-full px-5 md:px-12 pb-14 pt-28">
              {logoUrl ? (
                <img src={logoUrl} alt={title} className="max-h-40 md:max-h-56 max-w-[85%] md:max-w-xl object-contain object-left mb-6 drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]" />
              ) : (
                <h1 className="text-5xl md:text-8xl font-black tracking-wide leading-none mb-6 max-w-4xl drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]">{title}</h1>
              )}

              <div className="flex flex-wrap items-center gap-4 text-gray-200 font-medium">
                {rating ? (
                  <span className="flex items-center gap-1.5 text-red-500 font-bold">
                    <Star size={16} className="text-yellow-400" fill="currentColor" /> {Number(rating).toFixed(1)}
                  </span>
                ) : null}
                {year && <span>{year}</span>}
                {runtimeMin && <span>{fmtRuntime(runtimeMin)}</span>}
                <span className="text-xs font-bold border border-white/50 px-1.5 py-0.5 rounded">HD</span>
              </div>

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {genres.map(g => <span key={g} className="text-sm bg-white/10 backdrop-blur-md border border-white/15 px-4 py-1.5 rounded-full">{g}</span>)}
                </div>
              )}

              {overview && <p className="mt-5 text-gray-100 md:text-lg leading-relaxed max-w-3xl line-clamp-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">{overview}</p>}

              <div className="flex items-center gap-3 mt-7">
                <button onClick={handleWatchNow} className="bg-white text-black hover:bg-red-600 hover:text-white font-bold px-8 h-14 rounded-xl flex items-center gap-3 text-lg transition shadow-[0_8px_30px_rgba(255,255,255,0.15)]">
                  <Play size={18} fill="currentColor" /> Watch Now
                </button>
                <button onClick={() => setInList(v => !v)} className={circleBtn(inList)}><Plus size={22} /></button>
                <button onClick={() => setLiked(v => !v)} className={circleBtn(liked)}><Heart size={22} fill={liked ? 'white' : 'none'} /></button>
                <button onClick={handleShare} className={circleBtn(false)}><Share2 size={20} /></button>
              </div>
            </div>
          </section>

          {/* TABS */}
          <div className="border-b border-white/10 flex justify-center bg-black/30 backdrop-blur-xl sticky top-[72px] z-40">
            {tabBtn('overview', 'Overview')}
            {tabBtn('details', 'Details')}
            {tabBtn('trailer', 'Trailer')}
          </div>

          <div className="px-5 md:px-11 py-8 space-y-10 max-w-7xl mx-auto">
            {tab === 'overview' && (
              <>
                <div className={`grid grid-cols-2 md:grid-cols-4 ${glass} rounded-2xl overflow-hidden`}>
                  <div className="flex items-center gap-4 p-6 md:border-r border-white/10">
                    <Star size={26} className="text-yellow-400" fill="currentColor" />
                    <div><p className="font-bold text-lg">{rating ? `${Number(rating).toFixed(1)}/10` : 'N/A'}</p><p className="text-sm text-gray-400">{votes ? `${votes.toLocaleString()} votes` : 'Rating'}</p></div>
                  </div>
                  <div className="flex items-center gap-4 p-6 md:border-r border-white/10">
                    <TrendingUp size={26} className="text-emerald-400" />
                    <div><p className="font-bold text-lg">{status || 'N/A'}</p><p className="text-sm text-gray-400">Status</p></div>
                  </div>
                  <div className="flex items-center gap-4 p-6 md:border-r border-white/10">
                    <Clock size={26} className="text-violet-400" />
                    <div><p className="font-bold text-lg">{fmtRuntime(runtimeMin) || 'N/A'}</p><p className="text-sm text-gray-400">Runtime</p></div>
                  </div>
                  <div className="flex items-center gap-4 p-6">
                    <Film size={26} className="text-sky-400" />
                    <div><p className="font-bold text-lg">Movie</p><p className="text-sm text-gray-400">Type</p></div>
                  </div>
                </div>

                {overview && (
                  <div className={`${glass} rounded-2xl p-6`}>
                    <h2 className="text-xl font-bold mb-2">{title} {year && `(${year})`}</h2>
                    <p className="text-gray-300 text-lg leading-relaxed">{overview}</p>
                  </div>
                )}

                {castFull.length > 0 && (
                  <div>
                    <h3 className="text-xl font-extrabold uppercase mb-6">Top Cast</h3>
                    <div className="flex gap-4 overflow-x-auto rb-scroll pb-4">
                      {castFull.slice(0, 16).map(c => (
                        <div key={c.id || c.name} className={`w-28 shrink-0 text-center ${glass} rounded-2xl py-4 px-2`}>
                          {c.profile_path ? (
                            <img src={`${IMG}/w185${c.profile_path}`} alt={c.name} className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-white/20" />
                          ) : (
                            <div className="w-20 h-20 rounded-full mx-auto bg-white/10 border-2 border-white/20 flex items-center justify-center text-2xl font-bold text-red-500">{c.name?.[0]}</div>
                          )}
                          <p className="text-sm font-semibold mt-2 leading-tight">{c.name}</p>
                          {c.character && <p className="text-xs text-gray-400 mt-0.5 leading-tight">{c.character}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'details' && (
              <div className={`max-w-4xl ${glass} rounded-2xl px-6`}>
                {detailRows.map(([k, v]) => (
                  <div key={k} className="flex gap-4 py-4 border-b border-white/10 last:border-b-0">
                    <div className="w-40 md:w-56 shrink-0 text-gray-400">{k}</div>
                    <div className="text-gray-100">{v}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'trailer' && (
              trailer ? (
                <div className="max-w-5xl mx-auto aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
                  <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${trailer.key}`} title="Trailer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              ) : <p className="text-gray-400 text-center py-16">Trailer available nahi hai.</p>
            )}

            {/* STREAMS */}
            <div id="streams-section">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <h3 className="text-xl font-bold">Available Streams</h3>
                {!loading && !error && <span className="text-sm text-gray-400">{visibleStreams.length} streams</span>}
              </div>

              {loading ? (
                <div className="flex items-center gap-3 text-red-500 py-8 justify-center"><Loader2 className="animate-spin" /> Fetching streams...</div>
              ) : error ? (
                <div className="text-red-300 bg-red-500/10 backdrop-blur-md border border-red-500/20 p-4 rounded-xl text-center">{error}</div>
              ) : visibleStreams.length === 0 ? (
                <div className="text-gray-400 text-center py-8">No streams found.</div>
              ) : (
                <div className="space-y-3">
                  {visibleStreams.map((stream, idx) => (
                    <div key={stream.token || idx} className={`${glass} hover:bg-white/10 transition p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                      <div>
                        <p className="font-semibold text-sm truncate max-w-2xl">{stream.file_title}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {isCached(stream) && (
                            <span className="text-xs bg-green-600/90 text-white px-2 py-1 rounded font-bold shadow-[0_0_12px_rgba(22,163,74,0.5)]">
                              ⚡ CACHED
                            </span>
                          )}
                          {isHindi(stream) && <span className="text-xs bg-red-600 px-2 py-1 rounded font-bold">HINDI</span>}
                          <span className="text-xs bg-white/10 px-2 py-1 rounded">{stream.quality}</span>
                          <span className="text-xs bg-white/10 px-2 py-1 rounded">{stream.size}</span>
                          {stream.codec?.map(c => <span key={c} className="text-xs bg-white/10 px-2 py-1 rounded">{c}</span>)}
                          {stream.languages?.map(l => (
                            <span key={l.code} className="text-xs bg-white/10 px-2 py-1 rounded flex items-center gap-1">
                              <img src={`https://flagcdn.com/w20/${l.code}.png`} width="12" alt="" /> {l.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setPlayingStream(stream)} className="bg-red-600 text-white hover:bg-red-500 px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-sm transition shadow-[0_4px_20px_rgba(220,38,38,0.4)]">
                          <Play size={16} fill="white" /> Play
                        </button>
                        <a href={`${API_BASE}/api/download/${stream.token}`} className="bg-white/10 hover:bg-white/20 border border-white/10 p-2 rounded-xl transition">
                          <Download size={18} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {playingStream && (
        <PlayerModal
          streams={visibleStreams}
          initialStream={playingStream}
          title={title}
          movie={d}
          onClose={() => setPlayingStream(null)}
        />
      )}
    </>
  );
}