import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  FlaskConical,
  MapPin,
  Mail,
  Phone,
  User,
  Calendar,
  Stethoscope,
  Hash,
  ClipboardList,
  TrendingDown,
  TrendingUp,
  Share2,
  Printer,
  Download,
  ChevronDown,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Tag,
} from "lucide-react";
import { ReportPDFDocument } from "./ReportPDF";

// Fallback pad height (mm) used when a lab hasn't set medicalReport.padHeight
// — roughly matches the old hardcoded 1.5in spacer.
const DEFAULT_PAD_HEIGHT_MM = 38;

const LAB_INFO = {
  name: "MediScan Diagnostics",
  tagline: "Precision Medicine · Trusted Results",
  address: "House 12, Road 5, Dhanmondi, Dhaka-1205, Bangladesh",
  email: "reports@mediscan.com.bd",
  phone: "+880 1711-000000",
  regNo: "DGDA/LAB/2024/0042",
  padHeight: DEFAULT_PAD_HEIGHT_MM,
};

const EMPTY_PATIENT = {
  name: "",
  age: "",
  gender: "",
  contact: "",
  referredBy: "",
  sampleDate: "",
  reportDate: "",
};

const REPORT_META_KEYS = new Set(["_id", "name", "reportDate", "sampleCollectionDate"]);

function parseRange(ref) {
  if (!ref) return null;
  const m = ref.match(/^([\d.]+)\s*[–\-]\s*([\d.]+)$/);
  if (!m) return null;
  return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
}

function fmt(num) {
  return num
    .toFixed(3)
    .replace(/\.?0+$/, "")
    .replace(/^0\./, ".");
}
function fmtLow(num) {
  return num.toFixed(3).replace(/\.?0+$/, "");
}

// A number field's status comes from whichever the schema produced:
// - referenceTag (current) — the label of the standard-range tier the value
//   matched (e.g. "High", "Reactive", "Trace"). The status bucket comes
//   from the label text itself; there's no ratio to compute since a tier
//   isn't a single min/max span.
// - referenceRange (legacy) — a plain "min–max" string from reports saved
//   before the tier-based Ranges system. Falls back to the old ratio-based
//   Higher/Lower(Nx) labeling.
function statusFromTag(tag) {
  const label = (tag || "").toLowerCase();
  if (/low/.test(label)) return "low";
  if (/high/.test(label)) return "high";
  if (/normal|unremarkable|negative/.test(label)) return "normal";
  return "tag";
}

function getStatusInfo(field) {
  if (!field) return null;
  if (field.referenceTag) {
    return { status: statusFromTag(field.referenceTag), label: field.referenceTag };
  }
  const n = parseFloat(field.value);
  if (isNaN(n) || !field.referenceRange) return null;
  const r = parseRange(field.referenceRange);
  if (!r) return null;
  if (n > r.max) return { status: "high", label: `Higher (${fmt(n / r.max)}x)` };
  if (n < r.min) {
    if (r.min === 0) return { status: "low", label: "Low" };
    return { status: "low", label: `Lower (${fmtLow(n / r.min)}x)` };
  }
  return { status: "normal", label: "Normal" };
}

function getStatus(field) {
  const info = getStatusInfo(field);
  return info ? info.status : null;
}

function isResultField(field) {
  if (!field || typeof field !== "object") return false;
  return Boolean(field.referenceRange) || Boolean(field.referenceTag) || Boolean(field.unit);
}

function getSectionEntries(sectionData) {
  return Object.entries(sectionData).filter(([key]) => key !== "__showTitle");
}

