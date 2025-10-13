/* eslint-disable react/prop-types */
function SpaceBackground({ children, className = '', contentClassName = '' }) {
  return (
    <div
      className={`relative min-h-screen w-full overflow-hidden bg-slate-950 text-slate-100 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 scale-110 bg-space bg-cover bg-center opacity-80 saturate-125 animate-slow-pan blur-2xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/92 to-slate-950/96 backdrop-blur-md" />
      </div>
      <div className="pointer-events-none absolute inset-0">
        <span className="absolute left-1/3 top-1/5 h-1 w-1 -translate-x-1/2 rounded-full bg-white/80 blur-[0.5px] animate-twinkle" />
        <span className="absolute left-2/3 top-1/3 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-200/80 blur-[0.5px] animate-[twinkle_3s_1s_ease-in-out_infinite]" />
        <span className="absolute left-1/5 top-2/3 h-1 w-1 -translate-x-1/2 rounded-full bg-purple-200/80 blur-[0.5px] animate-[twinkle_3s_2s_ease-in-out_infinite]" />
        <span className="absolute left-[15%] top-[15%] h-1 w-1 rounded-full bg-indigo-200/75 blur-[0.5px] animate-[twinkle_3.5s_0.6s_ease-in-out_infinite]" />
        <span className="absolute left-[55%] top-[70%] h-1 w-1 rounded-full bg-rose-200/75 blur-[0.5px] animate-[twinkle_4s_1.4s_ease-in-out_infinite]" />
        <span className="absolute left-[80%] top-[45%] h-1 w-1 rounded-full bg-slate-100/80 blur-[0.5px] animate-[twinkle_2.8s_0.2s_ease-in-out_infinite]" />
        <span className="absolute left-[40%] top-[82%] h-1 w-1 rounded-full bg-cyan-200/75 blur-[0.5px] animate-[twinkle_3.2s_1.8s_ease-in-out_infinite]" />
      </div>
      <div className={`relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-6 py-12 sm:px-8 ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}

export default SpaceBackground;
