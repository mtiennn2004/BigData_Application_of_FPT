module.exports = async (req, res) => {
  try {
    const url =
      "http://52.64.32.78:9000/dantt.bucket1/Final_report/FPT_stock.json";

    const r = await fetch(url);
    if (!r.ok) {
      res.statusCode = 502;
      return res.end("Failed to fetch from MinIO");
    }

    const text = await r.text();

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.statusCode = 200;
    return res.end(text);
  } catch (e) {
    res.statusCode = 500;
    return res.end(String(e?.message || e));
  }
};
