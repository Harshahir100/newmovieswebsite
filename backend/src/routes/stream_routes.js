import express from "express";
import { Readable } from "node:stream";
import { validatePlaybackURL } from "../utils/security.js";
import { getToken } from "../utils/token.js";

const router = express.Router();

const FINAL_URL_TTL = Number(process.env.FINAL_URL_TTL || 600000); // 10 min

// ==========================================
// Final CDN URL resolver (redirect chain ek baar follow, phir cache)
// ==========================================
const finalCache = new Map();    // token -> { url, exp }
const finalInflight = new Map(); // token -> Promise

async function resolveFinal(url, redirects = 5) {
  let cur = url;
  for (let i = 0; i <= redirects; i++) {
    await validatePlaybackURL(cur);
    const r = await fetch(cur, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    await r.body?.cancel();
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get("location");
      if (!loc) throw new Error("Redirect without location");
      cur = new URL(loc, cur).href;
      continue;
    }
    if (!r.ok && r.status !== 206) throw new Error(`Origin HTTP ${r.status}`);
    return cur;
  }
  throw new Error("Too many redirects");
}

// transcode / probe routes me bhi isi ko use karo: const src = await getFinalUrl(req.params.token, item)
export async function getFinalUrl(token, item) {
  const hit = finalCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.url;
  if (finalInflight.has(token)) return finalInflight.get(token);
  const p = resolveFinal(item.url)
    .then((url) => {
      if (finalCache.size > 2000) finalCache.delete(finalCache.keys().next().value);
      finalCache.set(token, { url, exp: Date.now() + FINAL_URL_TTL });
      return url;
    })
    .finally(() => finalInflight.delete(token));
  finalInflight.set(token, p);
  return p;
}

async function upstream(url, method, headers = {}, redirects = 5) {
  let current = url;
  for (let i = 0; i <= redirects; i++) {
    await validatePlaybackURL(current);
    const r = await fetch(current, {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(120000),
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get("location");
      await r.body?.cancel();
      if (!loc) throw new Error("Redirect without location");
      current = new URL(loc, current).href;
      continue;
    }
    return r;
  }
  throw new Error("Too many redirects");
}

// ==========================================
// /api/stream-info/:token  —  HEAD probe of upstream
// ==========================================
router.get("/stream-info/:token", async (req, res) => {
  const item = getToken(req, res);
  if (!item) return;
  try {
    const r = await upstream(item.url, "HEAD");
    await r.body?.cancel();
    if (!r.ok) return res.status(502).json({ error: `Origin HTTP ${r.status}` });
    res.json({
      content_type: r.headers.get("content-type") || "application/octet-stream",
      content_length: r.headers.get("content-length"),
      accept_ranges: r.headers.get("accept-ranges"),
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ==========================================
// Download proxy (filename header ke liye proxy hi rakha)
// ==========================================
async function proxy(req, res) {
  const item = getToken(req, res);
  if (!item) return;
  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers["if-range"]) headers["If-Range"] = req.headers["if-range"];
    const r = await upstream(item.url, req.method, headers);
    res.status(r.status);
    for (const k of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
    ]) {
      const v = r.headers.get(k);
      if (v) res.setHeader(k, v);
    }
    const type = r.headers.get("content-type") || "";
    const ext =
      /matroska|x-matroska/i.test(type) || /\.mkv(?:$|[?#])/i.test(item.url)
        ? ".mkv"
        : ".mp4";
    const safe = String(item.title).replace(/[^\w.-]+/g, "_").slice(0, 100);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safe}_${item.metadata.quality}${ext}"`
    );
    if (req.method === "HEAD" || !r.body) {
      await r.body?.cancel();
      return res.end();
    }
    const body = Readable.fromWeb(r.body);
    res.on("close", () => {
      if (!res.writableEnded) body.destroy();
    });
    body.on("error", () => {
      if (!res.headersSent) res.status(502);
      res.end();
    });
    body.pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: e.message });
    else res.end();
  }
}


// ==========================================
// Play: seedha CDN par 302 redirect (proxy nahi)
// ==========================================
router.all("/play/:token", async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) return res.sendStatus(405);
  const item = getToken(req, res);
  if (!item) return;
  try {
    const url = await getFinalUrl(req.params.token, item);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.redirect(302, url);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

router.all("/download/:token", (req, res) =>
  ["GET", "HEAD"].includes(req.method) ? proxy(req, res) : res.sendStatus(405)
);

export default router;