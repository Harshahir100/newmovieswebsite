import express from "express";
import { spawn } from "node:child_process";
import { FFMPEG } from "../config/env.js";
import { probeCache } from "../utils/cache.js";
import { validatePlaybackURL } from "../utils/security.js";
import { getToken } from "../utils/token.js";
import { audioLanguage, runProbe } from "../utils/ffmpeg.js";

const router = express.Router();

// ==========================================
// /api/probe/:token  —  ffprobe metadata
// ==========================================
router.get("/probe/:token", async (req, res) => {
  const item = getToken(req, res);
  if (!item) return;
  const cachedProbe = probeCache.get(req.params.token);
  if (cachedProbe) return res.json(cachedProbe);
  try {
    await validatePlaybackURL(item.url);
    const d = await runProbe(item.url);
    const audio = [];
    let video_codec = null;
    for (const s of d.streams || []) {
      if (s.codec_type === "audio")
        audio.push({
          index: audio.length,
          lang: audioLanguage(s.tags || {}),
          title: (s.tags || {}).title || "",
          codec: s.codec_name,
          channels: s.channels,
        });
      if (s.codec_type === "video" && !video_codec) video_codec = s.codec_name;
    }
    const info = { duration: Number(d.format?.duration || 0), audio, video_codec };
    probeCache.set(req.params.token, info, 600000);
    res.json(info);
  } catch (e) {
    res.status(503).json({ error: `Probe unavailable: ${e.message}` });
  }
});

// ==========================================
// /api/transcode/:token  —  live ffmpeg remux/transcode
// ==========================================
router.get("/transcode/:token", async (req, res) => {
  const item = getToken(req, res);
  if (!item) return;
  try {
    await validatePlaybackURL(item.url);
  } catch (e) {
    return res.status(403).json({ error: e.message });
  }
  const audio = Math.max(0, Math.min(32, Number(req.query.audio) || 0));
  const start = Math.max(0, Number(req.query.start) || 0);
  const video = req.query.v === "h264";
  // Aapke backend file (jahan transcode route hai) me args update karein:

  const args = [
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-protocol_whitelist", "http,https,tcp,tls,crypto",
    "-user_agent", "PvrPlay/2.0",
    // Sync Fixes:
    "-fflags", "+genpts+igndts",
    "-err_detect", "ignore_err",
    "-analyzeduration", "10000000",
    "-probesize", "10000000",
  ];

  if (start > 0) args.push("-ss", start.toFixed(2));
  args.push("-i", item.url, "-map", "0:v:0", "-map", `0:a:${audio}`);

  if (video) {
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-vf", "scale='min(1920,iw)':-2");
  } else {
    args.push("-c:v", "copy");
  }

  // Audio & Video Sync Fix
  args.push(
    "-c:a", "aac",
    "-b:a", "192k",
    "-ac", "2",
    "-sn",
    "-dn",
    "-avoid_negative_ts", "make_zero",
    "-fflags", "+genpts",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1"
  );

  const p = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "ignore"] });
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-store");
  p.stdout.pipe(res);
  const stop = () => {
    if (p.exitCode === null) p.kill("SIGKILL");
  };
  req.on("close", stop);
  res.on("close", stop);
  p.on("error", () => {
    if (!res.headersSent) res.status(503).end("FFmpeg unavailable");
  });
});

export default router;