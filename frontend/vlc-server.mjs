import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

// VLC server port
const PORT = Number(process.env.VLC_PORT || 5174);

const VLC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_DIR = path.join(VLC_DIR, "node_modules", "libvlc-wasm");

if (!fs.existsSync(path.join(PKG_DIR, "package.json"))) {
  console.error("libvlc-wasm missing. Run npm install libvlc-wasm in frontend.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, "package.json"), "utf8"));

function resolveExport(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    for (const key of ["browser", "import", "module", "default"]) {
      if (value[key]) return resolveExport(value[key]);
    }
    const first = Object.values(value)[0];
    if (first) return resolveExport(first);
  }
  return null;
}

const entry = (
  resolveExport(pkg.exports?.["."]) ||
  pkg.module ||
  pkg.main ||
  "index.js"
).replace(/^\.\//, "");

// ====================================
// VLC PLAYER CLIENT (Browser Side Script)
// NOTE: yeh String.raw template hai, isliye andar backtick (`) ya ${} use mat karna
// ====================================

const CLIENT = String.raw`
import { createVLC } from "libvlc-wasm";

const $ = (id) => document.getElementById(id);
const PLAYBACK_KEY = "torbox_vlc_playback";
const API_BASE = import.meta.env.VITE_API_BASE_URL;

function msg(message) {
  $("msg").textContent = message;
  $("msg").style.display = message ? "block" : "none";
}

function spin(on) {
  $("spinner").style.display = on ? "block" : "none";
}

function fmt(value) {
  const seconds = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  const pad = (number) => String(number).padStart(2, "0");
  return (hours ? hours + ":" : "") + pad(minutes) + ":" + pad(remaining);
}

if (!crossOriginIsolated) {
  msg("Cross-origin isolation missing. Check COOP/COEP headers.");
  throw new Error("SharedArrayBuffer requires cross-origin isolation");
}

spin(true);
const vlc = await createVLC();
const player = await vlc.createPlayer({ canvas: $("cv") });
spin(false);
msg("");

let opened = false;
let seeking = false;
let switchingEpisode = false;
let torrentId = null;
let playlist = [];
let currentEpisodeIndex = -1;

function pad2(n) { return String(n).padStart(2, "0"); }

function parseTitle(raw) {
  let s = String(raw || "").replace(/\.(mkv|mp4|avi|webm|mov|m4v|ts)$/i, "");
  s = s.replace(/^\s*(\[[^\]]*\]\s*)+/, "");
  s = s.replace(/^\s*(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\s+[-–—:|]+\s+/i, "");
  s = s.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();

  let season = null;
  let episode = null;

  const se = s.match(/\bS(\d{1,2})\s*-?\s*EP?\s*(\d{1,3})\b/i);
  if (se) {
    season = Number(se[1]);
    episode = Number(se[2]);
  } else {
    const sOnly = s.match(/\bS(\d{1,2})\b/i);
    if (sOnly) season = Number(sOnly[1]);
  }

  const cut = s.search(/\b(?:S\d{1,2}(?=E|\b)|(?:(?:19|20)\d{2}|\d{3,4}p|HDRip|HD-Rip|WEB-?DL|WEB-?Rip|BluRay|BRRip|DVDRip|HDTV|PreDVD|HQ|x264|x265|HEVC|TRUE|Tamil|Telugu|Hindi|Malayalam|Kannada)\b)/i);
  let name = cut > 0 ? s.slice(0, cut) : s;
  name = name.replace(/[\s(\[\-–—:|]+$/, "").trim();

  return { name: name || s, season, episode };
}

function formatTitle(name, season, episode) {
  let tag = "";
  if (season != null) tag += "S" + pad2(season);
  if (episode != null) tag += (tag ? " " : "") + "E" + pad2(episode);
  return tag ? name + " - " + tag : name;
}

function cleanTitle(raw) {
  const p = parseTitle(raw);
  return formatTitle(p.name, p.season, p.episode);
}

function episodeLabel(file) {
  const p = parseTitle(file.name);
  const episode = file.episode ?? p.episode;
  const season = file.season ?? p.season ?? (episode != null ? 1 : null);
  return formatTitle(p.name, season, episode);
}

function refreshEpisodeControls() {
  const hasMultiple = playlist.length > 1;
  $("prevEp").disabled = !hasMultiple || currentEpisodeIndex <= 0 || switchingEpisode;
  $("nextEp").disabled = !hasMultiple || currentEpisodeIndex >= playlist.length - 1 || switchingEpisode;
  $("episodePicker").style.display = hasMultiple ? "" : "none";
  $("episodePicker").disabled = switchingEpisode;
  if (currentEpisodeIndex >= 0) $("episodePicker").value = String(currentEpisodeIndex);
}

async function openSource(src, title) {
  try {
    msg("");
    spin(true);
    $("drop").style.display = "none";

    let source = src;

    // HTTP URLs ko apne /vlc/proxy se pass karte hain (COEP/CORS ke liye)
    if (typeof src === "string" && src.startsWith("http")) {
      source = "/vlc/proxy?url=" + encodeURIComponent(src);
    }

    await player.open(source);
    opened = true;

    $("videoTitle").textContent = title || "VLC Browser Player";
    document.title = (title || "Video") + " | VLC Browser Player";

    try {
      await player.play();
    } catch (error) {
      console.warn("[VLC Autoplay]", error);
      spin(false);
      msg("Video loaded. Press Play to start.");
    }
    return true;
  } catch (error) {
    opened = false;
    console.error("[VLC Playback]", error);
    spin(false);
    msg("Playback error: " + (error.message || error));
    return false;
  }
}

async function loadPlaylist(id) {
  if (!id) return;
  try {
    const response = await fetch("/api/torbox/playlist?id=" + encodeURIComponent(id), { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || "Playlist API failed");

    playlist = Array.isArray(data.files) ? data.files : [];
    torrentId = id;
    const picker = $("episodePicker");
    picker.replaceChildren();

    playlist.forEach((file, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = episodeLabel(file);
      picker.appendChild(option);
    });

    currentEpisodeIndex = playlist.length ? 0 : -1;
    refreshEpisodeControls();
    console.log("[VLC Episodes]", playlist);
  } catch (error) {
    console.error("[VLC Playlist]", error);
    msg("Episode list unavailable: " + error.message);
  }
}

async function selectEpisode(index) {
  if (switchingEpisode || index < 0 || index >= playlist.length || !torrentId) return;
  if (index === currentEpisodeIndex) return;

  switchingEpisode = true;
  refreshEpisodeControls();
  const file = playlist[index];

  try {
    msg("");
    spin(true);
    const endpoint = "/api/torbox/file-link?id=" + encodeURIComponent(torrentId) + "&fileId=" + encodeURIComponent(file.id);
    const response = await fetch(endpoint, { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok || !data.success || !data.url) throw new Error(data.error || "Episode link unavailable");

    try { await player.stop(); } catch (error) { console.warn("[VLC Stop]", error); }
    opened = false;

    const success = await openSource(data.url, episodeLabel(file));
    if (!success) throw new Error("Episode could not be opened");

    currentEpisodeIndex = index;
    console.log("[VLC] Now playing:", file.name);
  } catch (error) {
    console.error("[VLC Episode]", error);
    spin(false);
    msg("Next episode failed: " + error.message);
  } finally {
    switchingEpisode = false;
    refreshEpisodeControls();
  }
}

$("prevEp").onclick = () => { void selectEpisode(currentEpisodeIndex - 1); };
$("nextEp").onclick = () => { void selectEpisode(currentEpisodeIndex + 1); };
$("episodePicker").onchange = (event) => { void selectEpisode(Number(event.target.value)); };

// MAIN FUNCTION: React se aaya data load karta hai
async function loadMovieFromReact() {
  // 1) URL se token padho (React ka Play button yahi bhejta hai)
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  if (token) {
    const videoUrl = API_BASE + "/api/play/" + encodeURIComponent(token);
    await openSource(videoUrl, cleanTitle(params.get("title") || "Movie"));
    return;
  }

  // 2) Fallback: purana sessionStorage tarika (same origin hone par)
  let saved;
  try {
    saved = sessionStorage.getItem(PLAYBACK_KEY);
    sessionStorage.removeItem(PLAYBACK_KEY);
  } catch (error) {
    msg("Playback session error: " + error.message);
    return;
  }

  if (!saved) {
    msg("Movie or Web Series page par Browser Player select karo.");
    return;
  }

  try {
    const data = JSON.parse(saved);
    if (!Number.isFinite(data.createdAt) || Math.abs(Date.now() - data.createdAt) > 120000) {
      throw new Error("Playback request expired");
    }

    const videoUrl = new URL(data.url);
    await openSource(videoUrl.toString(), cleanTitle(data.title || "Movie"));

    if (data.torrentId != null) {
      void loadPlaylist(data.torrentId);
    }
  } catch (error) {
    spin(false);
    msg("Cannot start movie: " + error.message);
  }
}

addEventListener("dragover", (event) => { event.preventDefault(); });
addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file) void openSource(file, cleanTitle(file.name));
});

$("pp").onclick = () => { if (opened) player.togglePause(); };
$("stopB").onclick = async () => {
  await player.stop();
  opened = false;
  spin(false);
  $("pp").textContent = "Play";
};

$("stage").onclick = () => { document.body.classList.toggle("hide-ui"); };
$("cv").ondblclick = () => { $("fs").click(); };

$("back").onclick = () => { if (opened) player.seek(Math.max(0, player.currentTime - 10)); };
$("fwd").onclick = () => { if (opened) player.seek(player.currentTime + 10); };
$("seek").oninput = () => { seeking = true; };
$("seek").onchange = (event) => {
  if (opened) player.seek((Number(event.target.value) / 1000) * (player.duration || 0));
  seeking = false;
};

function setVol(value) {
  player.volume = Math.max(0, Math.min(2, value));
  $("vol").value = player.volume * 100;
}

$("vol").oninput = (event) => { setVol(Number(event.target.value) / 100); };
$("mute").onclick = () => {
  player.muted = !player.muted;
  $("mute").textContent = player.muted ? "Unmute" : "Mute";
};
$("rate").onchange = (event) => { player.rate = Number(event.target.value); };

$("fs").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    msg("Fullscreen failed: " + error.message);
  }
};

$("fx").onclick = () => { $("panel").classList.toggle("open"); };
const effects = { br: "brightness", co: "contrast", sa: "saturation", ga: "gamma", hu: "hue" };

function applyEffects() {
  const settings = {};
  for (const id in effects) {
    settings[effects[id]] = parseFloat($(id).value);
    $(id + "v").textContent = $(id).value;
  }
  player.setAdjust(settings);
}

Object.keys(effects).forEach((id) => { $(id).oninput = applyEffects; });
$("resetFx").onclick = () => {
  $("br").value = 1; $("co").value = 1; $("sa").value = 1; $("ga").value = 1; $("hu").value = 0;
  applyEffects();
  player.setAdjust(null);
};
$("aspect").onchange = (event) => { player.setAspectRatio(event.target.value || null); };

$("ad").oninput = (event) => { player.setAudioDelay(Number(event.target.value)); $("adv").textContent = event.target.value; };
$("sd").oninput = (event) => { player.setSubtitleDelay(Number(event.target.value)); $("sdv").textContent = event.target.value; };
$("ss").oninput = (event) => { player.setSubtitleScale(Number(event.target.value)); $("ssv").textContent = event.target.value; };

$("addSub").onclick = () => { $("subfile").click(); };
$("subfile").onchange = (event) => {
  const file = event.target.files?.[0];
  if (file) Promise.resolve(player.addSubtitles(file)).catch((error) => { msg("Subtitle error: " + error.message); });
};

player.on("timeupdate", (time) => {
  const duration = player.duration || 0;
  $("time").textContent = fmt(time) + " / " + fmt(duration);
  if (!seeking && duration) $("seek").value = (time / duration) * 1000;
});

player.on("playing", () => { $("pp").textContent = "Pause"; spin(false); msg(""); });
player.on("paused", () => { $("pp").textContent = "Play"; });
player.on("buffering", (progress) => { spin(progress < 100); });
player.on("error", (error) => { spin(false); msg("VLC error: " + (error?.message || error)); });
player.on("ended", () => {
  $("pp").textContent = "Play";
  if (playlist.length > 1 && !switchingEpisode && currentEpisodeIndex < playlist.length - 1) {
    void selectEpisode(currentEpisodeIndex + 1);
  }
});

function trackLabel(track, index, prefix) {
  const parts = [track.language || track.name || "#" + (index + 1)];
  if (track.height) parts.push(track.height + "p");
  if (track.codec) parts.push(track.codec);
  return prefix + ": " + parts.join(" - ");
}

function fillTracks(select, type, prefix, allowOff) {
  const tracks = (player.tracks || []).filter((track) => track.type === type);
  select.replaceChildren();
  if (allowOff) {
    const option = document.createElement("option");
    option.value = "off";
    option.textContent = prefix + ": Off";
    select.appendChild(option);
  }
  tracks.forEach((track, index) => {
    const option = document.createElement("option");
    option.value = String(track.id);
    option.textContent = trackLabel(track, index, prefix);
    option.selected = !!track.selected;
    select.appendChild(option);
  });
  select.style.display = tracks.length || allowOff ? "" : "none";
}

player.on("tracks", () => {
  fillTracks($("vid"), "video", "Video", false);
  fillTracks($("aud"), "audio", "Audio", false);
  fillTracks($("sub"), "text", "Sub", true);
  $("info").textContent = (player.tracks || []).map((track) => track.type + ": " + (track.codec || "?") + " " + (track.language || "") + " " + (track.width ? track.width + "x" + track.height : "")).join("\n");
});

function pickTrack(type) {
  return (event) => {
    if (event.target.value === "off") return player.disableTrack(type);
    const track = (player.tracks || []).find((item) => item.type === type && String(item.id) === event.target.value);
    if (track) player.selectTrack(track);
  };
}

$("vid").onchange = pickTrack("video");
$("aud").onchange = pickTrack("audio");
$("sub").onchange = pickTrack("text");

addEventListener("keydown", (event) => {
  const tag = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
  const key = event.key;

  if (key === " ") { event.preventDefault(); if (opened) player.togglePause(); }
  else if (key === "ArrowRight" && opened) player.seek(player.currentTime + (event.shiftKey ? 3 : 10));
  else if (key === "ArrowLeft" && opened) player.seek(Math.max(0, player.currentTime - (event.shiftKey ? 3 : 10)));
  else if (key === "ArrowUp") { event.preventDefault(); setVol(player.volume + 0.05); }
  else if (key === "ArrowDown") { event.preventDefault(); setVol(player.volume - 0.05); }
  else if (key === "m") $("mute").click();
  else if (key === "f") $("fs").click();
  else if (key === "n") $("nextEp").click();
  else if (key === "p") $("prevEp").click();
  else if (key === "b" || key === "v") {
    const select = $(key === "b" ? "aud" : "sub");
    if (select.options.length) {
      select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
      select.dispatchEvent(new Event("change"));
    }
  }
});

// Naye tab me history nahi hoti, isliye pehle tab band karne ki koshish
$("backMovie").onclick = () => {
  if (history.length > 1) history.back();
  else window.close();
};

await loadMovieFromReact();
`;

// ====================================
// HTML UI (Netflix style dark theme)
// ====================================

const HTML = String.raw`
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VLC Browser Player</title>
<script type="importmap">
{
  "imports": {
    "libvlc-wasm": "/vlc/pkg/__ENTRY__",
    "libvlc-wasm/": "/vlc/pkg/"
  }
}
</script>
<style>
* { box-sizing: border-box; }
:root {
  --red: #e50914; --red-hi: #ff2a35; --red-dim: #8b0000;
  --bg: #0a0a0a; --panel: #141414; --panel-2: #1c1c1c; --line: #2a2a2a;
  --txt: #f2f2f2; --txt-dim: #9a9a9a;
}
body { margin: 0; background: var(--bg); color: var(--txt); font: 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; position: absolute; top: 0; left: 0; right: 0; z-index: 10; background: transparent; text-shadow: 0 1px 6px #000; }
header h3 { flex: 1; margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); }
button { border: 1px solid var(--red-dim); border-radius: 7px; padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer; background: linear-gradient(180deg, var(--red), var(--red-dim)); color: #fff; transition: transform .08s ease, box-shadow .15s ease, background .15s ease; box-shadow: 0 2px 6px #0006; }
button:hover:not(:disabled) { background: linear-gradient(180deg, var(--red-hi), var(--red)); box-shadow: 0 0 12px #e5091466, 0 2px 8px #0008; }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
button.g { background: var(--panel-2); border-color: var(--line); color: var(--txt); }
button.g:hover:not(:disabled) { background: #262626; border-color: var(--red); box-shadow: 0 0 10px #e5091440; }
button.icon { padding: 8px 10px; display: inline-flex; align-items: center; justify-content: center; }
select { border: 1px solid var(--line); border-radius: 7px; padding: 8px 10px; font-size: 13px; background: var(--panel-2); color: var(--txt); cursor: pointer; outline: none; }
select:focus { border-color: var(--red); }
main { display: flex; flex: 1; min-height: 0; position: relative; }
#stage { position: relative; flex: 1; min-width: 0; min-height: 0; background: #000; }
#cv { display: block; width: 100%; height: 100%; object-fit: contain; }
#spinner { display: none; position: absolute; top: 50%; left: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border: 5px solid rgba(255, 255, 255, .18); border-top-color: var(--red); border-radius: 50%; animation: spin .8s linear infinite; pointer-events: none; filter: drop-shadow(0 0 8px #e5091488); z-index: 5; }
@keyframes spin { to { transform: rotate(360deg); } }
#msg { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 80%; padding: 14px 22px; border-radius: 10px; background: rgba(10, 10, 10, .82); border: 1px solid var(--red); color: var(--txt); font-weight: 600; text-align: center; overflow-wrap: anywhere; box-shadow: 0 0 24px #e5091455, 0 8px 24px #000a; backdrop-filter: blur(4px); pointer-events: none; z-index: 6; }
#drop { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--txt-dim); font-size: 15px; font-weight: 600; letter-spacing: .5px; pointer-events: none; text-shadow: 0 0 12px #000; }
aside { display: none; position: absolute; top: 56px; right: 0; bottom: 130px; z-index: 9; width: 260px; padding: 14px; background: rgba(20, 20, 20, .85); border-left: 1px solid var(--line); border-radius: 10px 0 0 10px; overflow-y: auto; }
aside.open { display: block; }
aside h4 { margin: 16px 0 6px; color: var(--red-hi); font-size: 12px; text-transform: uppercase; letter-spacing: .8px; }
aside label { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: var(--txt-dim); }
aside input[type="range"] { width: 100%; accent-color: var(--red); margin-top: 4px; }
#info { color: var(--txt-dim); white-space: pre-wrap; font-size: 11px; line-height: 1.5; }
footer { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; position: absolute; left: 0; right: 0; bottom: 0; z-index: 10; background: transparent; text-shadow: 0 1px 6px #000; }
header, footer, aside { transition: opacity .25s ease; }
body.hide-ui header, body.hide-ui footer, body.hide-ui aside { opacity: 0; pointer-events: none; }
body.hide-ui { cursor: none; }
#seek { width: 100%; accent-color: var(--red); height: 6px; cursor: pointer; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sp { flex: 1; }
#vol { width: 90px; accent-color: var(--red); }
#time { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--txt-dim); padding: 0 4px; }
#episodePicker { background: rgba(20, 20, 20, .55); color: var(--txt); border: 1px solid var(--line); border-radius: 7px; padding: 8px; max-width: 280px; }
#episodePicker:focus { border-color: var(--red); }
@media (max-width: 650px) {
  aside { position: absolute; top: 50px; right: 0; bottom: 110px; z-index: 20; width: 220px; background: var(--panel); border-left: 1px solid var(--red-dim); }
  button, select { padding: 7px 9px; font-size: 12px; }
  header h3 { font-size: 13px; }
  #episodePicker { max-width: 140px; }
}
</style>
</head>
<body>
<header>
  <button class="g" id="backMovie">Back</button>
  <select id="episodePicker" aria-label="Select episode" style="display:none"></select>
  <h3 id="videoTitle">VLC Browser Player</h3>
</header>
<main>
  <div id="stage">
    <canvas id="cv"></canvas>
    <div id="drop">Watch → Browser Player</div>
    <div id="spinner"></div>
    <div id="msg" style="display:none"></div>
  </div>
  <aside id="panel">
    <h4>Video Effects</h4>
    <label>Brightness <span id="brv">1</span></label><input id="br" type="range" min="0" max="2" step="0.05" value="1">
    <label>Contrast <span id="cov">1</span></label><input id="co" type="range" min="0" max="2" step="0.05" value="1">
    <label>Saturation <span id="sav">1</span></label><input id="sa" type="range" min="0" max="3" step="0.05" value="1">
    <label>Gamma <span id="gav">1</span></label><input id="ga" type="range" min="0.1" max="3" step="0.05" value="1">
    <label>Hue <span id="huv">0</span></label><input id="hu" type="range" min="-180" max="180" step="5" value="0">
    <button class="g" id="resetFx">Reset</button>
    <h4>Aspect Ratio</h4>
    <select id="aspect"><option value="">Auto</option><option>16:9</option><option>4:3</option><option>21:9</option></select>
    <h4>Audio Delay</h4>
    <label>Audio <span id="adv">0</span></label><input id="ad" type="range" min="-5" max="5" step="0.1" value="0">
    <h4>Subtitle Delay</h4>
    <label>Subtitle <span id="sdv">0</span></label><input id="sd" type="range" min="-5" max="5" step="0.1" value="0">
    <h4>Subtitle Size</h4>
    <label>Size <span id="ssv">1</span></label><input id="ss" type="range" min="0.5" max="3" step="0.1" value="1">
    <h4>External Subtitles</h4>
    <button class="g" id="addSub">+ Add .srt/.ass/.vtt</button>
    <input id="subfile" type="file" accept=".srt,.ass,.ssa,.vtt" hidden>
    <h4>Media Info</h4>
    <pre id="info"></pre>
  </aside>
</main>
<footer>
  <input id="seek" type="range" min="0" max="1000" value="0">
  <div class="row">
    <button id="back">-10s</button>
    <button id="pp">Play</button>
    <button id="stopB" class="g">Stop</button>
    <button id="fwd">+10s</button>
    <span id="time">00:00 / 00:00</span>
    <button id="mute" class="g">Mute</button>
    <input id="vol" type="range" min="0" max="200" value="100">
    <span class="sp"></span>
    <select id="vid"></select>
    <select id="aud"></select>
    <select id="sub"></select>
    <select id="rate"><option>0.5</option><option>0.75</option><option selected>1</option><option>1.25</option><option>1.5</option><option>2</option></select>
    <button id="fx" class="g icon" title="Effects" aria-label="Effects"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2.2" fill="currentColor"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2.2" fill="currentColor"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2.2" fill="currentColor"/></svg></button>
    <button id="fs" class="g icon" title="Fullscreen" aria-label="Fullscreen"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
    <button id="prevEp" class="g" disabled>⏮ Prev</button>
    <button id="nextEp" class="g" disabled>Next ⏭</button>
  </div>
</footer>
<script type="module" src="/vlc/client.js"></script>
</body>
</html>
`.replace("__ENTRY__", entry);

// ====================================
// SECURITY HEADERS
// ====================================

const headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
  ".json": "application/json", ".html": "text/html", ".css": "text/css",
  ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2",
};

// ====================================
// CDN VALIDATION (TorBox CDN + local FastAPI)
// ====================================

function isAllowedCDN(url) {
  const hostname = url.hostname.toLowerCase();
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    (
      hostname.endsWith(".tb-cdn.pw") ||
      hostname === "127.0.0.1" ||
      hostname === "localhost"
    )
  );
}

