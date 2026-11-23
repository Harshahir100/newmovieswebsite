const QUALITY_ORDER = { "2160p": 0, "1080p": 1, "720p": 2, "480p": 3, Unknown: 4 };

export function metadata(s) {
  const h = s.behaviorHints || {};
  const filename = h.filename || s.filename || "";
  const text = [filename, s.name || "", s.title || "", s.description || ""].join(" ");
  const has = (p) => new RegExp(p, "i").test(text);

  let quality = "Unknown";
  for (const [p, q] of [
    ["2160p|4k|uhd", "2160p"],
    ["1080p", "1080p"],
    ["720p", "720p"],
    ["480p", "480p"],
  ])
    if (has(p)) {
      quality = q;
      break;
    }

  let size = "Size not provided";
  let size_bytes = 0;
  if (Number.isFinite(Number(h.videoSize)) && Number(h.videoSize) > 0) {
    size_bytes = Number(h.videoSize);
    size = `${(size_bytes / 1024 ** 3).toFixed(2)} GB`;
  } else {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i);
    if (m) {
      const n = Number(m[1]);
      const u = m[2].toUpperCase();
      size = `${n} ${u}`;
      size_bytes = n * ({ TB: 1024 ** 4, GB: 1024 ** 3, MB: 1024 ** 2 }[u]);
    }
  }

  const is_hindi = has("hindi|\\bhin\\b|\\bhind\\b|🇮🇳");
  const is_english = has("english|\\beng\\b|🇬🇧|🇺🇸");

  const languages = [];
  if (is_hindi) languages.push({ name: "Hindi", code: "in" });
  if (is_english) languages.push({ name: "English", code: "us" });

  const collect = (pairs) => pairs.filter(([p]) => has(p)).map(([, v]) => v);

  const codec = collect([
    ["\\bHEVC\\b|\\bH\\.?265\\b|x265", "HEVC"],
    ["\\bAVC\\b|\\bH\\.?264\\b|x264", "H.264"],
    ["\\bAV1\\b", "AV1"],
  ]);

  const hdr = collect([
    ["Dolby Vision|\\bDV\\b", "DV"],
    ["\\bHDR10\\+?\\b", "HDR10"],
    ["\\bHDR\\b", "HDR"],
    ["10[- ]?bit", "10bit"],
  ]);

  const audio = collect([
    ["Dolby Atmos", "Atmos"],
    ["\\bDDP\\b|\\bEAC3\\b|\\bDD\\+", "DD+"],
    ["DTS-HD", "DTS-HD"],
    ["\\bDTS\\b", "DTS"],
    ["\\bAAC\\b", "AAC"],
    ["\\bFLAC\\b", "FLAC"],
    ["TrueHD", "TrueHD"],
  ]);

  let source = "Unknown";
  for (const [p, v] of [
    ["REMUX", "REMUX"],
    ["BluRay|BDRip|BRRip", "BluRay"],
    ["WEB[- .]?DL", "WEB-DL"],
    ["WEBRip", "WEBRip"],
    ["HDTV", "HDTV"],
  ])
    if (has(p)) {
      source = v;
      break;
    }

  return {
    file_title: filename || s.title || s.description || s.name || "Unknown file",
    quality,
    size,
    size_bytes,
    is_hindi,
    languages,
    codec,
    hdr,
    audio,
    source,
  };
}

export { QUALITY_ORDER };