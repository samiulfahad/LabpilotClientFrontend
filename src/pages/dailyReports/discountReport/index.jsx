/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 */
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Printer,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Tag,
  Clock,
  UserCheck,
  BedDouble,
  Scale,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import TimeFrame from "../../../components/timeFrame";
import ReportSeal from "../../../components/ReportSeal";
import discountService from "../../../api/dailyReports/discountReport";
import Popup from "../../../components/popup";
import { useAuthStore } from "../../../store/authStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "0");
const fmtDt = (ms) => new Date(ms).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

const buildHeadingLabel = (start, end) => {
  if (!start || !end) return "";
  const s = new Date(start);
  const e = new Date(end);
  const day = (d) => {
    const n = d.getDate();
    const sfx =
      n % 10 === 1 && n % 100 !== 11
        ? "st"
        : n % 10 === 2 && n % 100 !== 12
          ? "nd"
          : n % 10 === 3 && n % 100 !== 13
            ? "rd"
            : "th";
    return `${n}${sfx}`;
  };
  const monthYear = (d) => `${d.toLocaleString("en-US", { month: "long" })}, ${d.getFullYear()}`;
  const sameDay = s.toDateString() === e.toDateString();
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameDay) return `${day(s)} ${monthYear(s)}`;
  if (sameMonth) return `${s.getDate()} – ${e.getDate()} ${monthYear(s)}`;
  return `${s.toLocaleString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
};

const todayRange = () => {
  const now = new Date();
  return { start: new Date(now).setHours(0, 0, 0, 0), end: new Date(now).setHours(23, 59, 59, 999) };
};

const generatedStamp = (date) =>
  new Date(date ?? Date.now())
    .toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();

const isFullMonthRange = (start, end) => {
  if (!start || !end) return false;
  const s = new Date(start);
  const e = new Date(end);
  const firstDay = new Date(s.getFullYear(), s.getMonth(), 1, 0, 0, 0, 0).getTime();
  const lastDay = new Date(e.getFullYear(), e.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  return (
    s.getTime() === firstDay &&
    e.getTime() === lastDay &&
    s.getMonth() === e.getMonth() &&
    s.getFullYear() === e.getFullYear()
  );
};

const recordStamp = (start, end) => {
  if (!start || !end) return generatedStamp();

  if (isFullMonthRange(start, end)) {
    return new Date(start).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  }

  const s = new Date(start);
  const e = new Date(end);

  if (s.toDateString() === e.toDateString()) {
    return generatedStamp(end);
  }

  const fmtShort = (d) => d.toLocaleDateString("en-US", { day: "2-digit", month: "short" }).toUpperCase();
  const sameYear = s.getFullYear() === e.getFullYear();

  return sameYear
    ? `${fmtShort(s)} – ${fmtShort(e)}, ${e.getFullYear()}`
    : `${fmtShort(s)} ${s.getFullYear()} – ${fmtShort(e)} ${e.getFullYear()}`;
};

// Merge an invoices[] (opd) list and a patients[] (ipd) list into a single
// chronological entry list for a staff member's discount panel. Carries
// referrerName forward so each line can show who the discount was for.
const mergeEntries = (invoices = [], patients = []) => {
  const opd = invoices.map((inv) => ({
    key: `opd-${inv.invoiceId}-${inv.at}`,
    label: inv.patient,
    ref: inv.invoiceId,
    amount: inv.amount,
    at: inv.at,
    source: "opd",
    referrerName: inv.referrerName,
  }));
  const ipd = patients.map((p) => ({
    key: `ipd-${p.admissionId}-${p.at}`,
    label: p.patient,
    ref: p.admissionId,
    amount: p.amount,
    at: p.at,
    source: "ipd",
    category: p.category,
    providedBy: p.providedBy,
  }));
  return [...opd, ...ipd].sort((a, b) => a.at - b.at);
};

const mapLabAdjustmentEntries = (invoices = []) =>
  invoices
    .map((inv) => ({
      key: `la-${inv.invoiceId}-${inv.at}`,
      label: inv.patient,
      ref: inv.invoiceId,
      amount: inv.amount,
      at: inv.at,
      source: "opd",
    }))
    .sort((a, b) => a.at - b.at);

// Referrer-wise entries carry staffName forward instead of referrerName.
const mapReferrerEntries = (invoices = []) =>
  invoices
    .map((inv) => ({
      key: `ref-${inv.invoiceId}-${inv.at}`,
      label: inv.patient,
      ref: inv.invoiceId,
      amount: inv.amount,
      at: inv.at,
      source: "opd",
      staffName: inv.staffName,
    }))
    .sort((a, b) => a.at - b.at);

// ── Error helpers ─────────────────────────────────────────────────────────────

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";

const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};

const isNetworkError = (error) => error?.isAxiosError === true && !error.response;

const CATEGORY_LABELS = {
  test: "টেস্ট",
  medicine: "মেডিসিন",
  "bed-charge": "বেড চার্জ",
  product: "প্রোডাক্ট",
  other: "অন্যান্য",
  "grand-total": "সর্বমোট",
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAL = "#0F6E5C";
const INK = "#1C1F1E";
const SEAL_BLUE = "#1E4FA0";
const SEAL_RED = "#C0312B";
const AMBER = "#B8752B";

const EMPTY_DATA = {
  staff: [],
  referrers: [],
  totals: { totalDiscount: 0, opdDiscount: 0, ipdDiscount: 0, labAdjustment: 0 },
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonManifest = () => (
  <div className="bg-white border border-[#E3E0D6] rounded-lg overflow-hidden animate-pulse">
    <div className="h-[3px] bg-[#E3E0D6]" />
    <div className="px-6 sm:px-8 pt-6 pb-5 border-b border-[#E3E0D6] space-y-2">
      <div className="h-2.5 w-28 bg-[#ECE9DF] rounded-sm" />
      <div className="h-6 w-48 bg-[#ECE9DF] rounded-sm" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-[#ECE9DF] rounded-lg" />
        ))}
      </div>
    </div>
    {[0, 1].map((i) => (
      <div key={i} className="px-6 sm:px-8 py-5 border-b border-[#E3E0D6] last:border-b-0 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[#ECE9DF]" />
          <div className="h-3 w-32 bg-[#ECE9DF] rounded-sm" />
          <div className="h-3 w-16 bg-[#ECE9DF] rounded-sm ml-auto" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Small primitives ─────────────────────────────────────────────────────────

const EmptyRow = ({ label }) => (
  <div className="flex items-center gap-2 py-10 justify-center text-[#A8ACA3]">
    <AlertCircle className="w-3.5 h-3.5" />
    <p className="font-['IBM_Plex_Mono'] text-xs font-noto">{label}</p>
  </div>
);

const SummaryStat = ({ icon: Icon, label, value, accent }) => (
  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#FAF9F5] border border-[#E3E0D6] min-w-0">
    <div
      className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
      style={{ backgroundColor: `${accent}14`, color: accent }}
    >
      <Icon className="w-3.5 h-3.5" />
    </div>
    <div className="flex flex-col min-w-0">
      <span className="font-['IBM_Plex_Mono'] text-[9px] uppercase text-[#A8ACA3] font-noto tracking-wide truncate">
        {label}
      </span>
      <span className="font-['IBM_Plex_Mono'] text-sm font-semibold tabular-nums truncate" style={{ color: INK }}>
        {value}
      </span>
    </div>
  </div>
);

const SourcePill = ({ label, value, isIpd }) => (
  <span
    className="inline-flex items-center gap-1 px-2 py-1 rounded-sm font-['IBM_Plex_Mono'] text-xs font-noto"
    style={{
      backgroundColor: isIpd ? `${SEAL_BLUE}0D` : `${TEAL}0D`,
      color: isIpd ? SEAL_BLUE : TEAL,
    }}
  >
    {isIpd && <BedDouble className="w-2.5 h-2.5" />}
    {label} ৳{fmt(value)}
  </span>
);

// entry.referrerName (staff view) and entry.staffName (referrer view) are
// mutually exclusive in practice — each view only populates the one it doesn't
// already group by — so both can render unconditionally without clutter.
const DiscountRow = ({ entry, idx }) => {
  const isIpd = entry.source === "ipd";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-dotted border-[#E3E0D6] last:border-b-0">
      <span className="font-['IBM_Plex_Mono'] text-xs text-[#C7C4B8] tabular-nums w-5 shrink-0">
        {String(idx + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#1C1F1E] font-medium truncate font-noto flex items-center gap-1.5">
          {entry.label}
          {isIpd && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-sm shrink-0"
              style={{ backgroundColor: "#1E4FA00D", color: SEAL_BLUE }}
            >
              <BedDouble className="w-2.5 h-2.5" />
              <span className="font-['IBM_Plex_Mono'] text-[9px] uppercase tracking-wide">IPD</span>
            </span>
          )}
        </p>
        <p className="font-['IBM_Plex_Mono'] text-xs text-[#A8ACA3] mt-0.5 flex items-center gap-1 flex-wrap">
          <Clock className="w-2.5 h-2.5" />
          {fmtDt(entry.at)} · {fmtTime(entry.at)} · {entry.ref}
          {isIpd && entry.category && (
            <span className="text-[#8A8F89]">
              · {CATEGORY_LABELS[entry.category] ?? entry.category}
              {entry.providedBy &&
                ` (${entry.providedBy === "hospital" ? "হাসপাতাল" : entry.providedBy === "doctor" ? "ডাক্তার" : "রেফারার"})`}
            </span>
          )}
          {entry.referrerName && <span className="text-[#8A8F89]">· রেফারার: {entry.referrerName}</span>}
          {entry.staffName && <span className="text-[#8A8F89]">· স্টাফ: {entry.staffName}</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-right">
        <span className="font-['IBM_Plex_Mono'] text-sm font-semibold tabular-nums" style={{ color: TEAL }}>
          ৳{fmt(entry.amount)}
        </span>
      </div>
    </div>
  );
};

// ─── Ledger entries ─────────────────────────────────────────────────────────────

const MetricCell = ({ icon: Icon, value, unit, accent, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-end gap-1.5 -my-1 py-1.5 px-1.5 rounded-sm transition-colors font-noto ${
      active ? "bg-[#1C1F1E]/[0.05]" : "hover:bg-[#1C1F1E]/[0.03]"
    }`}
  >
    <Icon className="w-3 h-3 shrink-0" style={{ color: active ? accent : "#A8ACA3" }} />
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-['IBM_Plex_Mono'] text-sm font-semibold tabular-nums" style={{ color: accent ?? INK }}>
        {value}
      </span>
      <span className="text-xs text-[#8A8F89] font-noto">{unit}</span>
    </span>
    {active ? (
      <ChevronUp className="w-3 h-3 text-[#A8ACA3] shrink-0" />
    ) : (
      <ChevronDown className="w-3 h-3 text-[#A8ACA3] shrink-0" />
    )}
  </button>
);

