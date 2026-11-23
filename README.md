# vegafilms— Node.js backend + React integration

## Folder structure

```text
vegafilms-node/
├── backend/
│   ├── src/server.js
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api/client.js
│       └── components/
│           ├── MovieCard.jsx
│           ├── SectionRow.jsx
│           └── DetailsModal.jsx
└── README.md
```

## Backend setup

1. Install Node.js 20+ (Node 24 is fine).
2. Open terminal in `backend`.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Add TMDB API key and your configured addon base URLs.
6. Run `npm run dev`.

Health: http://localhost:5000/api/health

## React integration

Copy the supplied `frontend/src` files into your existing React app. Keep your existing `PlayerModal.jsx` in `frontend/src/components/`; it is compatible with the `/api/probe`, `/api/transcode`, and `/api/play` endpoints in this backend.

Set `VITE_API_BASE_URL=http://127.0.0.1:5000/api` in the React project's `.env`.

The search uses TMDB `search/multi`, so both movies and TV series appear. The DetailsModal uses `media_type` to decide between movie streams and TV seasons/episodes.

## API endpoints

- GET `/api/health`
- GET `/api/search?query=12th%20Fail&type=multi` (`movie`, `tv`, `multi`)
- GET `/api/trending?type=movie&category=popular`
- GET `/api/trending?type=tv&category=popular`
- GET `/api/movie/:id/streams`
- GET `/api/tv/:id/seasons`
- GET `/api/tv/:id/season/:season`
- GET `/api/tv/:id/streams?season=1&episode=1`
- GET `/api/stream-info/:token`
- GET `/api/play/:token` (GET/HEAD, HTTP Range forwarded)
- GET `/api/download/:token` (GET/HEAD, HTTP Range forwarded)
- GET `/api/probe/:token` (requires ffprobe)
- GET `/api/transcode/:token?audio=0&start=0&v=copy` (requires ffmpeg)

## Performance notes

- Addons are fetched concurrently with `Promise.all`.
- Search is debounced by 300ms and stale search responses are ignored.
- TMDB and addon responses use bounded in-memory TTL caches and in-flight request deduplication.
- This returns the combined addon results after all configured addon calls finish or time out. It does not progressively stream partial addon results to the UI.
- For multiple backend processes/instances, move caches and tokens to Redis; in-memory caches are per process.
- The playback proxy validates HTTPS hosts and redirects. For production, additionally enforce outbound network restrictions at the host/container firewall to defend against DNS rebinding and other SSRF edge cases.
- FFmpeg video re-encoding (`v=h264`) is CPU intensive. Direct playback is fastest; use transcoding only when required.
