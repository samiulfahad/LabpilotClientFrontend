import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ReceiptText,
  FlaskConical,
  Users,
  BarChart3,
  Plus,
  ArrowUpRight,
  Microscope,
  Activity,
  MapPin,
  Phone,
  Mail,
  Home as HomeIcon,
  ArrowLeftRight,
  Percent,
  CreditCard,
  UserCircle,
  Users2,
  Stethoscope,
  BedDouble,
  ClipboardPlus,
  Settings,
  Stamp,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";

// ─── helpers ──────────────────────────────────────────────────────────────────
const useClock = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time.toLocaleTimeString("bn-BD", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "শুভ সকাল";
  if (h < 17) return "শুভ দুপুর";
  return "শুভ সন্ধ্যা";
};

// Same admin-bypass + `modules.includes` rule as RequireModules in App.jsx
// and getMenuForLabType in menuConfig.js — kept local so this component
// doesn't need to reach into that file just for a boolean check.
const hasModuleAccess = (user, moduleKey) => {
  if (moduleKey === null) return true;
  const isAdmin = user?.role === "admin";
  return isAdmin || !!user?.modules?.includes(moduleKey);
};

// ─── quick-access actions, per lab type ────────────────────────────────────────
// `module` mirrors the module names in ALLOWED_PERMISSIONS (staticData.js) /
// hospitalMenu & diagnosticCenterMenu (menuConfig.js), so a card only ever
// shows up for someone the route gate (RequireModules) will actually let in.
const HOSPITAL_ACTIONS = [
  {
    to: "/outdoor/invoice/new",
    icon: Plus,
    label: "নতুন ইনভয়েস",
    sub: "রোগীর বিলিং তৈরি করুন",
    grad: "from-violet-500 to-indigo-600",
    glow: "rgba(99,102,241,0.3)",
    module: "invoice",
  },
  {
    to: "/outdoor",
    icon: Stethoscope,
    label: "আউটডোর রোগী",
    sub: "ইনভয়েস ও রোগী তথ্য",
    grad: "from-sky-400 to-blue-600",
    glow: "rgba(59,130,246,0.3)",
    module: "invoice",
  },
  {
    to: "/ipd/admit",
    icon: BedDouble,
    label: "রোগী ভর্তি",
    sub: "নতুন ইনডোর ভর্তি",
    grad: "from-cyan-400 to-blue-500",
    glow: "rgba(34,211,238,0.3)",
    module: "indoorPatient",
  },
  {
    to: "/ipd/patients",
    icon: ClipboardPlus,
    label: "ভর্তি রোগীর তালিকা",
    sub: "ওয়ার্ড ও আইসিইউ তথ্য",
    grad: "from-teal-400 to-cyan-600",
    glow: "rgba(20,184,166,0.3)",
    module: "indoorPatient",
  },
  {
    to: "/report",
    icon: FlaskConical,
    label: "রিপোর্টস",
    sub: "পরীক্ষার ফলাফল ও তথ্য",
    grad: "from-emerald-400 to-green-600",
    glow: "rgba(16,185,129,0.3)",
    module: "testReport",
  },
  {
    to: "/cashmemo",
    icon: BarChart3,
    label: "ক্যাশমেমু",
    sub: "মুনাফা ও সংগ্রহ",
    grad: "from-amber-400 to-orange-500",
    glow: "rgba(245,158,11,0.3)",
    module: "dailyReport",
  },
  {
    to: "/billing",
    icon: CreditCard,
    label: "বিলিং",
    sub: "পেমেন্ট ও বকেয়া",
    grad: "from-rose-400 to-red-600",
    glow: "rgba(239,68,68,0.3)",
    module: "billing",
  },
  {
    to: "/account",
    icon: UserCircle,
    label: "অ্যাকাউন্ট",
    sub: "প্রোফাইল ও সেটিংস",
    grad: "from-slate-400 to-slate-600",
    glow: "rgba(100,116,139,0.3)",
    module: null,
  },
];

