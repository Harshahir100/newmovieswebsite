// Dark cinematic page background (red edge glow) - Categories / Browse / Platforms me use hota hai
export default function CinematicBg() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#09060a]">
      <div className="absolute -left-40 top-10 h-[32rem] w-[32rem] rounded-full bg-red-700/25 blur-[150px]" />
      <div className="absolute -right-40 top-[40%] h-[32rem] w-[32rem] rounded-full bg-red-600/20 blur-[150px]" />
      <div className="absolute left-1/3 -bottom-48 h-[28rem] w-[28rem] rounded-full bg-indigo-700/15 blur-[150px]" />
    </div>
  );
}