// Escapes free-text (staticStandardRange is admin-entered prose) before it's
// interpolated into the raw HTML string used for the print path.
function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function StatusPill({ field }) {
  const info = getStatusInfo(field);
  if (!info) return <span className="text-xs text-black">—</span>;
  const cfg = {
    normal: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    low: { cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: TrendingDown },
    high: { cls: "bg-red-50 text-red-700 border-red-200", Icon: TrendingUp },
    tag: { cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: Tag },
  }[info.status];
  if (!cfg) return <span className="text-xs text-black">—</span>;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 border whitespace-nowrap ${cfg.cls}`}
    >
      <cfg.Icon className="w-2.5 h-2.5 flex-shrink-0" />
      {info.label}
    </span>
  );
}

const ROW_STYLE = {
  high: { row: "bg-red-50/40", value: "text-red-700" },
  low: { row: "bg-amber-50/40", value: "text-amber-800" },
  normal: { row: "", value: "text-black" },
  tag: { row: "bg-violet-50/40", value: "text-violet-700" },
};

function ResultRow({ name, field, hasUnits, hasRefInfo }) {
  const value = String(field.value ?? "");
  const unit = field.unit || "";
  // A tier-tagged field has no stored numeric range text (only the matched
  // tier's label, in referenceTag) — the Ref. Range column stays dashed for
  // those; the tag's label carries the classification in Status instead.
  const ref = field.referenceRange || "";
  const info = hasRefInfo ? getStatusInfo(field) : null;
  const style = info ? (ROW_STYLE[info.status] ?? {}) : {};
  return (
    <tr className={style.row ?? ""}>
      <td className="pl-4 pr-3 py-2.5 text-sm font-semibold text-black border-b border-slate-100">{name}</td>
      <td
        className={`px-3 py-2.5 text-sm font-bold tabular-nums border-b border-slate-100 ${style.value ?? "text-black"}`}
      >
        {value}
      </td>
      {hasUnits && (
        <td className="px-3 py-2.5 text-[10px] font-bold text-black uppercase border-b border-slate-100">
          {unit || <span className="text-black">—</span>}
        </td>
      )}
      {hasRefInfo && (
        <>
          <td className="px-3 py-2.5 text-xs font-semibold text-black border-b border-slate-100 tabular-nums font-mono">
            {ref || <span className="text-black">—</span>}
          </td>
          <td className="px-3 pr-4 py-2.5 border-b border-slate-100">
            <StatusPill field={field} />
          </td>
        </>
      )}
    </tr>
  );
}

// Row for a non-result field type (radio/select/checkbox/textarea/input)
// rendered inside a section's Parameter/Result/Unit/Ref-Range/Status table
// (i.e. the section also has at least one result-style field). The field's
// value goes in the Result column; Unit/Ref-Range/Status are dashed out
// since those concepts don't apply to this field type.
function PlainValueRow({ name, field, hasUnits, hasRefInfo }) {
  const val = Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "");
  return (
    <tr>
      <td className="pl-4 pr-3 py-2.5 text-sm font-semibold text-black border-b border-slate-100">{name}</td>
      <td className="px-3 py-2.5 text-sm font-bold text-black border-b border-slate-100">
        {val || <span className="text-black">—</span>}
      </td>
      {hasUnits && (
        <td className="px-3 py-2.5 text-[10px] font-bold text-black uppercase border-b border-slate-100">
          <span className="text-black">—</span>
        </td>
      )}
      {hasRefInfo && (
        <>
          <td className="px-3 py-2.5 text-xs font-semibold text-black border-b border-slate-100 tabular-nums font-mono">
            <span className="text-black">—</span>
          </td>
          <td className="px-3 pr-4 py-2.5 border-b border-slate-100">
            <span className="text-xs text-black">—</span>
          </td>
        </>
      )}
    </tr>
  );
}

function PlainRow({ name, field, colSpan }) {
  const val = Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "—");
  return (
    <tr className="odd:bg-white even:bg-slate-50/50">
      <td className="pl-4 pr-3 py-2.5 text-sm font-semibold text-black border-b border-slate-100">{name}</td>
      <td className="px-3 pr-4 py-2.5 text-sm font-bold text-black border-b border-slate-100" colSpan={colSpan}>
        {val || "—"}
      </td>
    </tr>
  );
}

function Section({ sectionName, sectionData, showHeader }) {
  const [collapsed, setCollapsed] = useState(false);
  const entries = getSectionEntries(sectionData);
  const resultEntries = entries.filter(([, v]) => isResultField(v));
  const plainEntries = entries.filter(([, v]) => !isResultField(v));
  const hasResultTable = resultEntries.length > 0;
  const hasUnits = resultEntries.some(([, v]) => Boolean(v.unit));
  // A section shows the Ref./Status columns if any result field carries
  // either a legacy referenceRange or a current referenceTag.
  const hasRefInfo = resultEntries.some(([, v]) => Boolean(v.referenceRange) || Boolean(v.referenceTag));

  const paramW = hasRefInfo ? "w-[34%]" : hasUnits ? "w-[45%]" : "w-[60%]";
  const resultW = hasRefInfo ? "w-[16%]" : hasUnits ? "w-[25%]" : "w-[40%]";
  const unitW = hasRefInfo ? "w-[12%]" : "w-[30%]";
  const colSpan = 1 + (hasUnits ? 1 : 0) + (hasRefInfo ? 2 : 0);

  // When the section has at least one result-style field (a number field
  // with a unit/reference range/tag), every field in the section —
  // including radio/select/checkbox/textarea/plain-text ones — renders as a
  // row in that same Parameter/Result/Unit/Ref-Range/Status table, with "—"
  // filled into the columns a non-result field doesn't have. Only when no
  // field in the section is result-style does the section fall back to the
  // plain two-column table.
  const tableBody = hasResultTable ? (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-200">
          <th
            className={`pl-4 pr-3 py-2 text-left text-[10px] font-bold text-black uppercase tracking-wider ${paramW}`}
          >
            Parameter
          </th>
          <th className={`px-3 py-2 text-left text-[10px] font-bold text-black uppercase tracking-wider ${resultW}`}>
            Result
          </th>
          {hasUnits && (
            <th className={`px-3 py-2 text-left text-[10px] font-bold text-black uppercase tracking-wider ${unitW}`}>
              Unit
            </th>
          )}
          {hasRefInfo && (
            <>
              <th className="px-3 py-2 text-left text-[10px] font-bold text-black uppercase tracking-wider w-[24%]">
                Ref. Range
              </th>
              <th className="px-3 pr-4 py-2 text-left text-[10px] font-bold text-black uppercase tracking-wider w-[18%]">
                Status
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {entries.map(([n, f]) =>
          isResultField(f) ? (
            <ResultRow key={n} name={n} field={f} hasUnits={hasUnits} hasRefInfo={hasRefInfo} />
          ) : (
            <PlainValueRow key={n} name={n} field={f} hasUnits={hasUnits} hasRefInfo={hasRefInfo} />
          ),
        )}
      </tbody>
    </table>
  ) : (
    plainEntries.length > 0 && (
      <table className="w-full border-collapse">
        <tbody>
          {plainEntries.map(([n, f]) => (
            <PlainRow key={n} name={n} field={f} colSpan={colSpan} />
          ))}
        </tbody>
      </table>
    )
  );

  if (!showHeader) {
    return <div className="overflow-hidden border border-slate-200 mb-2">{tableBody}</div>;
  }

  return (
    <div className="overflow-hidden border border-slate-200 mb-2">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-slate-700 hover:bg-slate-600 transition-colors"
      >
        <span className="text-sm font-semibold text-white tracking-wide">{sectionName}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-300 font-medium">
            {entries.length} param{entries.length !== 1 ? "s" : ""}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-300 transition-transform flex-shrink-0 ${collapsed ? "" : "rotate-180"}`}
          />
        </div>
      </button>
      {!collapsed && <div>{tableBody}</div>}
    </div>
  );
}

