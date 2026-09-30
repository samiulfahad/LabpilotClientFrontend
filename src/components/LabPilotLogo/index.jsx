import { useId } from "react";

/**
 * Icon only: dark "chip" tile with a gradient-edged flask, live liquid wave,
 * ECG trace sweeping through it, rising bubbles and two circuit-trace nodes.
 * The tile is dark on purpose so the icon holds up on both light and dark UIs.
 * Size it with Tailwind (className="w-10 h-10") or the `size` prop.
 */
export const LabPilotIcon = ({ size = 40, className = "", title = "LabPilot Pro", ...props }) => {
  const uid = useId().replace(/:/g, "");
  const id = (name) => `lp-${name}-${uid}`;

  // Flask outline (open at the top; closed with Z only for the clip region)
  const flask = "M40 22 V43 L23 72 Q20 80 28 80 H72 Q80 80 77 72 L60 43 V22";
  const ecg = "M26 69 H38 L43 60 L50 78 L56 65 L59 69 H74";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id={id("tile")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B1224" />
          <stop offset=".6" stopColor="#14163A" />
          <stop offset="1" stopColor="#2A1B5E" />
        </linearGradient>
        <linearGradient id={id("edge")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset=".5" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <linearGradient id={id("stroke")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#67E8F9" />
          <stop offset="1" stopColor="#A78BFA" />
        </linearGradient>
        <linearGradient id={id("liquid")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22D3EE" stopOpacity=".7" />
          <stop offset="1" stopColor="#7C3AED" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id={id("gloss")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".14" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id("clip")}>
          <path d={`${flask} Z`} />
        </clipPath>
      </defs>

      {/* Tile + gradient edge + top sheen */}
      <rect width="100" height="100" rx="24" fill={`url(#${id("tile")})`} />
      <path d="M0 24 Q0 0 24 0 H76 Q100 0 100 24 V40 Q50 52 0 40 Z" fill={`url(#${id("gloss")})`} />
      <rect x="1" y="1" width="98" height="98" rx="23" fill="none" stroke={`url(#${id("edge")})`} strokeWidth="2" />

      {/* Circuit traces + pulsing nodes */}
      <path
        d="M34 22 H17 V13"
        fill="none"
        stroke="#22D3EE"
        strokeOpacity=".75"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M66 22 H83 V13"
        fill="none"
        stroke="#A78BFA"
        strokeOpacity=".75"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="13" r="3.2" fill="#22D3EE" />
      <circle cx="83" cy="13" r="3.2" fill="#A78BFA" />
      <circle cx="17" cy="13" r="3.2" fill="none" stroke="#22D3EE" strokeWidth="1.2">
        <animate attributeName="r" values="3.2;8" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values=".8;0" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="83" cy="13" r="3.2" fill="none" stroke="#A78BFA" strokeWidth="1.2">
        <animate attributeName="r" values="3.2;8" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values=".8;0" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
      </circle>

      {/* Liquid (clipped to flask): rolling wave + bubbles */}
      <g clipPath={`url(#${id("clip")})`}>
        <path
          d="M-50 54 Q-37.5 49 -25 54 T0 54 T25 54 T50 54 T75 54 T100 54 T125 54 T150 54 V100 H-50 Z"
          fill={`url(#${id("liquid")})`}
        >
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0;50 0"
            dur="3.2s"
            repeatCount="indefinite"
          />
        </path>
        <circle cx="47" cy="52" r="2" fill="#CFFAFE">
          <animate attributeName="cy" values="52;26" dur="2.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;.9;0" dur="2.8s" repeatCount="indefinite" />
        </circle>
        <circle cx="54" cy="52" r="1.4" fill="#CFFAFE">
          <animate attributeName="cy" values="52;28" dur="2.8s" begin="1.3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;.9;0" dur="2.8s" begin="1.3s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Flask outline + rim */}
      <path
        d={flask}
        fill="none"
        stroke={`url(#${id("stroke")})`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M34 22 H66" stroke={`url(#${id("stroke")})`} strokeWidth="5" strokeLinecap="round" />

      {/* ECG: faint full trace + bright sweep */}
      <path
        d={ecg}
        fill="none"
        stroke="#E0F2FE"
        strokeOpacity=".35"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={ecg}
        pathLength="100"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="30 100"
      >
        <animate attributeName="stroke-dashoffset" from="30" to="-100" dur="2.4s" repeatCount="indefinite" />
      </path>
    </svg>
  );
};

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
    icon: "drop-shadow-[0_0_14px_rgba(34,211,238,0.45)]",
    pulse: "drop-shadow-[0_0_5px_rgba(34,211,238,0.9)]",
    pro: "shadow-[0_0_12px_rgba(139,92,246,0.65)]",
  },
  light: {
    lab: "text-slate-800",
    pilot: "from-sky-500 via-blue-600 to-violet-600 drop-shadow-[0_1px_8px_rgba(59,130,246,0.45)]",
    tagline: "text-slate-600",
    cursor: "bg-blue-600",
    icon: "drop-shadow-[0_4px_10px_rgba(59,130,246,0.4)]",
    pulse: "",
    pro: "shadow-md shadow-violet-500/30",
  },
};

/**
 * Icon + wordmark + PRO badge + pulse + tagline.
 * <LabPilotLogo />                                  light (default)
 * <LabPilotLogo theme="dark" />                     for dark backgrounds
 * <LabPilotLogo iconClassName="w-14 h-14" />        bigger (login page)
 * <LabPilotLogo showPulse={false} showTagline={false} />
 */
const LabPilotLogo = ({
  theme = "light",
  iconClassName = "w-10 h-10",
  showTagline = true,
  showPro = true,
  showPulse = false,
  className = "",
}) => {
  const t = THEMES[theme] || THEMES.light;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LabPilotIcon className={`${iconClassName} flex-shrink-0 ${t.icon}`} />
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
