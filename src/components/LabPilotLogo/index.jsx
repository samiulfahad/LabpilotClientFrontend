import { useId } from "react";

/** Animated heartbeat line: dim baseline, gradient tail and a glowing head that scans across. */
export const LabPilotPulse = ({ className = "w-32 h-3.5" }) => {
  const uid = useId().replace(/:/g, "");
  const gid = `lp-pulse-${uid}`;
  const fid = `lp-glow-${uid}`;
  const d = "M0 142 H96 L104 142 L112 128 L122 158 L130 134 L136 142 H218 L224 142 L229 134 L234 148 L238 142 H366";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 124 366 38"
      className={className}
      style={{ overflow: "visible" }}
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <filter id={fid} x="-20%" y="-100%" width="140%" height="300%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Dotted scan baseline */}
      <path
        d="M0 142 H366"
        fill="none"
        stroke={`url(#${gid})`}
        strokeOpacity=".28"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />

      {/* Dim full trace */}
      <path
        d={d}
        fill="none"
        stroke={`url(#${gid})`}
        strokeOpacity=".28"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Gradient tail */}
      <path
        d={d}
        pathLength="1000"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="170 1000"
      >
        <animate attributeName="stroke-dashoffset" from="170" to="-1000" dur="2.4s" repeatCount="indefinite" />
      </path>

      {/* Bright glowing head (same timing, so it rides the tip of the tail) */}
      <path
        d={d}
        pathLength="1000"
        fill="none"
        stroke="#fff"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="14 1000"
        filter={`url(#${fid})`}
      >
        <animate attributeName="stroke-dashoffset" from="14" to="-1156" dur="2.4s" repeatCount="indefinite" />
      </path>
    </svg>
  );
};

const THEMES = {
  dark: {
    lab: "text-slate-100",
    pilot: "from-cyan-300 via-sky-400 to-violet-400",
    tagline: "text-slate-400",
    cursor: "bg-cyan-300",
    pulse: "drop-shadow-[0_0_5px_rgba(34,211,238,0.9)]",
    pro: "shadow-[0_0_12px_rgba(139,92,246,0.65)]",
  },
  light: {
    lab: "text-slate-800",
    pilot: "from-sky-500 via-blue-600 to-violet-600 drop-shadow-[0_1px_8px_rgba(59,130,246,0.45)]",
    tagline: "text-slate-600",
    cursor: "bg-blue-600",
    pulse: "",
    pro: "shadow-md shadow-violet-500/30",
  },
};

/**
 * Wordmark + PRO badge + pulse + tagline.
 * <LabPilotLogo />                                  light (default)
 * <LabPilotLogo theme="dark" />                     for dark backgrounds
 * <LabPilotLogo showPulse={false} showTagline={false} />
 */
const LabPilotLogo = ({ theme = "light", showTagline = true, showPro = true, showPulse = true, className = "" }) => {
  const t = THEMES[theme] || THEMES.light;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex flex-col min-w-0">
        <span
          className={`text-[19px] leading-none flex items-center gap-2 ${t.lab}`}
          style={{
            fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
            letterSpacing: "-0.03em",
          }}
        >
          <span>
            <span className="font-light">Lab</span>
            <span className={`font-black bg-gradient-to-r ${t.pilot} bg-clip-text text-transparent`}>Pilot</span>
          </span>
          {showPro && (
            <span
              className={`text-[9px] font-extrabold tracking-wider text-white px-1.5 py-[3px] rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 ring-1 ring-white/25 ${t.pro}`}
            >
              PRO
            </span>
          )}
        </span>
        {showPulse && <LabPilotPulse className={`w-full max-w-[9.5rem] h-3.5 mt-1.5 ${t.pulse}`} />}
        {showTagline && (
          <span
            className={`mt-1 flex items-center gap-1 font-mono text-[9px] font-medium tracking-[0.12em] leading-tight ${t.tagline}`}
          >
            Your smart partner
            <span className={`inline-block w-[5px] h-[9px] rounded-[1px] animate-pulse ${t.cursor}`} />
          </span>
        )}
      </div>
    </div>
  );
};

export default LabPilotLogo;
