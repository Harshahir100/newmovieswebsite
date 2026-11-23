import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { OTT_PLATFORMS } from "../data/ottPlatforms";

export default function PlatformsDropdown({ onSelectPlatform }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 hover:text-white transition py-2"
      >
        Platforms <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Invisible backdrop to close dropdown when clicking outside */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          ></div>

          <div className="absolute top-full mt-2 w-56 bg-[#0a0a0a] border border-gray-800 rounded-xl shadow-2xl py-2 z-50 overflow-hidden">
            {OTT_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                onClick={() => {
                  onSelectPlatform(platform);
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-[#1a1a1a] flex items-center gap-3 text-sm text-gray-300 transition-colors"
              >
                <img 
                  src={platform.logo} 
                  alt={platform.name} 
                  className="w-7 h-7 rounded-md object-cover bg-white" 
                />
                <span className="font-medium">{platform.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}