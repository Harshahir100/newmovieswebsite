  import { useEffect, useState } from "react";
  import { useParams, useNavigate } from "react-router-dom";
  import api from "../api/client";
  import PlayerModal from "../components/PlayerModal";
  import { Loader2, AlertTriangle } from "lucide-react";

  export default function WatchPage() {
    const { type, id, season, episode } = useParams();
    const navigate = useNavigate();
    
    const [streams, setStreams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [title, setTitle] = useState("");

    useEffect(() => {
      const fetchStreams = async () => {
        try {
          setLoading(true);
          let res;
          let pageTitle = "";

          if (type === "tv") {
            res = await api.get(`/tv/${id}/streams?season=${season}&episode=${episode}`);
            pageTitle = res.data.title || `Series S${season}E${episode}`;
          } else {
            res = await api.get(`/movie/${id}/streams`);
            pageTitle = res.data.title || "Movie";
          }

          setStreams(res.data.streams || []);
          setTitle(pageTitle);
        } catch (err) {
          console.error("Failed to load streams", err);
          setError(err.response?.data?.error || "Failed to load streams. Please try again.");
        } finally {
          setLoading(false);
        }
      };

      if (id) fetchStreams();
    }, [id, type, season, episode]);

    if (loading) {
      return (
        <div className="min-h-screen bg-[#0b0b0b] flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-red-500 mb-4" size={48} />
          <p className="text-gray-400 font-medium">Loading Player...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen bg-[#0b0b0b] flex flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="text-red-500 mb-4" size={48} />
          <p className="text-white text-lg mb-6">{error}</p>
          <button onClick={() => navigate(-1)} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold transition">
            Go Back
          </button>
        </div>
      );
    }

    if (streams.length === 0) {
      return (
        <div className="min-h-screen bg-[#0b0b0b] flex flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="text-yellow-500 mb-4" size={48} />
          <p className="text-white text-lg mb-6">No streams found for this episode.</p>
          <button onClick={() => navigate(-1)} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold transition">
            Go Back
          </button>
        </div>
      );
    }

    // PlayerModal ko render karo (bina kisi modal popup ke, seedha page par)
    return (
      <div className="fixed inset-0 z-[200] bg-black">
        <PlayerModal 
          streams={streams} 
          initialStream={streams[0]} 
          title={title}
          onClose={() => navigate(-1)} 
        />
      </div>
    );
  }