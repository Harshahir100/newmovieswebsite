  import { useEffect, useRef, useState, useCallback } from "react";
  import {
    X,
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    Sun,
    RotateCcw,
    RotateCw,
    Loader2,
    Copy,
    AlertTriangle,
    SkipForward,
  } from "lucide-react";

  const API_BASE = import.meta.env.VITE_API_BASE_URL;
  const QUALITY_ORDER = ["2160p", "1080p", "720p", "480p", "Unknown"];
  const MIN_BRIGHT = 0.2;
  const MAX_BRIGHT = 1.8;

  const srcOf = (s) => `${API_BASE}/api/play/${s.token}`;
  const langsOf = (s) =>
    s.languages?.length ? s.languages.map((l) => l.name) : ["Other"];
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  function fmt(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const p = (n) => String(n).padStart(2, "0");
    return (h ? `${h}:` : "") + `${p(m)}:${p(r)}`;
  }

  function compatScore(s) {
    let score = 0;
    if (s.codec?.includes("HEVC")) score += 2;
    if (s.codec?.includes("AV1")) score += 1;
    if (s.codec?.includes("H.264")) score -= 1;
    return score;
  }

  function preferredAudio(tracks, wantLang) {
    let i = tracks.findIndex((a) => a.lang === wantLang);
    if (i < 0) i = tracks.findIndex((a) => a.lang === "Hindi");
    return i < 0 ? 0 : i;
  }

  export default function PlayerModal({
    streams,
    initialStream,
    title,
    movie,
    season,
    episode,
    onClose,
  }) {
    // ==========================================
    // CONTINUE WATCHING LOGIC (Save to LocalStorage)
    // ==========================================
    useEffect(() => {
      if (movie && movie.tmdb_id) {
        const historyData = {
          tmdb_id: movie.tmdb_id,
          media_type: movie.media_type || (season ? "tv" : "movie"),
          title: movie.title || movie.name,
          poster: movie.poster_path
            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
            : movie.poster,
          backdrop: movie.backdrop_path
            ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
            : movie.backdrop,
          season: season || null,
          episode: episode || null,
          updatedAt: Date.now(),
        };

        let history = JSON.parse(
          localStorage.getItem("continueWatching") || "[]",
        );
        history = history.filter((item) => item.tmdb_id !== historyData.tmdb_id);
        history.unshift(historyData);
        localStorage.setItem(
          "continueWatching",
          JSON.stringify(history.slice(0, 10)),
        );
      }
    }, [movie, season, episode]);

    const videoRef = useRef(null);
    const wrapRef = useRef(null);
    const resumeRef = useRef(null);
    const hideTimer = useRef(null);
    const hudTimer = useRef(null);
    const gestureRef = useRef(null);
    const suppressClick = useRef(false);
    const scrubRef = useRef(null);
    const langRef = useRef("");
    const offsetRef = useRef(0);
    const durRef = useRef(0);

    const [current, setCurrent] = useState(initialStream);
    const [lang, setLang] = useState(() => {
      const l = langsOf(initialStream);
      return l.includes("Hindi") ? "Hindi" : l[0];
    });

    const [probe, setProbe] = useState({ loading: true });
    const [playMode, setPlayMode] = useState("direct");
    const [audioIdx, setAudioIdx] = useState(0);
    const [vcodec, setVcodec] = useState("copy");
    const [startSec, setStartSec] = useState(0);

    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [scrub, setScrub] = useState(null);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [rate, setRate] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showUI, setShowUI] = useState(true);
    const [isFs, setIsFs] = useState(false);
    const [copied, setCopied] = useState(false);
    const [notice, setNotice] = useState(null);
    const [brightness, setBrightness] = useState(1);
    const [hud, setHud] = useState(null);

    const [videoKey, setVideoKey] = useState(0);

    langRef.current = lang;
    offsetRef.current = playMode === "ffmpeg" ? startSec : 0;
    const audioTracks = probe.ok ? probe.audio || [] : [];
    const dur = playMode === "ffmpeg" ? probe.duration || 0 : duration;
    durRef.current = dur;

    const nowTime = useCallback(
      () => offsetRef.current + (videoRef.current?.currentTime || 0),
      [],
    );

    // ==========================================
    // PROBE (background) - video probe ka wait nahi karta.
    // Direct play turant start hota hai. FFmpeg tabhi jab wanted audio track default (0) nahi hai.
    // ==========================================
    useEffect(() => {
      let cancelled = false;
      setError(null);
      setLoading(true);

      fetch(`${API_BASE}/api/probe/${current.token}`)
        .then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(`probe ${r.status}`)),
        )
        .then((d) => {
          if (cancelled) return;
          const audio = d.audio || [];
          setProbe({
            ok: true,
            duration: d.duration || 0,
            audio,
            videoCodec: d.video_codec,
          });
          const pref = preferredAudio(audio, langRef.current);
          const needsReencode = d.video_codec && d.video_codec !== "h264";

          if ((audio.length > 1 && pref !== 0) || needsReencode) {
            const t = resumeRef.current?.time || nowTime();
            resumeRef.current = null;
            setLoading(true);
            setAudioIdx(audio.length > 1 ? pref : 0);
            setVcodec(needsReencode ? "h264" : "copy");
            setStartSec(t);
            setPlayMode("ffmpeg");
            setVideoKey((k) => k + 1);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setProbe({ ok: false });
        });

      return () => {
        cancelled = true;
      };
    }, [current.token, nowTime]);

    const allLanguages = [
      ...new Set([
        ...streams.flatMap(langsOf),
        ...audioTracks.map((a) => a.lang),
      ]),
    ].filter((l) => l !== "Unknown" && l !== "Other");

    const qualitiesFor = useCallback(
      (l) => {
        const set = new Set(
          streams.filter((s) => langsOf(s).includes(l)).map((s) => s.quality),
        );
        return QUALITY_ORDER.filter((q) => set.has(q));
      },
      [streams],
    );

    const pickStream = useCallback(
      (l, q) => {
        const list = streams
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => langsOf(s).includes(l) && s.quality === q)
          .sort((a, b) => compatScore(a.s) - compatScore(b.s) || a.i - b.i);
        return list[0]?.s || null;
      },
      [streams],
    );

    const showNotice = (text) => {
      setNotice(text);
      setTimeout(() => setNotice(null), 6000);
    };

    const switchStream = useCallback(
      (next) => {
        if (!next || next.token === current.token) return;
        const v = videoRef.current;
        resumeRef.current = { time: nowTime(), playing: v ? !v.paused : true };
        setProbe({ loading: true });
        setLoading(true);
        setError(null);
        // naya stream hamesha direct mode se start (src change hone par video khud reload hoga)
        setVcodec("copy");
        setPlayMode("direct");
        setAudioIdx(0);
        setStartSec(0);
        setCurrent(next);
      },
      [current.token, nowTime],
    );

    const switchAudio = (i) => {
      if (i === audioIdx && playMode === "ffmpeg") return;
      const t = nowTime();
      resumeRef.current = { time: 0, playing: true };
      setLoading(true);
      setError(null);
      setStartSec(t);
      setAudioIdx(i);
      setPlayMode("ffmpeg");
      if (audioTracks[i]) setLang(audioTracks[i].lang);
      setVideoKey((k) => k + 1);
    };

    const changeLang = (newLang) => {
      setLang(newLang);
      const ti = audioTracks.findIndex((a) => a.lang === newLang);
      if (ti >= 0 && audioTracks.length > 1) {
        switchAudio(ti);
        return;
      }
      const qs = qualitiesFor(newLang);
      const target = qs.includes(current.quality) ? current.quality : qs[0];
      const next = pickStream(newLang, target);
      if (next && next.token !== current.token) {
        switchStream(next);
        return;
      }
      showNotice(
        audioTracks.length > 1
          ? "Is file ke audio tracks par language tag nahi hai. 'Audio' dropdown se track khud chuno."
          : "Is file me multiple audio hain, par track badalne ke liye server par FFmpeg install hona chahiye.",
      );
    };

    const changeQuality = (q) => {
      switchStream(pickStream(lang, q));
    };

    const tryNextStream = () => {
      const idx = streams.findIndex((s) => s.token === current.token);
      const next = streams[(idx + 1) % streams.length];
      if (next && next.token !== current.token) {
        const l = langsOf(next);
        setLang(l.includes(lang) ? lang : l[0]);
        switchStream(next);
      }
    };

    const enableTranscode = (codec = "copy") => {
      const t = nowTime();
      resumeRef.current = { time: 0, playing: true };
      setLoading(true);
      setError(null);
      setVcodec(codec);
      setStartSec(t);
      if (playMode !== "ffmpeg")
        setAudioIdx(audioTracks.length ? preferredAudio(audioTracks, lang) : 0);
      setPlayMode("ffmpeg");
      setVideoKey((k) => k + 1);
    };

    const copyLink = async () => {
      try {
        await navigator.clipboard.writeText(srcOf(current));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        window.prompt(
          "Is link ko VLC (Media > Open Network Stream) me paste karo:",
          srcOf(current),
        );
      }
    };

    const togglePlay = useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    }, []);

    const playModeRef = useRef("direct");
    playModeRef.current = playMode;

    const seekTo = useCallback((t) => {
      const total = durRef.current;
      const target = clamp(t, 0, total ? Math.max(0, total - 1) : Math.max(0, t));
      if (playModeRef.current === "ffmpeg") {
        resumeRef.current = { time: 0, playing: true };
        setLoading(true);
        setTime(target);
        setStartSec(target);
        setVideoKey((k) => k + 1);
      } else if (videoRef.current) {
        videoRef.current.currentTime = target;
      }
    }, []);

    const seekBy = useCallback(
      (delta) => seekTo(nowTime() + delta),
      [seekTo, nowTime],
    );

    const commitScrub = (e) => {
      if (scrubRef.current != null) {
        seekTo(scrubRef.current);
        scrubRef.current = null;
        setScrub(null);
      }
      e?.currentTarget?.blur?.();
    };

    const toggleMute = useCallback(() => {
      const v = videoRef.current;
      if (v) v.muted = !v.muted;
    }, []);

    const toggleFs = useCallback(async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
          screen.orientation?.unlock?.();
        } else {
          await wrapRef.current?.requestFullscreen();
          screen.orientation?.lock?.("landscape").catch(() => {});
        }
      } catch {}
    }, []);

    const togglePip = async () => {
      try {
        if (document.pictureInPictureElement)
          await document.exitPictureInPicture();
        else await videoRef.current?.requestPictureInPicture();
      } catch {}
    };

    const bumpUI = useCallback(() => {
      setShowUI(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        if (videoRef.current && !videoRef.current.paused) setShowUI(false);
      }, 3000);
    }, []);

    useEffect(() => {
      const onFs = () => setIsFs(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", onFs);
      return () => {
        document.removeEventListener("fullscreenchange", onFs);
        clearTimeout(hideTimer.current);
        clearTimeout(hudTimer.current);
      };
    }, []);

    useEffect(() => {
      const onKey = (e) => {
        const tag = e.target?.tagName;
        if (tag === "SELECT" || tag === "INPUT") return;
        const v = videoRef.current;
        switch (e.key) {
          case " ":
          case "k":
            e.preventDefault();
            togglePlay();
            break;
          case "ArrowRight":
            e.preventDefault();
            seekBy(e.shiftKey ? 3 : 10);
            break;
          case "ArrowLeft":
            e.preventDefault();
            seekBy(e.shiftKey ? -3 : -10);
            break;
          case "ArrowUp":
            e.preventDefault();
            if (v) v.volume = Math.min(1, v.volume + 0.05);
            break;
          case "ArrowDown":
            e.preventDefault();
            if (v) v.volume = Math.max(0, v.volume - 0.05);
            break;
          case "m":
            toggleMute();
            break;
          case "f":
            toggleFs();
            break;
          case "Escape":
            if (!document.fullscreenElement) onClose();
            break;
          default:
            return;
        }
        bumpUI();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [togglePlay, seekBy, toggleMute, toggleFs, bumpUI, onClose]);


    

    const showHud = (type, frac, label) => {
      setHud({ type, frac, label });
      clearTimeout(hudTimer.current);
      hudTimer.current = setTimeout(() => setHud(null), 900);
    };

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) {
        gestureRef.current = null;
        return;
      }
      const t = e.touches[0];
      const r = e.currentTarget.getBoundingClientRect();
      const side = t.clientX - r.left < r.width / 2 ? "left" : "right";
      const v = videoRef.current;
      gestureRef.current = {
        side,
        y: t.clientY,
        h: r.height,
        moved: false,
        start: side === "left" ? (v?.muted ? 0 : (v?.volume ?? 1)) : brightness,
      };
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (!g || e.touches.length !== 1) return;
      const dy = g.y - e.touches[0].clientY;
      if (!g.moved && Math.abs(dy) < 12) return;
      g.moved = true;
      const delta = dy / (g.h * 0.7);

      if (g.side === "left") {
        const val = clamp(g.start + delta, 0, 1);
        const v = videoRef.current;
        if (v) {
          v.volume = val;
          v.muted = val === 0;
        }
        showHud("volume", val, `${Math.round(val * 100)}%`);
      } else {
        const val = clamp(g.start + delta * 1.6, MIN_BRIGHT, MAX_BRIGHT);
        setBrightness(val);
        showHud(
          "brightness",
          (val - MIN_BRIGHT) / (MAX_BRIGHT - MIN_BRIGHT),
          `${Math.round(val * 100)}%`,
        );
      }
    };

    const onTouchEnd = () => {
      if (gestureRef.current?.moved) {
        suppressClick.current = true;
        setTimeout(() => {
          suppressClick.current = false;
        }, 400);
      }
      gestureRef.current = null;
    };

    const onSurfaceClick = () => {
      if (suppressClick.current) return;
      togglePlay();
      bumpUI();
    };

    const updateBuffered = (v) => {
      const b = v.buffered;
      for (let i = 0; i < b.length; i++) {
        if (v.currentTime >= b.start(i) && v.currentTime <= b.end(i)) {
          setBuffered(offsetRef.current + b.end(i));
          return;
        }
      }
    };

    const onLoadedMetadata = (e) => {
      const v = e.currentTarget;
      if (isFinite(v.duration)) setDuration(v.duration);
      const r = resumeRef.current;
      if (r) {
        if (playMode === "direct" && r.time > 0 && isFinite(v.duration)) {
          v.currentTime = Math.min(r.time, v.duration - 1);
        }
        if (r.playing) v.play().catch(() => {});
        resumeRef.current = null;
      }
    };

    const onVideoError = () => {
      setLoading(false);
      if (playMode === "ffmpeg") {
        setError(
          vcodec === "copy"
            ? "Video codec browser me nahi chal raha (HEVC/AV1 ho sakta hai). 'Compatibility mode' try karo."
            : "Failed to load video. This stream might be dead. Please try another stream.",
        );
      } else {
        setError(
          probe.ok
            ? "Browser is file ka format ya audio (MKV, DTS, AC3) play nahi kar pa raha. 'Transcode mode' try karo."
            : "Failed to load video. This stream might be dead. Please try another stream.",
        );
      }
    };

    // src ab probe ka wait nahi karta
    const src =
      playMode === "ffmpeg"
        ? `${API_BASE}/api/transcode/${current.token}?audio=${audioIdx}&start=${startSec.toFixed(2)}&v=${vcodec}`
        : srcOf(current);

    const pct = (n) => (dur ? clamp((n / dur) * 100, 0, 100) : 0);
    const qualities = qualitiesFor(lang);
    const shownTime = scrub ?? time;
    const controlsVisible = showUI || !playing;

    return (
      <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-0 md:p-6">
        <div
          ref={wrapRef}
          onMouseMove={bumpUI}
          onTouchStart={bumpUI}
          className={`relative bg-black w-full max-w-6xl aspect-video max-h-full select-none overflow-hidden md:rounded-xl ${
            controlsVisible ? "cursor-default" : "cursor-none"
          }`}
        >
          <video
            key={videoKey}
            ref={videoRef}
            src={src}
            autoPlay
            playsInline
            preload="auto"
            className="w-full h-full bg-black object-contain"
            style={{ filter: `brightness(${brightness})` }}
            onLoadStart={() => {
              setLoading(true);
              setError(null);
            }}
            onLoadedMetadata={onLoadedMetadata}
            onDurationChange={(e) => {
              if (isFinite(e.currentTarget.duration))
                setDuration(e.currentTarget.duration);
            }}
            onTimeUpdate={(e) => {
              setTime(offsetRef.current + e.currentTarget.currentTime);
              updateBuffered(e.currentTarget);
            }}
            onProgress={(e) => updateBuffered(e.currentTarget)}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false);
              setShowUI(true);
            }}
            onWaiting={() => setLoading(true)}
            onCanPlay={() => setLoading(false)}
            onPlaying={() => {
              setLoading(false);
              setPlaying(true);
              setError(null);
            }}
            onVolumeChange={(e) => {
              setVolume(e.currentTarget.volume);
              setMuted(e.currentTarget.muted);
            }}
            onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
            onError={onVideoError}
          />

          {/* Gesture surface */}
          <div
            className="absolute inset-0 z-10"
            style={{ touchAction: "none" }}
            onClick={onSurfaceClick}
            onDoubleClick={toggleFs}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          />

          {/* HUD */}
          {hud && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-black/75 rounded-xl px-4 py-2 flex items-center gap-3 text-white pointer-events-none">
              {hud.type === "volume" ? (
                hud.frac === 0 ? (
                  <VolumeX size={18} />
                ) : (
                  <Volume2 size={18} />
                )
              ) : (
                <Sun size={18} />
              )}
              <div className="w-32 h-1.5 bg-white/25 rounded overflow-hidden">
                <div
                  className="h-full bg-red-500"
                  style={{ width: `${hud.frac * 100}%` }}
                />
              </div>
              <span className="text-sm tabular-nums w-10 text-right">
                {hud.label}
              </span>
            </div>
          )}

          {/* Loader */}
          {loading && !error && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <Loader2 className="animate-spin text-red-500" size={56} />
            </div>
          )}

          {/* Notice */}
          {notice && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 max-w-[90%] bg-zinc-900/95 border border-yellow-500/50 text-yellow-200 text-xs rounded-lg px-3 py-2 text-center">
              {notice}
            </div>
          )}

          {/* Error box */}
          {error && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/70">
              <div className="max-w-md bg-zinc-900 border border-red-500/50 rounded-xl p-5 text-center">
                <AlertTriangle className="mx-auto text-red-400 mb-3" size={32} />
                <p className="text-sm text-gray-200 mb-5">{error}</p>
                <div className="flex justify-center">
                  <button
                    onClick={tryNextStream}
                    className="bg-white text-black hover:bg-gray-200 px-6 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition"
                  >
                    <SkipForward size={16} /> Try Another Stream
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Top bar */}
          <div
            className={`absolute top-0 inset-x-0 z-30 p-3 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-white font-semibold truncate">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="bg-black/60 hover:bg-black p-2 rounded-full text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Bottom controls */}
          <div
            className={`absolute bottom-0 inset-x-0 z-30 px-3 pb-3 pt-10 bg-gradient-to-t from-black/90 to-transparent transition-opacity ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <input
              type="range"
              min={0}
              max={dur || 0}
              step="any"
              value={shownTime}
              onChange={(e) => {
                scrubRef.current = Number(e.target.value);
                setScrub(scrubRef.current);
              }}
              onPointerUp={commitScrub}
              onTouchEnd={commitScrub}
              onKeyUp={commitScrub}
              className="w-full h-1.5 cursor-pointer appearance-none rounded accent-red-500"
              style={{
                background: `linear-gradient(to right, #ef4444 ${pct(shownTime)}%, rgba(255,255,255,.45) ${pct(shownTime)}%, rgba(255,255,255,.45) ${pct(buffered)}%, rgba(255,255,255,.2) ${pct(buffered)}%)`,
              }}
              aria-label="Seek"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2 text-white">
              <button
                onClick={() => seekBy(-10)}
                className="p-2 hover:bg-white/10 rounded"
                title="-10s"
              >
                <RotateCcw size={18} />
              </button>
              <button
                onClick={togglePlay}
                className="p-2 bg-red-600 hover:bg-red-500 rounded-full"
                title="Play/Pause"
              >
                {playing ? (
                  <Pause size={20} fill="white" />
                ) : (
                  <Play size={20} fill="white" />
                )}
              </button>
              <button
                onClick={() => seekBy(10)}
                className="p-2 hover:bg-white/10 rounded"
                title="+10s"
              >
                <RotateCw size={18} />
              </button>

              <span className="text-xs tabular-nums text-gray-300 px-1">
                {fmt(shownTime)} / {fmt(dur)}
              </span>

              <button
                onClick={toggleMute}
                className="p-2 hover:bg-white/10 rounded"
              >
                {muted || volume === 0 ? (
                  <VolumeX size={18} />
                ) : (
                  <Volume2 size={18} />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.volume = Number(e.target.value);
                  v.muted = Number(e.target.value) === 0;
                }}
                onPointerUp={(e) => e.currentTarget.blur()}
                className="w-20 accent-red-500"
                aria-label="Volume"
              />

              <span className="flex-1" />

              {allLanguages.length > 1 && (
                <select
                  value={allLanguages.includes(lang) ? lang : ""}
                  onChange={(e) => {
                    changeLang(e.target.value);
                    e.target.blur();
                  }}
                  className="bg-black/60 border border-white/20 text-xs rounded px-2 py-1.5 outline-none"
                  title="Language"
                >
                  {!allLanguages.includes(lang) && (
                    <option value="" disabled>
                      Language
                    </option>
                  )}
                  {allLanguages.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={current.quality}
                onChange={(e) => {
                  changeQuality(e.target.value);
                  e.target.blur();
                }}
                className="bg-black/60 border border-white/20 text-xs rounded px-2 py-1.5 outline-none"
                title="Quality"
              >
                {(qualities.length ? qualities : [current.quality]).map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>

              <select
                value={rate}
                onChange={(e) => {
                  if (videoRef.current)
                    videoRef.current.playbackRate = Number(e.target.value);
                  e.target.blur();
                }}
                className="bg-black/60 border border-white/20 text-xs rounded px-2 py-1.5 outline-none"
                title="Speed"
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <option key={r} value={r}>
                    {r}x
                  </option>
                ))}
              </select>

              {document.pictureInPictureEnabled && (
                <button
                  onClick={togglePip}
                  className="px-2 py-1.5 text-xs hover:bg-white/10 rounded border border-white/20"
                  title="Picture in Picture"
                >
                  PiP
                </button>
              )}
              <button
                onClick={toggleFs}
                className="p-2 hover:bg-white/10 rounded"
                title="Fullscreen"
              >
                {isFs ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
