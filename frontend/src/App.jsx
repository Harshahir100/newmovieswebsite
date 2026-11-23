
import { useState, useEffect } from "react";

import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";

import { Search, Loader2, X } from "lucide-react";

import api from "./api/client";

import Header from "./components/Header";
import MovieCard from "./components/MovieCard";

import Home from "./pages/Home";
import Platforms from "./pages/Platforms";
import Categories from "./pages/Categories";
import SeriesDetails from "./pages/SeriesDetails";
import WatchPage from "./pages/WatchPage";
import MovieDetails from "./pages/MovieDetails";
import Browse from "./pages/Browse";


// ==================================
// SEARCH SCROLL CSS
// ==================================

const SEARCH_SCROLL_CSS = `
/* Main website scrollbar */
html, body {
  scrollbar-width: thin;
  scrollbar-color: #b91c1c #151318;
}

html::-webkit-scrollbar,
body::-webkit-scrollbar {
  width: 8px;
}

html::-webkit-scrollbar-track,
body::-webkit-scrollbar-track {
  background: #151318;
}

html::-webkit-scrollbar-thumb,
body::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ef4444, #991b1b, #450a0a);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.12);
}

/* Search popup scrollbar */
.search-scroll {
  scrollbar-width: thin;
  scrollbar-color: #b91c1c #151318;
  overscroll-behavior: contain;
}

.search-scroll::-webkit-scrollbar {
  width: 7px;
}

.search-scroll::-webkit-scrollbar-track {
  background: #151318;
  border-radius: 20px;
}

.search-scroll::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ef4444, #991b1b, #450a0a);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.12);
}

.search-scroll::-webkit-scrollbar-thumb:hover {
  background: #ef4444;
}
`;


// ==================================
// APP CONTENT
// ==================================

function AppContent() {
  const navigate = useNavigate();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);


  // ==================================
  // LOCK BACKGROUND SCROLL
  // ==================================

  useEffect(() => {
    if (!showSearch) return;

    const body = document.body;
    const html = document.documentElement;

    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;

    body.style.overflow = "hidden";
    html.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
    };
  }, [showSearch]);


  // ==================================
  // SEARCH LOGIC
  // ==================================

  useEffect(() => {
    const query = searchQuery.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);

        const res = await api.get("/search", {
          params: {
            query,
            type: "multi",
          },
          signal: controller.signal,
        });

        const results = (res.data.results || []).filter(
          (item) =>
            item.media_type === "movie" ||
            item.media_type === "tv"
        );

        setSearchResults(results);

      } catch (err) {
        if (
          err.name !== "CanceledError" &&
          err.code !== "ERR_CANCELED"
        ) {
          console.error("Search error:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };

  }, [searchQuery]);


  // ==================================
  // CLEAR SEARCH
  // ==================================

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(false);
  };


  // ==================================
  // OPEN MOVIE / SERIES DETAILS
  // ==================================

  const openDetails = (movie) => {
    if (!movie) return;

    const id = movie.tmdb_id || movie.id;

    if (!id) {
      console.error("Movie ID missing:", movie);
      return;
    }

    const isTV =
      movie.media_type === "tv" ||
      movie.first_air_date !== undefined;

    if (isTV) {
      navigate(`/tv/${id}`);
    } else {
      navigate(`/movie/${id}`);
    }

    clearSearch();
  };


  // ==================================
  // MAIN UI
  // ==================================

  return (
    <div className="min-h-screen bg-[#09080d] text-white font-sans selection:bg-red-600 selection:text-white">

      <style>{SEARCH_SCROLL_CSS}</style>

      {/* HEADER */}

      <Header
        onSearchClick={() => setShowSearch(prev => !prev)}
      />


      {/* ==================================
          SEARCH INPUT OVERLAY
      ================================== */}

      {showSearch && (
        <div className="fixed top-[75px] sm:top-[85px] left-1/2 -translate-x-1/2 w-full max-w-3xl z-[110] px-3 sm:px-4">

          <div className="flex items-center gap-3 px-4 sm:px-5 py-3 rounded-full border border-white/15 bg-[#111116]/95 backdrop-blur-2xl shadow-2xl">

            <Search
              size={20}
              className="text-gray-400 shrink-0"
            />

            <input
              autoFocus
              type="text"
              placeholder="Search movies, TV shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none border-none w-full text-white placeholder-gray-500 text-sm"
            />

            {isSearching && (
              <Loader2
                size={19}
                className="animate-spin text-red-500 shrink-0"
              />
            )}

            <button
              onClick={clearSearch}
              aria-label="Close search"
              className="text-gray-400 hover:text-white transition"
            >
              <X size={19} />
            </button>

          </div>
        </div>
      )}


      {/* ==================================
          SEARCH RESULTS
      ================================== */}

      {showSearch && searchQuery.trim().length >= 2 && (
        <div className="fixed top-[140px] sm:top-[155px] left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-6xl z-[109]">

          <div className="max-h-[75vh] overflow-y-auto overscroll-contain touch-pan-y search-scroll rounded-2xl border border-white/10 bg-[#111116]/95 backdrop-blur-3xl shadow-2xl p-4 sm:p-6">

            {isSearching && searchResults.length === 0 ? (

              <div className="flex justify-center items-center py-12 text-red-500">
                <Loader2
                  size={32}
                  className="animate-spin"
                />
              </div>

            ) : searchResults.length === 0 ? (

              <p className="text-gray-400 text-center py-10 text-sm">
                No results found.
              </p>

            ) : (

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">

                {searchResults.map((movie, index) => (
                  <MovieCard
                    key={`${movie.media_type}-${movie.tmdb_id || movie.id}-${index}`}
                    movie={movie}
                    onClick={openDetails}
                  />
                ))}

              </div>

            )}

          </div>
        </div>
      )}


      {/* ==================================
          MAIN ROUTES
      ================================== */}

      <main>

        <Routes>

          {/* HOME */}

          <Route
            path="/"
            element={
              <Home
                onOpenDetails={openDetails}
              />
            }
          />


          {/* PLATFORMS */}

          <Route
            path="/platforms"
            element={
              <Platforms
                onOpenDetails={openDetails}
              />
            }
          />


          {/* CATEGORIES */}

          <Route
            path="/categories"
            element={<Categories />}
          />


          {/* MOVIE DETAILS */}

          <Route
            path="/movie/:id"
            element={<MovieDetails />}
          />


          {/* SERIES DETAILS */}

          <Route
            path="/tv/:id"
            element={<SeriesDetails />}
          />


          {/* WATCH PAGE */}

          <Route
            path="/watch/:type/:id/:season/:episode"
            element={<WatchPage />}
          />


          {/* BROWSE MOVIES */}

          <Route
            path="/movies"
            element={
              <Browse
                onOpenDetails={openDetails}
              />
            }
          />


          {/* BROWSE SERIES */}

          <Route
            path="/series"
            element={
              <Browse
                onOpenDetails={openDetails}
              />
            }
          />


          {/* GENERAL BROWSE */}

          <Route
            path="/browse"
            element={
              <Browse
                onOpenDetails={openDetails}
              />
            }
          />

        </Routes>

      </main>

    </div>
  );
}


// ==================================
// APP ROOT
// ==================================

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
