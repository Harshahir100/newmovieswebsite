export async function fetchJSON(url, timeout = 15000) {
  const r = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "PvrPlay/2.0" },
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`Upstream HTTP ${r.status}`);
  return r.json();
}