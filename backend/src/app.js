import express from "express";
import cors from "cors";
import { PORT, FRONTEND_ORIGINS, ADDONS, TMDB_KEY } from "./config/env.js";
import { purgeTokens } from "./utils/token.js";
import tmdbRouter from "./routes/tmdb_routes.js";
import streamRouter from "./routes/stream_routes.js";
import probeRouter from "./routes/probe_routes.js";

const app = express();

app.use(cors({ origin: FRONTEND_ORIGINS, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.use("/api", tmdbRouter);
app.use("/api", streamRouter);
app.use("/api", probeRouter);

setInterval(purgeTokens, 60000).unref();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`vegafilms API listening on :${PORT}`);
  console.log(
    `Addons: ${ADDONS.map((a) => a.name).join(", ") || "none configured"}`
  );
  console.log(`TMDB: ${TMDB_KEY ? "configured" : "MISSING"}`);
});