function SummaryStrip({ sections }) {
  let normal = 0,
    low = 0,
    high = 0;
  sections.forEach(([, sec]) => {
    getSectionEntries(sec).forEach(([, field]) => {
      if (!isResultField(field)) return;
      const s = getStatus(field);
      if (s === "normal") normal++;
      else if (s === "low") low++;
      else if (s === "high") high++;
    });
  });
  const total = normal + low + high;
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-1 text-xs">
      <ClipboardList className="w-3 h-3 text-black mr-1 flex-shrink-0" />
      <span className="text-black font-semibold">{total} parameters:</span>
      <span className="font-bold text-emerald-600 ml-1">{normal} Normal</span>
      {low > 0 && (
        <>
          <span className="text-black mx-0.5">·</span>
          <span className="font-bold text-amber-600">{low} Low</span>
        </>
      )}
      {high > 0 && (
        <>
          <span className="text-black mx-0.5">·</span>
          <span className="font-bold text-red-600">{high} High</span>
        </>
      )}
    </div>
  );
}

function PatientGrid({ patient }) {
  const allFields = [
    { label: "Patient Name", value: patient.name, Icon: User },
    { label: "Age / Gender", value: [patient.age, patient.gender].filter(Boolean).join(" · "), Icon: Hash },
    { label: "Contact", value: patient.contact, Icon: Phone },
    ...(patient.sampleDate ? [{ label: "Sample Date", value: patient.sampleDate, Icon: Calendar }] : []),
    ...(patient.reportDate ? [{ label: "Report Date", value: patient.reportDate, Icon: Calendar }] : []),
  ];
  const colCount = allFields.length;
  const Cell = ({ label, value, Icon }) => (
    <div className="bg-white px-3 py-2.5">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-2.5 h-2.5 text-black flex-shrink-0" />
        <p className="text-[9px] font-bold text-black uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-xs font-bold text-black truncate">{value || "—"}</p>
    </div>
  );
  return (
    <div className="border-b border-slate-200">
      <div
        className="grid gap-px bg-slate-200 border-b border-slate-200"
        style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
      >
        {allFields.map((f) => (
          <Cell key={f.label} {...f} />
        ))}
      </div>
      <div className="bg-white px-3 py-2 flex items-center gap-3">
        <Stethoscope className="w-2.5 h-2.5 text-black flex-shrink-0" />
        <span className="text-[9px] font-bold text-black uppercase tracking-widest">Referred By</span>
        <span className="text-xs font-bold text-black">{patient.referredBy || "—"}</span>
      </div>
    </div>
  );
}