async function fetchCDN(target, requestHeaders, method, signal) {
  let current = new URL(target);
  for (let index = 0; index < 5; index++) {
    if (!isAllowedCDN(current)) throw new Error("Unsupported CDN host");

    const response = await fetch(current, { method, headers: requestHeaders, redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirectTo = response.headers.get("location");
      if (!redirectTo) throw new Error("CDN redirect missing location");
      await response.body?.cancel();
      current = new URL(redirectTo, current);
      continue;
    }
    return response;
  }
  throw new Error("Too many CDN redirects");
}

// ====================================
// HTTP SERVER
// ====================================

http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, "http://localhost"); }
  catch { res.writeHead(400, headers); return res.end("Bad URL"); }

  const pathname = url.pathname;

  if (pathname === "/vlc") {
    res.writeHead(302, { ...headers, Location: "/vlc/" + url.search });
    return res.end();
  }

  if (!pathname.startsWith("/vlc/")) {
    res.writeHead(404, headers);
    return res.end("Not found");
  }

  const requestPath = pathname.slice("/vlc".length);

  if (requestPath === "/") {
    res.writeHead(200, { ...headers, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(HTML);
  }

  if (requestPath === "/client.js") {
    res.writeHead(200, { ...headers, "Content-Type": "text/javascript", "Cache-Control": "no-store" });
    return res.end(CLIENT);
  }

  if (requestPath === "/proxy") {
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405, headers); return res.end("Method not allowed"); }
    const target = url.searchParams.get("url");
    if (!target) { res.writeHead(400, headers); return res.end("Video URL missing"); }

    let remote;
    try { remote = new URL(target); }
    catch { res.writeHead(400, headers); return res.end("Invalid video URL"); }

    if (!isAllowedCDN(remote)) { res.writeHead(403, headers); return res.end("Unsupported CDN"); }

    const controller = new AbortController();
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });

    try {
      const requestHeaders = { "Accept-Encoding": "identity" };
      if (req.headers.range) requestHeaders.Range = req.headers.range;

      const response = await fetchCDN(target, requestHeaders, req.method, controller.signal);

      if (![200, 206, 416].includes(response.status)) {
        await response.body?.cancel();
        res.writeHead(502, { ...headers, "Content-Type": "text/plain" });
        return res.end("CDN HTTP " + response.status);
      }

      const outputHeaders = {
        ...headers,
        "Content-Type": response.headers.get("content-type") || "video/x-matroska",
        "Cache-Control": "private, no-store",
      };

      for (const key of ["content-length", "content-range", "accept-ranges", "last-modified", "etag"]) {
        const value = response.headers.get(key);
        if (value) outputHeaders[key] = value;
      }

      res.writeHead(response.status, outputHeaders);

      if (req.method === "HEAD" || !response.body) {
        await response.body?.cancel();
        return res.end();
      }

      const stream = Readable.fromWeb(response.body);
      stream.on("error", (error) => {
        console.error("[VLC Stream]", error.message);
        if (!res.destroyed) res.destroy(error);
      });
      stream.pipe(res);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("[VLC Proxy]", error.message);
      if (!res.headersSent) {
        res.writeHead(502, { ...headers, "Content-Type": "text/plain" });
        res.end("CDN streaming failed");
      } else if (!res.destroyed) {
        res.destroy();
      }
    }
    return;
  }

  if (requestPath.startsWith("/pkg/")) {
    let file;
    try {
      file = path.resolve(PKG_DIR, "." + decodeURIComponent(requestPath.slice(4)));
    } catch {
      res.writeHead(400, headers); return res.end("Invalid path");
    }

    if (!file.startsWith(PKG_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, headers); return res.end("Not found");
    }

    res.writeHead(200, { ...headers, "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    return fs.createReadStream(file).pipe(res);
  }

  res.writeHead(404, headers);
  return res.end("Not found");
}).listen(PORT, "127.0.0.1", () => {
  console.log("VLC Web Player running at http://127.0.0.1:" + PORT + "/vlc/");
});