// Open tracker for the Outreach Mailer app. GET /o/<code>.gif (rewritten to /api/o) returns a 1x1 picture and remembers
// the time. It stores only the random code of the email, the time and the kind of mail program. No names, no addresses.
// Storage: Upstash Redis (REST). Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or the KV_REST_API_* pair) in Vercel.
const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_TOKEN;

module.exports = async function handler(req, res) {
  const code = String(req.query.token || "").replace(/\.gif$/i, "");
  if (URL_ && TOKEN && /^[A-Za-z0-9_-]{8,40}$/.test(code)) {
    const ev = JSON.stringify({ ts: Math.floor(Date.now() / 1000), ua: String(req.headers["user-agent"] || "").slice(0, 80) });
    const key = "o:" + code;
    try {
      await fetch(URL_ + "/pipeline", {
        method: "POST",
        headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify([["RPUSH", key, ev], ["LTRIM", key, -50, -1], ["EXPIRE", key, 7776000]]),
      });
    } catch (e) { /* the picture is still returned */ }
  }
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex");
  res.status(200).send(GIF);
};
