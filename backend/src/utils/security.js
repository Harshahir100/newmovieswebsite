import dns from "node:dns/promises";
import net from "node:net";
import { dnsCache } from "./cache.js";

function isPublicIPv4(ip) {
  const [a, b, c] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a === 255
  );
}

function isPublicIPv6(ip) {
  const x = ip.toLowerCase();
  return !(
    x === "::" ||
    x === "::1" ||
    x.startsWith("fc") ||
    x.startsWith("fd") ||
    x.startsWith("fe8") ||
    x.startsWith("fe9") ||
    x.startsWith("fea") ||
    x.startsWith("feb") ||
    x.startsWith("ff") ||
    x.startsWith("::ffff:")
  );
}

export async function isPublicHost(host) {
  if (dnsCache.get(host) !== undefined) return dnsCache.get(host);
  try {
    if (net.isIP(host)) {
      const ip = host.toLowerCase();
      const bad =
        ip === "::1" ||
        ip === "::" ||
        ip.startsWith("fc") ||
        ip.startsWith("fd") ||
        ip.startsWith("fe8") ||
        ip.startsWith("fe9") ||
        ip.startsWith("fea") ||
        ip.startsWith("feb") ||
        ip.startsWith("ff") ||
        ip.startsWith("::ffff:");
      const ok = net.isIPv4(ip) ? isPublicIPv4(ip) : !bad;
      dnsCache.set(host, ok, 600000);
      return ok;
    }
    const records = await dns.lookup(host, { all: true, verbatim: true });
    const ok =
      records.length > 0 &&
      records.every((r) =>
        net.isIPv4(r.address) ? isPublicIPv4(r.address) : isPublicIPv6(r.address)
      );
    dnsCache.set(host, ok, 600000);
    return ok;
  } catch {
    return false;
  }
}

export async function validatePlaybackURL(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password)
    throw new Error("Blocked playback URL");
  if (
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    u.hostname.endsWith(".local") ||
    !(await isPublicHost(u.hostname))
  )
    throw new Error("Blocked playback host");
  return u;
}