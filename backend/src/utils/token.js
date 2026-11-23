import crypto from "node:crypto";
import { TOKEN_TTL } from "../config/env.js";

export const tokenStore = new Map();

export function purgeTokens() {
  const now = Date.now();
  for (const [t, v] of tokenStore) if (now - v.created > TOKEN_TTL) tokenStore.delete(t);
}

export function getToken(req, res) {
  const item = tokenStore.get(req.params.token);
  if (!item) {
    res.status(404).json({ error: "Stream expired" });
    return null;
  }
  return item;
}

export function issueToken(url, title, meta) {
  const token = crypto.randomBytes(24).toString("base64url");
  tokenStore.set(token, { url, title: title || "video", metadata: meta, created: Date.now() });
  return token;
}