const DIAGNOSTIC_ACTIONS = [
  {
    to: "/outdoor/invoice/new",
    icon: Plus,
    label: "নতুন ইনভয়েস",
    sub: "রোগীর বিলিং তৈরি করুন",
    grad: "from-violet-500 to-indigo-600",
    glow: "rgba(99,102,241,0.3)",
    module: "invoice",
  },
  {
    to: "/invoice-master",
    icon: ReceiptText,
    label: "ইনভয়েস মাস্টার",
    sub: "রেকর্ড দেখুন ও পরিচালনা করুন",
    grad: "from-sky-400 to-blue-600",
    glow: "rgba(59,130,246,0.3)",
    module: "invoice",
  },
  {
    to: "/report",
    icon: FlaskConical,
    label: "রিপোর্টস",
    sub: "পরীক্ষার ফলাফল ও তথ্য",
    grad: "from-teal-400 to-emerald-600",
    glow: "rgba(16,185,129,0.3)",
    module: "testReport",
  },
  {
    to: "/cashmemo",
    icon: BarChart3,
    label: "ক্যাশমেমু",
    sub: "মুনাফা ও সংগ্রহ",
    grad: "from-amber-400 to-orange-500",
    glow: "rgba(245,158,11,0.3)",
    module: "dailyReport",
  },
  {
    to: "/collection-report",
    icon: ArrowLeftRight,
    label: "লেনদেন",
    sub: "পেমেন্ট রেকর্ড",
    grad: "from-blue-400 to-cyan-600",
    glow: "rgba(6,182,212,0.3)",
    module: "dailyReport",
  },
  {
    to: "/commission-report",
    icon: Percent,
    label: "কমিশন",
    sub: "রেফারেল আয়",
    grad: "from-fuchsia-500 to-pink-600",
    glow: "rgba(217,70,239,0.3)",
    module: "dailyReport",
  },
  {
    to: "/billing",
    icon: CreditCard,
    label: "বিলিং",
    sub: "পেমেন্ট ও বকেয়া",
    grad: "from-rose-400 to-red-600",
    glow: "rgba(239,68,68,0.3)",
    module: "billing",
  },
  {
    to: "/account",
    icon: UserCircle,
    label: "অ্যাকাউন্ট",
    sub: "প্রোফাইল ও সেটিংস",
    grad: "from-slate-400 to-slate-600",
    glow: "rgba(100,116,139,0.3)",
    module: null,
  },
];

// ─── nav menu, per lab type ─────────────────────────────────────────────────
const HOSPITAL_NAV = [
  { to: "/", icon: HomeIcon, label: "প্রধান পাতা", color: "text-indigo-500", bg: "bg-indigo-50", module: null },
  {
    to: "/manage-doctors",
    icon: Stamp,
    label: "ডাক্তার",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    module: "setup",
  },
  { to: "/manage-staffs", icon: Users2, label: "স্টাফ", color: "text-rose-500", bg: "bg-rose-50", module: "setup" },
  { to: "/setup", icon: Settings, label: "সেটআপ", color: "text-gray-600", bg: "bg-gray-100", module: "setup" },
];

const DIAGNOSTIC_NAV = [
  { to: "/", icon: HomeIcon, label: "প্রধান পাতা", color: "text-indigo-500", bg: "bg-indigo-50", module: null },
  {
    to: "/manage-referrers",
    icon: Users,
    label: "মিডিয়া",
    color: "text-fuchsia-600",
    bg: "bg-fuchsia-50",
    module: "setup",
  },
  { to: "/manage-staffs", icon: Users2, label: "স্টাফ", color: "text-rose-500", bg: "bg-rose-50", module: "setup" },
  { to: "/setup", icon: Settings, label: "সেটআপ", color: "text-gray-600", bg: "bg-gray-100", module: "setup" },
];

