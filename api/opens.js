// The app asks here for the opens of its own emails: POST {"tokens": ["code1", "code2", ...]} (up to 100 codes).
// The codes are random and secret to the sender, so there is no password. Returns {"opens": {code: [{ts, ua}]}}.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_TOKEN;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!URL_ || !TOKEN) return res.status(200).json({ opens: {}, configured: false });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const tokens = ((body && body.tokens) || []).filter((t) => /^[A-Za-z0-9_-]{8,40}$/.test(String(t))).slice(0, 100);
  if (!tokens.length) return res.status(200).json({ opens: {}, configured: true });
  try {
    const r = await fetch(URL_ + "/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify(tokens.map((t) => ["LRANGE", "o:" + t, 0, 49])),
    });
    const out = await r.json();
    const opens = {};
    tokens.forEach((t, i) => {
      const list = ((out[i] && out[i].result) || []).map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
      if (list.length) opens[t] = list;
    });
    res.status(200).json({ opens, configured: true });
  } catch (e) {
    res.status(502).json({ error: "tracker storage unreachable" });
  }
};