const StaffEntry = ({ member: m, rank, isHospital }) => {
  const [openPanel, setOpenPanel] = useState(null);
  const discountEntries = mergeEntries(m.invoices, m.patients);
  const labAdjustmentEntries = mapLabAdjustmentEntries(m.labAdjustmentInvoices);
  const togglePanel = (panel) => setOpenPanel((p) => (p === panel ? null : panel));

  const activeEntries = openPanel === "discount" ? discountEntries : labAdjustmentEntries;
  const emptyLabel = openPanel === "discount" ? "ডিসকাউন্ট" : "অ্যাডজাস্টমেন্ট";

  return (
    <div className="py-2 first:pt-0">
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-['IBM_Plex_Mono'] text-xs text-[#A8ACA3] tabular-nums w-5 shrink-0">
            {String(rank).padStart(2, "0")}
          </span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm text-[#1C1F1E] font-medium truncate font-noto">{m.name}</span>
            <UserCheck className="w-3 h-3 text-[#A8ACA3] shrink-0" />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-8 sm:ml-0">
          <MetricCell
            icon={Tag}
            value={`৳${fmt(m.totalDiscount)}`}
            unit="ডিসকাউন্ট"
            accent={TEAL}
            active={openPanel === "discount"}
            onClick={() => togglePanel("discount")}
          />
          <MetricCell
            icon={Scale}
            value={`৳${fmt(m.labAdjustment)}`}
            unit="অ্যাডজাস্টমেন্ট"
            accent={AMBER}
            active={openPanel === "labAdjustment"}
            onClick={() => togglePanel("labAdjustment")}
          />
        </div>
      </div>

      {openPanel && (
        <div className="pl-9 pr-1 mt-2">
          {openPanel === "discount" && isHospital && (
            <div className="flex items-center gap-2 mb-2">
              <SourcePill label="OPD" value={m.opdDiscount} />
              <SourcePill label="IPD" value={m.ipdDiscount} isIpd />
            </div>
          )}
          {activeEntries.length === 0 ? (
            <p className="font-['IBM_Plex_Mono'] text-xs text-[#A8ACA3] py-2 font-noto">
              এই সময়সীমায় কোনো {emptyLabel} নেই
            </p>
          ) : (
            activeEntries.map((entry, i) => <DiscountRow key={entry.key} entry={entry} idx={i} />)
          )}
        </div>
      )}
    </div>
  );
};

const ReferrerEntry = ({ referrer: r, rank }) => {
  const [open, setOpen] = useState(false);
  const entries = mapReferrerEntries(r.invoices);

  return (
    <div className="py-2 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-['IBM_Plex_Mono'] text-xs text-[#A8ACA3] tabular-nums w-5 shrink-0">
            {String(rank).padStart(2, "0")}
          </span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm text-[#1C1F1E] font-medium truncate font-noto">{r.name}</span>
            <Users className="w-3 h-3 text-[#A8ACA3] shrink-0" />
          </div>
        </div>
        <MetricCell
          icon={Tag}
          value={`৳${fmt(r.totalDiscount)}`}
          unit="ডিসকাউন্ট"
          accent={TEAL}
          active={open}
          onClick={() => setOpen((p) => !p)}
        />
      </div>

      {open && (
        <div className="pl-9 pr-1 mt-2">
          {entries.length === 0 ? (
            <p className="font-['IBM_Plex_Mono'] text-xs text-[#A8ACA3] py-2 font-noto">
              এই সময়সীমায় কোনো ডিসকাউন্ট নেই
            </p>
          ) : (
            entries.map((entry, i) => <DiscountRow key={entry.key} entry={entry} idx={i} />)
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const DiscountReport = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const lab = useAuthStore((state) => state.lab);
  const isHospital = user?.type === "hospital";

  const isAdmin = user?.role === "admin";
  const hasAccess = isAdmin || user?.permissions?.discountReport === true;
  if (!hasAccess) {
    return <Popup type="denied" message="ডিসকাউন্ট রিপোর্ট দেখার অনুমতি আপনার নেই।" onClose={() => navigate("/")} />;
  }

  const isStaff = user?.role === "staff";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false);
  const [timeRange, setTimeRange] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [viewMode, setViewMode] = useState("staff"); // "staff" | "referrer"

  useEffect(() => {
    const range = todayRange();
    setTimeRange(range);
    fetchData(range);
  }, []);

  const fetchData = async (range) => {
    try {
      setLoading(true);
      const res = await discountService.getSummary({ startDate: range.start, endDate: range.end });
      setData(res.data);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
        return;
      }
      const isPermissionDenied = err?.response?.status === 403;
      if (isPermissionDenied) setPermissionDenied(true);
      setPopup({
        type: isPermissionDenied ? "denied" : "error",
        message: getErrorMessage(err, "ডিসকাউন্টের তথ্য লোড করা সম্ভব হয়নি। আবার চেষ্টা করুন।"),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFetchData = (start, end) => {
    const range = { start, end };
    setTimeRange(range);
    fetchData(range);
  };

  const d = data ?? EMPTY_DATA;
  const headingLabel = buildHeadingLabel(timeRange?.start, timeRange?.end);
  const list = viewMode === "staff" ? d.staff : d.referrers;

  return (
    <section className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4 py-6 font-noto">
      {popup && (
        <Popup
          type={popup.type}
          message={popup.message}
          onClose={() => {
            setPopup(null);
            if (permissionDenied) navigate("/lab-management");
          }}
        />
      )}
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { visibility: hidden; }
          #transactions-printable, #transactions-printable * { visibility: visible; }
          #transactions-printable { position: fixed; top: 0; left: 0; width: 100%; padding: 32px; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5 no-print">
          <div>
            <h1 className="font-['IBM_Plex_Sans'] text-2xl sm:text-3xl font-semibold text-[#1C1F1E] font-noto">
              ডিসকাউন্ট রিপোর্ট
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              disabled={loading}
              className="px-3 py-2 rounded-sm border border-[#1C1F1E]/15 text-[#1C1F1E] hover:bg-[#1C1F1E] hover:text-white transition-colors flex items-center gap-1.5 font-['IBM_Plex_Mono'] text-xs uppercase disabled:opacity-40 disabled:cursor-not-allowed font-noto"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <Link
              to="/daily-reports"
              className="px-3 py-2 rounded-sm border border-[#1C1F1E]/15 text-[#1C1F1E] hover:bg-[#1C1F1E] hover:text-white transition-colors flex items-center gap-1.5 font-['IBM_Plex_Mono'] text-xs uppercase font-noto"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Link>
          </div>
        </div>

        <div className="mb-5 no-print">
          <TimeFrame onFetchData={handleFetchData} />
        </div>

        {loading ? (
          <SkeletonManifest />
        ) : (
          <div
            id="transactions-printable"
            className="bg-white border border-[#E3E0D6] rounded-lg shadow-[0_1px_2px_rgba(28,31,30,0.04)] overflow-hidden"
          >
            <div className="px-6 sm:px-8 pt-5 pb-4 text-center border-b border-[#E3E0D6] bg-[#FAF9F5]">
              <h3 className="font-['IBM_Plex_Sans'] text-lg font-bold text-[#1C1F1E] tracking-wide font-noto">
                {lab?.name ?? "LabPilot Pro"}
              </h3>
              {lab?.contact?.address && (
                <p className="font-['IBM_Plex_Mono'] text-xs text-[#6F756F] mt-1 font-noto">{lab.contact.address}</p>
              )}
              {lab?.contact?.primary && (
                <p className="font-['IBM_Plex_Mono'] text-xs text-[#6F756F] mt-1 font-noto">{lab.contact.primary}</p>
              )}
            </div>

            <div className="px-6 sm:px-8 pt-6 pb-5 border-b border-[#E3E0D6] flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-['IBM_Plex_Mono'] text-xs uppercase text-[#0F6E5C] mb-1.5 font-noto">
                  ডিসকাউন্ট রিপোর্ট
                </p>
                <h2 className="font-['IBM_Plex_Sans'] text-2xl font-semibold text-[#1C1F1E] font-noto">
                  {headingLabel}
                </h2>

                {!isStaff && (
                  <div className={`grid gap-2 mt-3 ${isHospital ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
                    <SummaryStat
                      icon={Tag}
                      label="মোট ডিসকাউন্ট"
                      value={`৳${fmt(d.totals.totalDiscount)}`}
                      accent={TEAL}
                    />
                    {isHospital && (
                      <>
                        <SummaryStat
                          icon={UserCheck}
                          label="OPD ডিসকাউন্ট"
                          value={`৳${fmt(d.totals.opdDiscount)}`}
                          accent={TEAL}
                        />
                        <SummaryStat
                          icon={BedDouble}
                          label="IPD ডিসকাউন্ট"
                          value={`৳${fmt(d.totals.ipdDiscount)}`}
                          accent={SEAL_BLUE}
                        />
                      </>
                    )}
                    <SummaryStat
                      icon={Scale}
                      label="ল্যাব অ্যাডজাস্টমেন্ট"
                      value={`৳${fmt(d.totals.labAdjustment)}`}
                      accent={AMBER}
                    />
                  </div>
                )}
              </div>

              <ReportSeal dateLabel={recordStamp(timeRange?.start, timeRange?.end)} reportName="Discount Report" />
            </div>

            <div className="px-6 sm:px-8 pt-4 border-b border-[#E3E0D6] no-print">
              <div className="flex items-center gap-1 pb-4">
                <button
                  onClick={() => setViewMode("staff")}
                  className={`px-3 py-1.5 rounded-sm font-['IBM_Plex_Mono'] text-xs uppercase transition-colors font-noto ${
                    viewMode === "staff"
                      ? "bg-[#1C1F1E] text-white"
                      : "bg-[#FAF9F5] border border-[#E3E0D6] text-[#6F756F]"
                  }`}
                >
                  স্টাফ অনুযায়ী
                </button>
                <button
                  onClick={() => setViewMode("referrer")}
                  className={`px-3 py-1.5 rounded-sm font-['IBM_Plex_Mono'] text-xs uppercase transition-colors font-noto ${
                    viewMode === "referrer"
                      ? "bg-[#1C1F1E] text-white"
                      : "bg-[#FAF9F5] border border-[#E3E0D6] text-[#6F756F]"
                  }`}
                >
                  রেফারার অনুযায়ী
                </button>
              </div>
            </div>

            <div className="px-6 sm:px-8 py-5">
              {list.length > 0 ? (
                <div className="divide-y divide-[#EFEDE5]">
                  {viewMode === "staff"
                    ? d.staff.map((member, i) => (
                        <StaffEntry key={member.staffId} member={member} rank={i + 1} isHospital={isHospital} />
                      ))
                    : d.referrers.map((r, i) => <ReferrerEntry key={r.referrerId} referrer={r} rank={i + 1} />)}
                </div>
              ) : (
                <EmptyRow label="এই সময়সীমায় কোনো ডিসকাউন্ট রেকর্ড হয়নি" />
              )}
            </div>
          </div>
        )}

        <p className="font-['IBM_Plex_Mono'] text-center text-xs text-[#A8ACA3] mt-4 pb-6 no-print font-noto">
          শুধুমাত্র সক্রিয় (ডিলিট না হওয়া) তথ্য অন্তর্ভুক্ত করা হয়েছে
        </p>
      </div>
    </section>
  );
};

export default DiscountReport;