// ─── Action card ─────────────────────────────────────────────────────────────
const Card = ({ to, icon: Icon, label, grad, glow, idx }) => (
  <Link
    to={to}
    className="group relative rounded-2xl overflow-hidden"
    style={{ animation: `cardIn 0.5s cubic-bezier(.22,1,.36,1) ${200 + idx * 55}ms both` }}
  >
    <div className="relative h-full bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl overflow-hidden">
      <div
        className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-2xl"
        style={{ background: glow }}
      />
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shadow-lg`}>
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-200">
          <ArrowUpRight className="w-3.5 h-3.5 text-gray-500" />
        </div>
      </div>
      <p className="text-sm font-normal text-gray-800 leading-tight font-noto">{label}</p>
      <div
        className={`absolute bottom-0 left-0 h-[2px] w-0 group-hover:w-full bg-gradient-to-r ${grad} transition-all duration-500`}
      />
    </div>
  </Link>
);

// ─── Home ────────────────────────────────────────────────────────────────────
const Home = () => {
  const clock = useClock();

  const { user, lab } = useAuthStore();

  const labName = lab?.name ?? "—";
  const labId = lab?.labKey ?? "—";
  const labAddress = lab?.contact?.address ?? "—";
  // Combined phone string — "017..., 018..." when there are two distinct
  // numbers (comma-separated), de-duplicated so an identical primary/
  // secondary pair (or a missing secondary) just shows the one number
  // instead of repeating it.
  const labPhone =
    [lab?.contact?.primary, lab?.contact?.secondary].filter((v, i, arr) => v && arr.indexOf(v) === i).join(", ") || "—";
  const labEmail = lab?.contact?.publicEmail ?? "—";
  const isLabActive = lab?.isActive ?? false;
  const isHospital = lab?.type === "hospital";
  // Raw sanitized SVG markup for the lab's logo — used both as a small mark
  // beside the lab name and, much larger and near-transparent, as a
  // watermark behind the whole lab card. Null when the lab hasn't set one.
  const labLogo = lab?.decoration?.logo || null;

  const userName = user?.name ?? "ব্যবহারকারী";

  const greeting = getGreeting();
  const greetingEmoji = greeting === "শুভ সকাল" ? "☀️" : greeting === "শুভ দুপুর" ? "🌤️" : "🌙";

  // Pick the right config by lab.type, then filter to what this user's
  // modules actually grant — same rule the route gate applies, so nothing
  // shown here ever 404s or bounces into the "denied" popup.
  const actions = (isHospital ? HOSPITAL_ACTIONS : DIAGNOSTIC_ACTIONS).filter((a) => hasModuleAccess(user, a.module));
  const navMenu = (isHospital ? HOSPITAL_NAV : DIAGNOSTIC_NAV).filter((n) => hasModuleAccess(user, n.module));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4 py-6 font-noto">
      <div className="relative max-w-3xl mx-auto pt-7 pb-16">
        {/* ══════════════════════════════════════
            LAB CARD
        ══════════════════════════════════════ */}
        <div
          className="mb-4 bg-white border border-gray-100 rounded-3xl shadow-sm relative overflow-hidden"
          style={{ animation: "cardIn 0.5s cubic-bezier(.22,1,.36,1) 0.05s both" }}
        >
          <div
            className="absolute top-0 right-0 w-48 h-48 opacity-10 pointer-events-none"
            style={{ background: "radial-gradient(circle at top right, #818cf8, transparent 70%)" }}
          />

          {/* Logo watermark — large, near-transparent, centered behind the
              whole card. pointer-events-none so it never intercepts
              clicks/taps on anything above it. */}
          {labLogo && (
            <div
              className="absolute inset-0 flex items-center justify-center opacity-[0.08] pointer-events-none [&>svg]:w-[22rem] [&>svg]:h-[22rem] [&>svg]:max-w-none"
              dangerouslySetInnerHTML={{ __html: labLogo }}
            />
          )}

          <div className="p-6 relative z-10">
            {/* ── Top: greeting chip + Lab ID + status, all in one row ── */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xl">{greetingEmoji}</span>
              <span className="text-sm font-bold text-indigo-500 tracking-widest font-noto">{greeting}</span>
              <span className="flex items-center gap-1.5 bg-indigo-50/70 border border-indigo-100 rounded-lg px-2 py-1">
                <Activity className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="text-xs font-bold text-gray-700 tabular-nums font-noto min-w-[92px] inline-block text-center shrink-0 whitespace-nowrap">
                  {clock}
                </span>
              </span>

              <span className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1">
                <span className="text-[10px] text-indigo-400 font-bold tracking-widest font-noto">Lab ID</span>
                <span className="text-sm font-black text-indigo-700 font-noto">{labId}</span>
              </span>

              {isLabActive ? (
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-600 font-noto">Active</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 border border-rose-100 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  <span className="text-[10px] font-bold text-rose-600 font-noto">Inactive</span>
                </span>
              )}
            </div>

            {/* ── Lab name + logo + contact ── */}
            <div className="mt-4 mb-4 pl-0.5">
              <div className="flex items-center gap-3">
                {labLogo && (
                  <div
                    className="w-11 h-11 shrink-0 [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: labLogo }}
                  />
                )}
                <p className="text-3xl font-black text-gray-800 leading-snug font-noto">{labName}</p>
              </div>
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-gray-300" />
                  <span className="text-[11px] text-gray-400 font-noto">{labAddress}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-gray-300" />
                  <span className="text-[11px] text-gray-400 font-noto">{labPhone}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-gray-300" />
                  <span className="text-[11px] text-gray-400 font-noto">{labEmail}</span>
                </div>
              </div>
            </div>

            {/* ── Stats strip ── */}
            <div className="pt-4 border-t border-gray-50">
              <p className="text-xs text-gray-400 tracking-wide font-semibold font-noto">লগইন করেছেন</p>
              <p className="text-sm font-bold text-gray-700 mt-0.5 font-noto">{userName}</p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════
            QUICK ACCESS
        ══════════════════════════════════════ */}
        <div
          className="flex items-center gap-3 mb-3"
          style={{ animation: "cardIn 0.5s cubic-bezier(.22,1,.36,1) 0.15s both" }}
        >
          <p className="text-[10.5px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap font-noto">
            দ্রুত অ্যাক্সেস
          </p>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {actions.map((action, idx) => (
            <Card key={action.to} {...action} idx={idx} />
          ))}
        </div>

        {/* ══════════════════════════════════════
            NAVIGATE
        ══════════════════════════════════════ */}
        <div
          className="flex items-center gap-3 mt-6 mb-3"
          style={{ animation: "cardIn 0.5s cubic-bezier(.22,1,.36,1) 0.35s both" }}
        >
          <p className="text-[10.5px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap font-noto">
            নেভিগেট
          </p>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {navMenu.map(({ to, icon: Icon, label, color, bg }, idx) => (
            <Link
              key={to}
              to={to}
              className="group flex flex-col items-center gap-2 bg-white border border-gray-100 rounded-2xl py-4 px-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
              style={{ animation: `cardIn 0.45s cubic-bezier(.22,1,.36,1) ${350 + idx * 40}ms both` }}
            >
              <div
                className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}
              >
                <Icon className={`w-[18px] h-[18px] ${color}`} strokeWidth={2} />
              </div>
              <span className="text-[10.5px] font-semibold text-gray-600 text-center leading-tight font-noto">
                {label}
              </span>
            </Link>
          ))}
        </div>

        {/* ── Footer ── */}
        <p className="text-center text-[11px] text-gray-300 font-medium mt-10 font-noto">
          LabPilot · {isHospital ? "হাসপাতাল ম্যানেজমেন্ট সিস্টেম" : "ডায়াগনস্টিক ল্যাব ম্যানেজমেন্ট সিস্টেম"}
        </p>
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default Home;
