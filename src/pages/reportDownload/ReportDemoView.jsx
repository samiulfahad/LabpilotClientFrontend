import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Eye, X } from "lucide-react";
import ReportViewer from "./ReportViewer";
import testConfigService from "../../api/testConfig";
import { useAuthStore } from "../../store/authStore";
import Popup from "../../components/popup";

// ── Axios‑native network error detection (same as all other pages) ──────────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// ── Hardcoded placeholder patient — this overlay never has a real invoice
// or admission behind it (it's a preview of a report FORMAT, not a real
// patient's result), so patient info is fixed here instead of fetched. ─────
const HARDCODED_PATIENT = {
  name: "জেইন ডো",
  age: "34 years",
  gender: "Female",
  contact: "01700-000000",
  referredBy: "Dr. John Smith",
  sampleDate: "01 Jan 2026",
  reportDate: "02 Jan 2026",
};

// ─── Portal hook (mirrors ReportDownload.jsx) ─────────────────────────────
function useBodyPortal() {
  const [el, setEl] = useState(null);

  useEffect(() => {
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

// ─── Main Component ───────────────────────────────────────────────────────
// Rendered as a local overlay (same pattern as FormatRangesModal) — NOT a
// routed page. Deliberate: navigating to a separate route would unmount the
// parent (TestConfigPage), which refetches its full test/category list on
// remount. Taking schemaId/testName/onClose as props instead keeps the
// parent mounted, so opening/closing this is instant and nothing reloads.
//
// View-only: renders through ReportViewer, which itself has no upload/edit
// affordances (only Classic/Smart toggle, Share, Print, Download PDF) — so
// this overlay inherently supports view/print/download and nothing else.
export default function ReportDemoView({ schemaId, testName = "Demo Report", onClose }) {
  const storeLab = useAuthStore((s) => s.lab);
  const labInfo = buildLabInfo(storeLab);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false);
  const [closing, setClosing] = useState(false);

  const portalEl = useBodyPortal();

  useEffect(() => {
    if (!schemaId) {
      setPopup({ type: "error", message: "Missing schema information." });
      setLoading(false);
      return;
    }

    testConfigService
      .getDemoReportBySchemaId(schemaId)
      .then(({ data }) => {
        // The demo doc's real, printable sections live nested under
        // `report` (mirroring tests[].report on a real invoice) —
        // everything else at the top level (schemaId, patient age, etc.)
        // is metadata and must NOT be rendered as a report section.
        const reportBody = data?.report;
        if (!reportBody || typeof reportBody !== "object") {
          setPopup({ type: "error", message: "এই ফরম্যাটের ডেমো রিপোর্ট সঠিকভাবে সংরক্ষিত নেই।" });
          return;
        }
        setReport(reportBody);
      })
      .catch((err) => {
        if (isNetworkError(err)) {
          setOfflinePopup(true);
        } else if (err?.response?.status === 404) {
          setPopup({ type: "error", message: "এই ফরম্যাটের জন্য কোনো ডেমো রিপোর্ট সংরক্ষিত নেই।" });
        } else {
          setPopup({ type: "error", message: "রিপোর্ট লোড করা যায়নি।" });
        }
      })
      .finally(() => setLoading(false));
  }, [schemaId]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 250);
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!portalEl) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes dr-slide-in  { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes dr-slide-out { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        @keyframes dr-spin { to { transform: rotate(360deg); } }

        .dr-drawer-body-scroll::-webkit-scrollbar { width: 4px; }
        .dr-drawer-body-scroll::-webkit-scrollbar-track { background: transparent; }
        .dr-drawer-body-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
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
        className={`absolute inset-0 bg-[#f7f8fa] flex flex-col overflow-hidden ${closing ? "animate-[dr-slide-out_0.25s_cubic-bezier(0.32,0,0.67,0)_forwards]" : "animate-[dr-slide-in_0.3s_cubic-bezier(0.32,0.72,0,1)_forwards]"}`}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 py-4 px-5 bg-gradient-to-br from-slate-100 via-blue-100 to-indigo-100 border-b border-slate-200 shrink-0 shadow-sm">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border bg-emerald-100 border-emerald-200">
            <Eye className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-noto text-sm font-bold text-slate-900 tracking-tight leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
              Demo Preview — {testName}
            </h2>
            <p className="font-mono text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">
              Sample data · not a real patient record
            </p>
          </div>

          <div className="hidden min-[400px]:flex items-center gap-[5px] px-2.5 py-1 rounded-full font-mono text-[9px] font-semibold tracking-[0.06em] uppercase shrink-0 whitespace-nowrap border bg-amber-100 border-amber-200 text-amber-700">
            <Eye className="w-[10px] h-[10px]" />
            Demo
          </div>

          <button
            className="w-9 h-9 rounded-lg bg-white/70 border border-slate-200 flex items-center justify-center text-slate-500 transition-colors shrink-0 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
            onClick={handleClose}
            title="Close (Esc)"
            aria-label="Close preview"
          >
            <X className="w-[17px] h-[17px]" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="dr-drawer-body-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#f7f8fa]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-[80px] px-6 gap-3">
              <div className="w-7 h-7 rounded-full border-[2.5px] border-black/10 border-t-[#60a5fa] animate-[dr-spin_0.7s_linear_infinite]" />
              <span className="font-['JetBrains_Mono',_monospace] text-[11px] text-[#64748b] uppercase tracking-[0.07em]">
                Loading report…
              </span>
            </div>
          )}
          {!loading && report && (
            <div className="py-5 px-4">
              <ReportViewer
                report={report}
                patient={HARDCODED_PATIENT}
                reportName={testName}
                printType="PAD"
                invoiceId={null}
                isIndoor={false}
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
