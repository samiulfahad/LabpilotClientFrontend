import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, Printer, X } from "lucide-react";
import ReportViewer from "./ReportViewer";
import reportService from "../../api/report";
import { useAuthStore } from "../../store/authStore";
import Popup from "../../components/popup";

// ─── Error helpers (mirrors ManageReferrer.jsx / CashMemo.jsx / DeleteInvoices.jsx) ──

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";

const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};

// ── Axios‑native network error detection (same as all other pages) ──────────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// Age is now { years, months, days } (any part may be absent, defaults to
// 0). ReportViewer / ReportPDFDocument only ever render patient.age as an
// already-formatted string, so the conversion happens once, here, at the
// source. Kept spelled-out to match the format used in Report.jsx /
// SchemaRenderer.jsx's PatientBanner.
const formatAge = (age) => {
  if (!age || typeof age !== "object") return "";
  const { years = 0, months = 0, days = 0 } = age;
  if (!years && !months && !days) return "";
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  return parts.join(", ");
};

// ─── Portal hook ──────────────────────────────────────────────────────────────
function useBodyPortal() {
  const [el, setEl] = useState(null);

  useEffect(() => {
    ["ur-styles-v2", "ur-styles-v3", "ur-styles-v4"].forEach((id) => {
      document.getElementById(id)?.remove();
    });

    const div = document.createElement("div");
    div.className = "fixed inset-0 w-full h-full z-[99999] overflow-hidden h-[100dvh]";
    document.body.appendChild(div);
    setEl(div);

    const savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.removeChild(div);
      document.body.style.overflow = savedOverflow;
    };
  }, []);

  return el;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

