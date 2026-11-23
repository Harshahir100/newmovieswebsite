import { spawn } from "node:child_process";
import { FFPROBE } from "../config/env.js";

export const LANG = {
  hin: "Hindi",
  hi: "Hindi",
  eng: "English",
  en: "English",
  tam: "Tamil",
  ta: "Tamil",
  tel: "Telugu",
  te: "Telugu",
  mal: "Malayalam",
  ml: "Malayalam",
  kan: "Kannada",
  kn: "Kannada",
  ben: "Bengali",
  bn: "Bengali",
  mar: "Marathi",
  mr: "Marathi",
  pan: "Punjabi",
  pa: "Punjabi",
  jpn: "Japanese",
  ja: "Japanese",
  kor: "Korean",
  ko: "Korean",
};

export function audioLanguage(tags = {}) {
  const code = (tags.language || "").toLowerCase();
  if (LANG[code]) return LANG[code];
  const title = (tags.title || "").toLowerCase();
  for (const name of Object.values(LANG))
    if (title.includes(name.toLowerCase())) return name;
  return code && code !== "und" ? code.toUpperCase() : "Unknown";
}

// url: getFinalUrl(token, item) se mila final CDN url pass karo
export function runProbe(url) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      FFPROBE,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "http,https,tcp,tls,crypto",
        "-probesize",
        "5M",
        "-analyzeduration",
        "5M",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        url,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("ffprobe timeout"));
    }, 30000);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(err.slice(-1000) || "ffprobe failed"));
      try {
        resolve(JSON.parse(out || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}