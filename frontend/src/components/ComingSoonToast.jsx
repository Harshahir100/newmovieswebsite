import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

// message = feature ka naam (e.g. "Live TV"). null = hidden. 2.8 sec me khud band.
export default function ComingSoonToast({ message, onClose }) {
  const [show, setShow] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!message) {
      setShow(false);
      return;
    }
    const id = requestAnimationFrame(() => setShow(true));
    const t = setTimeout(() => closeRef.current?.(), 2800);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [message]);

  if (!message) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-24 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm flex items-center gap-3 rounded-2xl px-4 py-3 bg-[#0d0709]/80 backdrop-blur-2xl border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_40px_-10px_rgba(229,9,20,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 motion-reduce:transition-none ${
        show ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"
      }`}
    >
      <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-red-600/25 border border-red-400/40">
        <Clock size={18} className="text-red-400" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-white">Coming soon</p>
        <p className="text-sm text-white/70">{message} will be available shortly.</p>
      </div>
    </div>,
    document.body
  );
}