function buildLabInfo(storeLab) {
  if (!storeLab) return null;
  return {
    name: storeLab.name ?? "Lab",
    tagline: storeLab.tagline ?? "",
    address: storeLab.contact?.address ?? "",
    email: storeLab.contact?.publicEmail ?? "",
    phone: storeLab.contact?.primary ?? "",
    regNo: storeLab.registrationNumber ? String(storeLab.registrationNumber) : "",
    padHeight: storeLab.medicalReport?.padHeight ?? 0,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportDownload() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  // ═══════════ Frontend permission check ═══════════
  const hasAccess = isAdmin || user?.permissions?.testReportDownload === true;
  if (!hasAccess) {
    return (
      <Popup
        type="denied"
        message="টেস্ট রিপোর্ট ডাউনলোড / প্রিন্ট করার অনুমতি আপনার নেই।"
        onClose={() => navigate("/")}
      />
    );
  }
  // ═════════════════════════════════════════════════════════════════════

  const location = useLocation();
  const storeLab = useAuthStore((s) => s.lab);
  const labInfo = buildLabInfo(storeLab);

  // ── Params (now sourced from router state, mirrors ReportUpload) ───────────
  const {
    invoiceId = null,
    patientId = null,
    testId = null,
    testName = "Report",
    printType = "PLAIN",
    type = "outdoor",
    addedAt = null,
  } = location.state ?? {};

  const isIndoor = type === "indoor";
  const isPad = printType === "PAD";

  const [report, setReport] = useState(null);
  const [patient, setPatient] = useState(null);
  const [displayId, setDisplayId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false);
  const [closing, setClosing] = useState(false);

  const portalEl = useBodyPortal();

  useEffect(() => {
    const hasIds = isIndoor ? patientId && testId : invoiceId && testId;
    if (!hasIds) {
      setPopup({ type: "error", message: "Missing patient or test information." });
      setLoading(false);
      return;
    }

    const fetch = isIndoor
      ? reportService.getIndoorReport(patientId, testId, addedAt)
      : reportService.getReport(invoiceId, testId);

    fetch
      .then(({ data }) => {
        setDisplayId(isIndoor ? data.admissionId : data.invoiceId);
        setReport(data.report);
        setPatient({
          name: data.patient?.name ?? "",
          age: formatAge(data.patient?.age),
          gender: data.patient?.gender ?? "",
          contact: data.patient?.contactNumber ?? "",
          referredBy: data.referrer?.name ?? "",
          sampleDate: formatDate(data.report?.sampleCollectionDate),
          reportDate: formatDate(data.report?.reportDate),
        });
      })
      .catch((err) => {
        if (isNetworkError(err)) {
          setOfflinePopup(true);
        } else {
          setPopup({ type: "error", message: getErrorMessage(err, "Failed to load report.") });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Explicitly re-navigate to /report with the id in state (same pattern
  // as ReportUpload's handleClose/goBack) instead of navigate(-1) — a
  // plain history pop restores whatever state the /report entry
  // originally had (often none, e.g. arriving via a plain link), leaving
  // the search bar empty. This guarantees /report's location.key-based
  // refetch fires with the right id.
  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      if (isIndoor && displayId) {
        navigate("/report", { state: { admissionId: displayId } });
      } else if (!isIndoor && (displayId || invoiceId)) {
        navigate("/report", { state: { invoiceId: displayId ?? invoiceId } });
      } else if (window.history.length > 1) {
        navigate(-1);
      } else {
        window.close();
      }
    }, 250);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!portalEl) return null;

  const headerSubtitle = displayId
    ? `${isIndoor ? "Admission" : "Invoice"} #${displayId}`
    : isIndoor
      ? "Indoor Patient"
      : "Report Details";

  return createPortal(
    <>
      <style>{`
        @keyframes ur-slide-in  { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes ur-slide-out { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        @keyframes ur-spin { to { transform: rotate(360deg); } }

        .ur-drawer-body-scroll::-webkit-scrollbar { width: 4px; }
        .ur-drawer-body-scroll::-webkit-scrollbar-track { background: transparent; }
        .ur-drawer-body-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>

      {popup && (
        <Popup
          type={popup.type}
          message={popup.message}
          onClose={() => {
            setPopup(null);
            handleClose();
          }}
        />
      )}

      {offlinePopup && (
        <Popup
          type="offline"
          onClose={() => {
            setOfflinePopup(false);
            handleClose();
          }}
        />
      )}

      <div
        className={`absolute inset-0 bg-[#f7f8fa] flex flex-col overflow-hidden ${closing ? "animate-[ur-slide-out_0.25s_cubic-bezier(0.32,0,0.67,0)_forwards]" : "animate-[ur-slide-in_0.3s_cubic-bezier(0.32,0.72,0,1)_forwards]"}`}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 py-4 px-5 bg-gradient-to-br from-slate-100 via-blue-100 to-indigo-100 border-b border-slate-200 shrink-0 shadow-sm">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border bg-emerald-100 border-emerald-200">
            <Eye className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-noto text-sm font-bold text-slate-900 tracking-tight leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
              View — {testName}
            </h2>
            <p className="font-mono text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">
              {headerSubtitle}
            </p>
          </div>

          <div
            className={`hidden min-[400px]:flex items-center gap-[5px] px-2.5 py-1 rounded-full font-mono text-[9px] font-semibold tracking-[0.06em] uppercase shrink-0 whitespace-nowrap border ${
              isPad ? "bg-violet-100 border-violet-200 text-violet-700" : "bg-blue-100 border-blue-200 text-blue-700"
            }`}
          >
            <Printer className="w-[10px] h-[10px]" />
            {isPad ? "Pad" : "Plain A4"}
          </div>

          <button
            className="w-9 h-9 rounded-lg bg-white/70 border border-slate-200 flex items-center justify-center text-slate-500 transition-colors shrink-0 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
            onClick={handleClose}
            title="Close (Esc)"
            aria-label="Close report"
          >
            <X className="w-[17px] h-[17px]" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="ur-drawer-body-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#f7f8fa]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-[80px] px-6 gap-3">
              <div className="w-7 h-7 rounded-full border-[2.5px] border-black/10 border-t-[#60a5fa] animate-[ur-spin_0.7s_linear_infinite]" />
              <span className="font-['JetBrains_Mono',_monospace] text-[11px] text-[#64748b] uppercase tracking-[0.07em]">
                Loading report…
              </span>
            </div>
          )}
          {!loading && report && (
            <div className="py-5 px-4">
              <ReportViewer
                report={report}
                patient={patient}
                reportName={testName}
                printType={printType}
                invoiceId={displayId}
                isIndoor={isIndoor}
                {...(labInfo && { labInfo })}
              />
            </div>
          )}
        </div>
      </div>
    </>,
    portalEl,
  );
}