// ── Print HTML builder ────────────────────────────────────────────────────────
function buildPrintHTML({
  reportName,
  shortId,
  patient,
  labInfo,
  sections,
  printType,
  isIndoor = false,
  staticStandardRange = null,
}) {
  const isPad = printType === "PAD";
  const padHeightMm = labInfo.padHeight > 0 ? labInfo.padHeight : DEFAULT_PAD_HEIGHT_MM;

  const pillColor = (s) => ({ normal: "#166534", low: "#92400e", high: "#991b1b", tag: "#6d28d9" })[s] || "#000000";
  const pillBg = (s) => ({ normal: "#f0fdf4", low: "#fffbeb", high: "#fef2f2", tag: "#f5f3ff" })[s] || "white";
  const pillBdr = (s) => ({ normal: "#bbf7d0", low: "#fde68a", high: "#fecaca", tag: "#ddd6fe" })[s] || "#e2e8f0";
  const rowBg = (s) => ({ normal: "white", low: "#fffdf5", high: "#fff8f8", tag: "#faf5ff" })[s] || "white";
  const valColor = (s) => ({ normal: "#000000", low: "#92400e", high: "#991b1b", tag: "#6d28d9" })[s] || "#000000";

  const renderSection = (sectionName, sectionData) => {
    const showHeader = sectionData.__showTitle !== false;
    const entries = getSectionEntries(sectionData);
    const resultEntries = entries.filter(([, v]) => isResultField(v));
    const plainEntries = entries.filter(([, v]) => !isResultField(v));
    const hasResultTable = resultEntries.length > 0;
    const hasUnits = resultEntries.some(([, v]) => Boolean(v.unit));
    const hasRefInfo = resultEntries.some(([, v]) => Boolean(v.referenceRange) || Boolean(v.referenceTag));

    const paramW = hasRefInfo ? "33%" : hasUnits ? "40%" : "58%";
    const resultW = hasRefInfo ? "15%" : hasUnits ? "30%" : "42%";
    const unitW = hasRefInfo ? "11%" : "30%";
    const colSpan = 1 + (hasUnits ? 1 : 0) + (hasRefInfo ? 2 : 0);

    const unitHeader = hasUnits
      ? `<th style="padding:5px 10px;text-align:left;font-size:8.5px;font-weight:700;color:#000000;text-transform:uppercase;letter-spacing:.05em;width:${unitW};">Unit</th>`
      : "";

    const rangeHeaders = hasRefInfo
      ? `<th style="padding:5px 10px;text-align:left;font-size:8.5px;font-weight:700;color:#000000;text-transform:uppercase;letter-spacing:.05em;width:23%;">Ref. Range</th>
         <th style="padding:5px 10px;text-align:left;font-size:8.5px;font-weight:700;color:#000000;text-transform:uppercase;letter-spacing:.05em;width:18%;">Status</th>`
      : "";

    // When the section has at least one result-style field, ALL fields —
    // including radio/select/checkbox/textarea/plain-text ones — render as
    // rows in this same table, with "—" filling the Unit/Ref-Range/Status
    // columns for non-result fields. Only when no field is result-style
    // does the section fall back to the plain two-column table below.
    const combinedRows = entries
      .map(([name, field]) => {
        if (isResultField(field)) {
          // Tier-tagged fields have no stored numeric range text (only the
          // matched tier's label, in referenceTag) — Ref. Range stays
          // dashed for those; the tag's label carries the classification
          // in Status instead.
          const ref = field.referenceRange || "";
          const info = hasRefInfo ? getStatusInfo(field) : null;
          const st = info ? info.status : null;
          const rangeCells = hasRefInfo
            ? `<td style="padding:6px 10px;font-size:10.5px;color:#000000;font-weight:600;border-bottom:1px solid #f1f5f9;font-family:monospace;">${ref || "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:8.5px;font-weight:700;padding:2px 7px;background:${pillBg(st)};color:${pillColor(st)};border:1px solid ${pillBdr(st)};">${info ? info.label : "—"}</span>
        </td>`
            : "";
          return `<tr style="background:${rowBg(st)};">
        <td style="padding:6px 10px;font-size:11.5px;font-weight:600;color:#000000;border-bottom:1px solid #f1f5f9;">${name}</td>
        <td style="padding:6px 10px;font-size:11.5px;font-weight:700;color:${valColor(st)};border-bottom:1px solid #f1f5f9;font-family:monospace;">${field.value}</td>
        ${hasUnits ? `<td style="padding:6px 10px;font-size:9px;font-weight:700;color:#000000;text-transform:uppercase;border-bottom:1px solid #f1f5f9;">${field.unit || "—"}</td>` : ""}
        ${rangeCells}
      </tr>`;
        }
        const val = Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "—");
        const dash = `<td style="padding:6px 10px;font-size:10px;color:#000000;font-weight:600;border-bottom:1px solid #f1f5f9;">—</td>`;
        return `<tr>
        <td style="padding:6px 10px;font-size:11.5px;font-weight:600;color:#000000;border-bottom:1px solid #f1f5f9;">${name}</td>
        <td style="padding:6px 10px;font-size:11.5px;font-weight:700;color:#000000;border-bottom:1px solid #f1f5f9;">${val || "—"}</td>
        ${hasUnits ? dash : ""}
        ${hasRefInfo ? `${dash}<td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;"><span style="font-size:8.5px;font-weight:700;padding:2px 7px;color:#000000;">—</span></td>` : ""}
      </tr>`;
      })
      .join("");

    const plainRows = plainEntries
      .map(([name, field]) => {
        const val = Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "—");
        return `<tr><td style="padding:6px 10px;font-size:11px;font-weight:600;color:#000000;border-bottom:1px solid #f1f5f9;">${name}</td><td style="padding:6px 10px;font-size:11px;font-weight:700;color:#000000;border-bottom:1px solid #f1f5f9;" colspan="${colSpan}">${val || "—"}</td></tr>`;
      })
      .join("");

    const headerHTML = showHeader
      ? `<div style="background:#334155;padding:7px 12px;display:flex;align-items:center;justify-content:space-between;">
           <span style="color:white;font-size:11.5px;font-weight:700;letter-spacing:0.01em;">${sectionName}</span>
           <span style="color:rgba(255,255,255,0.6);font-size:8px;text-transform:uppercase;letter-spacing:0.05em;">${entries.length} parameter${entries.length !== 1 ? "s" : ""}</span>
         </div>`
      : "";

    const resultTable = hasResultTable
      ? `<table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
            <th style="padding:5px 10px;text-align:left;font-size:8.5px;font-weight:700;color:#000000;text-transform:uppercase;letter-spacing:.05em;width:${paramW};">Parameter</th>
            <th style="padding:5px 10px;text-align:left;font-size:8.5px;font-weight:700;color:#000000;text-transform:uppercase;letter-spacing:.05em;width:${resultW};">Result</th>
            ${unitHeader}
            ${rangeHeaders}
          </tr></thead>
          <tbody>${combinedRows}</tbody>
        </table>`
      : "";

    const plainTable =
      !hasResultTable && plainEntries.length > 0
        ? `<table style="width:100%;border-collapse:collapse;"><tbody>${plainRows}</tbody></table>`
        : "";

    return `<div style="border:1px solid #e2e8f0;margin-bottom:10px;page-break-inside:avoid;">${headerHTML}${resultTable}${plainTable}</div>`;
  };

  const mainFields = [
    { label: "Patient Name", value: patient.name },
    { label: "Age / Gender", value: [patient.age, patient.gender].filter(Boolean).join(" · ") },
    { label: "Contact", value: patient.contact },
    ...(patient.sampleDate ? [{ label: "Sample Date", value: patient.sampleDate }] : []),
    ...(patient.reportDate ? [{ label: "Report Date", value: patient.reportDate }] : []),
  ];
  const colPct = Math.floor(100 / mainFields.length);
  const mainCells = mainFields
    .map(
      ({ label, value }) =>
        `<td style="padding:8px 12px;background:white;vertical-align:top;border-right:1px solid #e2e8f0;width:${colPct}%;">
       <div style="font-size:7.5px;font-weight:700;color:#000000;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px;">${label}</div>
       <div style="font-size:11px;font-weight:700;color:#000000;">${value || "—"}</div>
     </td>`,
    )
    .join("");

  let normal = 0,
    low = 0,
    high = 0;
  sections.forEach(([, sec]) => {
    getSectionEntries(sec).forEach(([, field]) => {
      if (!isResultField(field)) return;
      const s = getStatus(field);
      if (s === "normal") normal++;
      else if (s === "low") low++;
      else if (s === "high") high++;
    });
  });
  const total = normal + low + high;

  const topBlock = isPad
    ? `<div style="height:${padHeightMm}mm;"></div>`
    : `<table style="width:100%;border-collapse:collapse;border-bottom:2px solid #000000;margin-bottom:0;">
         <tr>
           <td style="padding:14px 16px;vertical-align:top;">
             <div style="font-size:17px;font-weight:800;color:#000000;letter-spacing:-0.02em;">${labInfo.name}</div>
             ${labInfo.tagline ? `<div style="font-size:9px;color:#000000;font-weight:600;margin-top:3px;letter-spacing:0.04em;text-transform:uppercase;">${labInfo.tagline}</div>` : ""}
             <div style="font-size:9px;color:#000000;font-weight:600;margin-top:5px;">${labInfo.address}</div>
           </td>
           <td style="padding:14px 16px;vertical-align:top;text-align:right;">
             <div style="font-size:9px;color:#000000;font-weight:700;">${labInfo.phone}</div>
             ${labInfo.email ? `<div style="font-size:9px;color:#000000;font-weight:600;margin-top:2px;">${labInfo.email}</div>` : ""}
             ${labInfo.regNo ? `<div style="font-size:8px;color:#000000;font-weight:600;margin-top:4px;font-family:monospace;">Reg: ${labInfo.regNo}</div>` : ""}
           </td>
         </tr>
       </table>`;

  const footerBlock = isPad
    ? ""
    : `<div class="print-footer">
         <table style="width:100%;"><tr>
           <td style="width:45%;padding-right:20px;"><div style="height:28px;border-bottom:1px solid #94a3b8;"></div><div style="font-size:8px;color:#000000;font-weight:600;margin-top:3px;">Pathologist Signature &amp; Seal</div></td>
           <td style="width:10%;"></td>
           <td style="width:45%;padding-left:20px;"><div style="height:28px;border-bottom:1px solid #94a3b8;"></div><div style="font-size:8px;color:#000000;font-weight:600;margin-top:3px;text-align:right;">Authorized Signatory</div></td>
         </tr></table>
         <div style="font-size:8px;color:#000000;font-weight:600;text-align:center;margin-top:10px;">For qualified medical professionals only. Interpret results in full clinical context. · ${labInfo.name} · ${labInfo.phone}</div>
       </div>`;

  const rangeSidebar = staticStandardRange
    ? `<div style="flex:0 0 200px;border:1px solid #e2e8f0;page-break-inside:avoid;align-self:flex-start;overflow:hidden;">
         <div style="background:#334155;padding:7px 12px;">
           <span style="color:white;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Standard Reference</span>
         </div>
         <div style="background:#f8fafc;padding:10px 12px;">
           <div style="font-size:10px;color:#000000;font-weight:600;line-height:1.5;white-space:pre-wrap;">${escapeHtml(staticStandardRange)}</div>
         </div>
       </div>`
    : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${reportName}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:white; color:#000000; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-size:12px; }
  @page { size:A4; margin:16mm 16mm 22mm 16mm; }
  @media print {
    .print-footer { position:fixed; bottom:0; left:0; right:0; padding:10px 16mm; background:white; border-top:1px solid #e2e8f0; }
    body { padding-bottom:0; }
  }
  @media screen {
    body { padding:20px; max-width:720px; margin:0 auto; }
    .print-footer { margin-top:30px; padding-top:16px; border-top:1px solid #e2e8f0; }
  }
</style>
</head><body>
  ${topBlock}
  <div style="background:#f8fafc;padding:8px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;border-top:1px solid #e2e8f0;margin-bottom:0;">
    <div style="font-size:13px;font-weight:700;color:#000000;">${reportName}</div>
    ${shortId ? `<div style="font-size:8.5px;color:#000000;font-family:monospace;font-weight:700;">${isIndoor ? "Admission" : "Invoice"}: ${shortId}</div>` : ""}
  </div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-top:none;">
    <tr style="border-bottom:1px solid #e2e8f0;">${mainCells}</tr>
    <tr><td colspan="5" style="padding:6px 12px;background:#fafafa;">
      <span style="font-size:7.5px;font-weight:700;color:#000000;text-transform:uppercase;letter-spacing:.07em;margin-right:10px;">Referred By</span>
      <span style="font-size:11px;font-weight:700;color:#000000;">${patient.referredBy || "—"}</span>
    </td></tr>
  </table>
  ${
    total > 0
      ? `<div style="background:#f8fafc;padding:6px 16px;border:1px solid #e2e8f0;border-top:none;font-size:10.5px;display:flex;gap:8px;align-items:center;">
    <span style="color:#000000;font-weight:700;">${total} parameters:</span>
    <span style="font-weight:700;color:#166534;">${normal} Normal</span>
    ${low > 0 ? `<span style="color:#000000;">·</span><span style="font-weight:700;color:#92400e;">${low} Low</span>` : ""}
    ${high > 0 ? `<span style="color:#000000;">·</span><span style="font-weight:700;color:#991b1b;">${high} High</span>` : ""}
  </div>`
      : ""
  }
  <div style="margin-top:14px;display:flex;gap:12px;align-items:flex-start;">
    <div style="flex:1;min-width:0;">
      ${sections.map(([name, data]) => renderSection(name, data)).join("")}
    </div>
    ${rangeSidebar}
  </div>
  ${footerBlock}
</body></html>`;
}

// ── Main Component ────────────────────────────────────────────────────────────
function ReportViewer({
  report,
  patient = null,
  reportName,
  labInfo = LAB_INFO,
  printType = "PLAIN",
  invoiceId = null,
  isIndoor = false,
  staticStandardRange = null,
}) {
  const [dlStatus, setDlStatus] = useState("idle");
  const [shareStatus, setShareStatus] = useState("idle");

  const resolvedPatient = patient ?? EMPTY_PATIENT;
  const isPad = printType === "PAD";
  const resolvedReportName = reportName || report.name || "Lab Report";
  const filename = `${resolvedReportName.replace(/\s+/g, "_")}_report.pdf`;
  const shortId = invoiceId || report.invoiceId || "";

  const sections = Object.entries(report).filter(
    ([key, val]) =>
      !REPORT_META_KEYS.has(key) && val !== null && typeof val === "object" && !Array.isArray(val) && !val.$oid,
  );

  // isPad is now forwarded to ReportPDFDocument (previously only the print
  // path knew about pad mode — Download PDF always rendered the full
  // letterhead/footer even for a Pad-type report).
  const generateBlob = () =>
    pdf(
      <ReportPDFDocument
        report={report}
        reportName={resolvedReportName}
        shortId={shortId}
        patient={resolvedPatient}
        labInfo={labInfo}
        isIndoor={isIndoor}
        staticStandardRange={staticStandardRange}
        isPad={isPad}
      />,
    ).toBlob();

  const handlePrint = () => {
    const html = buildPrintHTML({
      reportName: resolvedReportName,
      shortId,
      patient: resolvedPatient,
      labInfo,
      sections,
      printType,
      isIndoor,
      staticStandardRange,
    });
    const existing = document.getElementById("ur-print-frame");
    if (existing) existing.remove();
    const iframe = document.createElement("iframe");
    iframe.id = "ur-print-frame";
    iframe.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => iframe.remove(), 1000);
    };
  };

  const handleDownload = async () => {
    setDlStatus("loading");
    try {
      const blob = await generateBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDlStatus("done");
    } catch (e) {
      console.error(e);
      setDlStatus("idle");
      alert("PDF generation failed.");
    } finally {
      setTimeout(() => setDlStatus("idle"), 2500);
    }
  };

  const handleShare = async () => {
    setShareStatus("loading");
    try {
      const blob = await generateBlob();
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: resolvedReportName });
        setShareStatus("done");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShareStatus("copied");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error(e);
        setShareStatus("idle");
      } else setShareStatus("idle");
    } finally {
      setTimeout(() => setShareStatus("idle"), 2500);
    }
  };

  const dlIcon =
    dlStatus === "loading" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : dlStatus === "done" ? (
      <Check className="w-3.5 h-3.5" />
    ) : (
      <Download className="w-3.5 h-3.5" />
    );
  const dlLabel = dlStatus === "loading" ? "Generating…" : dlStatus === "done" ? "Downloaded!" : "Download PDF";
  const shIcon =
    shareStatus === "loading" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : shareStatus === "copied" || shareStatus === "done" ? (
      <Check className="w-3.5 h-3.5" />
    ) : (
      <Share2 className="w-3.5 h-3.5" />
    );
  const shLabel =
    shareStatus === "loading"
      ? "Preparing…"
      : shareStatus === "done"
        ? "Shared!"
        : shareStatus === "copied"
          ? "Saved!"
          : "Share";

  return (
    <div className={`mx-auto font-sans ${staticStandardRange ? "max-w-4xl" : "max-w-2xl"}`}>
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 mb-3">
        <button
          onClick={handleShare}
          disabled={shareStatus === "loading"}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-black bg-white border border-slate-200 hover:border-slate-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {shIcon} {shLabel}
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-black bg-white border border-slate-200 hover:border-slate-400 transition-all"
        >
          <Printer className="w-3.5 h-3.5" />
          {isPad ? "Print (Pad)" : "Print (Plain A4)"}
        </button>
        <button
          onClick={handleDownload}
          disabled={dlStatus === "loading"}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {dlIcon} {dlLabel}
        </button>
      </div>

      <div className={`flex items-start gap-4 ${staticStandardRange ? "flex-col lg:flex-row" : ""}`}>
        {/* Report column */}
        <div className="flex-1 min-w-0 w-full">
          {/* Report card */}
          <div className="bg-white border border-slate-200 overflow-hidden">
            {/* Lab header */}
            {!isPad && (
              <div className="px-5 py-4 flex items-start justify-between gap-4 border-b-2 border-slate-800 bg-white">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FlaskConical className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-black tracking-tight">{labInfo.name}</p>
                    {labInfo.tagline && (
                      <p className="text-[10px] font-semibold text-black mt-0.5 uppercase tracking-widest">
                        {labInfo.tagline}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      <MapPin className="w-2.5 h-2.5 text-black flex-shrink-0" />
                      <p className="text-[10px] font-semibold text-black">{labInfo.address}</p>
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <Phone className="w-2.5 h-2.5 text-black" />
                    <p className="text-[10px] font-semibold text-black">{labInfo.phone}</p>
                  </div>
                  {labInfo.email && (
                    <div className="flex items-center justify-end gap-1">
                      <Mail className="w-2.5 h-2.5 text-black" />
                      <p className="text-[10px] font-semibold text-black">{labInfo.email}</p>
                    </div>
                  )}
                  {labInfo.regNo && (
                    <p className="text-[9px] font-mono font-semibold text-black">Reg: {labInfo.regNo}</p>
                  )}
                </div>
              </div>
            )}

            {/* Report title bar */}
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-black flex-shrink-0" />
                <h2 className="text-sm font-bold text-black">{resolvedReportName}</h2>
              </div>
              {shortId && (
                <p className="text-[10px] text-black font-mono font-semibold">
                  {isIndoor ? "Admission" : "Invoice"}: {shortId}
                </p>
              )}
            </div>

            <PatientGrid patient={resolvedPatient} />

            {/* Summary strip */}
            <div className="px-5 py-2 border-b border-slate-200 bg-slate-50">
              <SummaryStrip sections={sections} />
            </div>

            {/* Sections */}
            <div className="px-5 pt-4 pb-4">
              {sections.map(([sectionName, sectionData]) => (
                <Section
                  key={sectionName}
                  sectionName={sectionName}
                  sectionData={sectionData}
                  showHeader={sectionData.__showTitle !== false}
                />
              ))}
            </div>
          </div>

          {/* Footer signatures */}
          {!isPad && (
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="grid grid-cols-2 gap-8 mb-5">
                <div>
                  <div className="h-10 border-b border-dashed border-slate-300" />
                  <p className="text-[10px] font-semibold text-black mt-1.5">Pathologist Signature &amp; Seal</p>
                </div>
                <div>
                  <div className="h-10 border-b border-dashed border-slate-300" />
                  <p className="text-[10px] font-semibold text-black mt-1.5 text-right">Authorized Signatory</p>
                </div>
              </div>
              <p className="text-[10px] font-semibold text-black text-center leading-relaxed">
                For qualified medical professionals only. Interpret results in full clinical context.
                <span className="mx-1.5">·</span>
                {labInfo.name}
                <span className="mx-1.5">·</span>
                {labInfo.phone}
              </p>
            </div>
          )}
        </div>

        {/* Static standard range sidebar */}
        {staticStandardRange && (
          <aside className="w-full lg:w-64 shrink-0 border border-slate-200 overflow-hidden lg:sticky lg:top-4">
            <div className="bg-slate-700 px-4 py-2.5 flex items-center gap-1.5">
              <ClipboardList className="w-3 h-3 text-slate-300" />
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-200">Standard Reference</h3>
            </div>
            <div className="bg-slate-50 p-4">
              <p className="text-xs font-semibold text-black whitespace-pre-wrap leading-relaxed">
                {staticStandardRange}
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default ReportViewer;
