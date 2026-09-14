import { Link } from "react-router-dom";
import {
  FlaskConical,
  Package,
  Users,
  UserCheck,
  BedDouble,
  Stethoscope,
  Lock,
  Settings2,
  FileText,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";

const CARDS = [
  {
    title: "ল্যাব টেস্ট",
    subtitle: "মূল্য ও কমিশন ব্যবস্থাপনা",
    icon: FlaskConical,
    link: "/manage-tests",
    color: "blue",
    permission: "manageTests",
  },
  {
    title: "টেস্ট কনফিগারেশন",
    subtitle: "ফরম্যাট ও নমুনা সংগ্রহ কক্ষ",
    icon: FileText,
    link: "/manage-testConfig",
    color: "teal",
    permission: "manageTestConfig",
  },
  {
    title: "ঔষধ,পণ্য, সেবা",
    subtitle: "ইনভেন্টরি ও স্টক",
    icon: Package,
    link: "/manage-products",
    color: "amber",
    permission: "manageProducts",
  },
  {
    title: "স্টাফ অ্যাকাউন্ট",
    subtitle: "স্টাফদের তথ্য",
    icon: Users,
    link: "/manage-staffs",
    color: "emerald",
    permission: "manageStaffs",
  },
  {
    title: "রোগী প্রেরণকারী মিডিয়া",
    subtitle: "মিডিয়া তালিকা ও কমিশন",
    icon: UserCheck,
    link: "/manage-referrers",
    color: "purple",
    permission: "manageReferrers",
  },
  {
    title: "ইনডোর রোগীর ভর্তির স্থান",
    subtitle: "ওয়ার্ড, কেবিন, আইসিইউ ব্যবস্থাপনা",
    icon: BedDouble,
    link: "/manage-spaces",
    color: "sky",
    hospitalOnly: true,
    permission: "manageAdmissionSpace",
  },
  {
    title: "কর্তব্যরত চিকিৎসক",
    subtitle: "ডাক্তারদের তথ্য ও ডিউটি",
    icon: Stethoscope,
    link: "/manage-doctors",
    color: "rose",
    badge: "নিয়োগকৃত",
    permission: "manageDoctors",
  },
];

// Refined, self-contained per-category token set — one entry per card color.
const colorMap = {
  blue: {
    bar: "from-blue-500 to-blue-600",
    iconBox: "bg-blue-50 border-blue-100",
    icon: "text-blue-600",
    label: "group-hover:text-blue-900",
    desc: "group-hover:text-blue-500",
    ring: "group-hover:ring-blue-100",
    focusRing: "focus-visible:ring-blue-400",
    rail: "bg-blue-400",
  },
  teal: {
    bar: "from-teal-500 to-teal-600",
    iconBox: "bg-teal-50 border-teal-100",
    icon: "text-teal-600",
    label: "group-hover:text-teal-900",
    desc: "group-hover:text-teal-500",
    ring: "group-hover:ring-teal-100",
    focusRing: "focus-visible:ring-teal-400",
    rail: "bg-teal-400",
  },
  amber: {
    bar: "from-amber-500 to-amber-600",
    iconBox: "bg-amber-50 border-amber-100",
    icon: "text-amber-600",
    label: "group-hover:text-amber-900",
    desc: "group-hover:text-amber-500",
    ring: "group-hover:ring-amber-100",
    focusRing: "focus-visible:ring-amber-400",
    rail: "bg-amber-400",
  },
  emerald: {
    bar: "from-emerald-500 to-emerald-600",
    iconBox: "bg-emerald-50 border-emerald-100",
    icon: "text-emerald-600",
    label: "group-hover:text-emerald-900",
    desc: "group-hover:text-emerald-500",
    ring: "group-hover:ring-emerald-100",
    focusRing: "focus-visible:ring-emerald-400",
    rail: "bg-emerald-400",
  },
  purple: {
    bar: "from-purple-500 to-purple-600",
    iconBox: "bg-purple-50 border-purple-100",
    icon: "text-purple-600",
    label: "group-hover:text-purple-900",
    desc: "group-hover:text-purple-500",
    ring: "group-hover:ring-purple-100",
    focusRing: "focus-visible:ring-purple-400",
    rail: "bg-purple-400",
  },
  sky: {
    bar: "from-sky-500 to-sky-600",
    iconBox: "bg-sky-50 border-sky-100",
    icon: "text-sky-600",
    label: "group-hover:text-sky-900",
    desc: "group-hover:text-sky-500",
    ring: "group-hover:ring-sky-100",
    focusRing: "focus-visible:ring-sky-400",
    rail: "bg-sky-400",
  },
  rose: {
    bar: "from-rose-500 to-rose-600",
    iconBox: "bg-rose-50 border-rose-100",
    icon: "text-rose-600",
    label: "group-hover:text-rose-900",
    desc: "group-hover:text-rose-500",
    ring: "group-hover:ring-rose-100",
    focusRing: "focus-visible:ring-rose-400",
    rail: "bg-rose-400",
  },
};

const Setup = () => {
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.user?.role);
  const permissions = useAuthStore((state) => state.user?.permissions);
  const isAdmin = role === "admin";
  const isHospital = user?.type === "hospital";

  const visibleCards = CARDS.filter((item) => !item.hospitalOnly || isHospital);

  const hasAccess = (item) => {
    if (isAdmin) return true;
    if (!item.permission) return true;
    return !!permissions?.[item.permission];
  };

  const unlockedCount = visibleCards.filter(hasAccess).length;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,#eef2ff_0%,#f8fafc_45%,#f8fafc_100%)] px-4 py-8 font-noto">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
            <Settings2 className="w-5 h-5 text-white" strokeWidth={2.25} />
            <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
          </div>
          <div>
            <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-tight">ল্যাব ম্যানেজমেন্ট</h1>
            <p className="text-[13.5px] text-slate-400 mt-0.5">
              {unlockedCount}/{visibleCards.length} মডিউলে প্রবেশাধিকার আছে
            </p>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {visibleCards.map((item, idx) => {
            const Icon = item.icon;
            const c = colorMap[item.color] || {};
            const allowed = hasAccess(item);

            const cardInner = (
              <>
                {/* Persistent category rail — brightens on hover, communicates grouping at a glance */}
                <div
                  className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${
                    allowed ? c.bar : "from-slate-200 to-slate-200"
                  } opacity-40 group-hover:opacity-100 transition-opacity duration-300`}
                />

                <div className="relative">
                  <div
                    className={`w-12 h-12 rounded-[14px] border flex items-center justify-center transition-all duration-200 ${
                      allowed ? c.iconBox : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    <Icon
                      size={20}
                      className={`transition-colors duration-200 ${allowed ? c.icon : "text-slate-300"}`}
                      strokeWidth={2}
                    />
                  </div>
                  {!allowed && (
                    <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                      <Lock className="w-3 h-3 text-slate-400" strokeWidth={2.5} />
                    </div>
                  )}
                </div>

                <div className="text-center space-y-1.5">
                  <p
                    className={`text-[15.5px] font-bold tracking-tight transition-colors duration-200 leading-snug ${
                      allowed ? `text-slate-700 ${c.label}` : "text-slate-400"
                    }`}
                  >
                    {item.title}
                  </p>
                  <p
                    className={`text-[13px] transition-colors duration-200 leading-snug ${
                      allowed ? `text-slate-400 ${c.desc}` : "text-slate-300"
                    }`}
                  >
                    {allowed ? item.subtitle : "অনুমতি প্রয়োজন"}
                  </p>
                  {item.badge && allowed && (
                    <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 border border-rose-200">
                      {item.badge}
                    </span>
                  )}
                </div>
              </>
            );

            const baseClass =
              "group relative flex flex-col items-center gap-3 p-5 rounded-2xl border bg-white transition-all duration-200 overflow-hidden outline-none focus:outline-none hover:outline-none focus-visible:outline-none active:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 animate-[cardIn_0.4s_cubic-bezier(.22,1,.36,1)_both]";

            if (!allowed) {
              return (
                <div
                  key={item.link}
                  title="প্রবেশাধিকার নেই"
                  style={{ animationDelay: `${idx * 40}ms` }}
                  className={`${baseClass} border-slate-100 hover:border-slate-100 cursor-not-allowed select-none opacity-70 saturate-0`}
                >
                  {cardInner}
                </div>
              );
            }

            return (
              <Link
                key={item.link}
                to={item.link}
                style={{ animationDelay: `${idx * 40}ms`, outline: "none" }}
                className={`${baseClass} border-slate-200 hover:border-slate-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-200/60 ring-1 ring-transparent ${c.ring} ${c.focusRing}`}
              >
                {cardInner}
              </Link>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-\\[cardIn"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default Setup;
