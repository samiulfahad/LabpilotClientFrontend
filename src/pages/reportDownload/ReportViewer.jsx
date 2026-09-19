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
  Share2,
  Printer,
  Download,
  ChevronDown,
  Check,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { ReportPDFDocument } from "./ReportPDF";

// Fallback pad height (mm) used when a lab hasn't set medicalReport.padHeight.
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

// Status is purely presentational: if a field carries a referenceTag (the
// matched tier's manually-typed label), that label is printed as-is with no
// low/high/normal guessing, no arrows, and no abnormal-row shading. Fields
// with no referenceTag simply show no status. Mirrors the admin renderer.
function getStatus(field) {
  if (!field) return null;
  if (field.referenceTag) return "tag";
  return null;
}

function hasEvaluableStatus(field) {
  return Boolean(field?.referenceRange) || Boolean(field?.referenceTag);
}

function getSectionEntries(sectionData) {
  return Object.entries(sectionData).filter(([key]) => key !== "__showTitle");
}

// referenceRange (the matched tier's own bounds, e.g. "70–100", "> 10") is
// checked before referenceTag (its label, e.g. "High") so this only ever
// falls back to showing the tag text here if a field genuinely has no
// stored range. A Key-Value Pair reference comes through as an array of
// { key, value } objects rather than a string — callers must check for
// that and render a stacked list instead. NOTE: when a number field
// carries the full referenceTiers array (see RefTierBox below), callers
// should check for that FIRST and skip this helper entirely.
function getRefDisplay(field) {
  return field.referenceRange || field.referenceTag || field.referenceValue || "";
}

// field.referenceValue (for a keyvalue-scoped text/textarea field) may come
// through as an array of GROUPS — [{ header, pairs: [{ key, value }] }] —
// where `header` is optional. This flattens that into an ordered list of
// header/row lines so an ungrouped (header-less) group just contributes
// its bare rows.
function flattenKeyValueGroups(groups) {
  const lines = [];
  groups.forEach((g) => {
    if (g.header) lines.push({ type: "header", label: g.header });
    (g.pairs || []).forEach((p) => lines.push({ type: "row", key: p.key, value: p.value }));
  });
  return lines;
}

// On-screen rendering of a Key-Value Pair reference. The parent <td> hands
// this component the full cell with zero padding so each row's own
// padding + border-top divider stretches edge-to-edge across the cell —
// reading as real stacked boxed rows, not a thin line floating inside
// leftover cell padding. A header band is only rendered for groups that
// were actually given one.
function RefKeyValueBox({ groups }) {
  const lines = flattenKeyValueGroups(groups);
  return (
    <div className="w-full">
      {lines.map((line, i) =>
        line.type === "header" ? (
          <div
            key={i}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-black text-center bg-gray-100 ${
              i > 0 ? "border-t border-black" : ""
            }`}
          >
            {line.label}
          </div>
        ) : (
          <div key={i} className={`grid grid-cols-2 text-[11px] leading-snug ${i > 0 ? "border-t border-black" : ""}`}>
            <span className="px-3 py-2 border-r border-black text-black break-words min-w-0">{line.key}</span>
            <span className="px-3 py-2 text-black break-words min-w-0">{line.value}</span>
          </div>
        ),
      )}
    </div>
  );
}

// field.referenceTiers is an array of GROUPS — [{ group, rows }] — where
// `group` is null for a "simple" (ungrouped) standard range, or a label
// like "Male" / "Female" / "18y – 60y" for gender/age scoped ranges. Not
// every report will have this (older/simple submissions only carry a
// single referenceRange/referenceTag), so it's treated as an optional,
// richer view of the same match when present.
function flattenTierGroups(groups) {
  const lines = [];
  groups.forEach((g) => {
    if (g.group) lines.push({ type: "header", label: g.group });
    (g.rows || []).forEach((r) => lines.push({ type: "row", ...r }));
  });
  return lines;
}

// On-screen rendering of a number field's full reference table, when
// present. Every group defined on the field's standard range is shown,
// with the row the patient's actual value landed in getting a neutral
// gray fill, bold text, and a plain tick mark next to the tier name.
function RefTierBox({ groups, smart = true }) {
  const lines = flattenTierGroups(groups);
  return (
    <div className="w-full">
      {lines.map((line, i) => {
        const matched = smart && line.matched;
        return line.type === "header" ? (
          <div
            key={i}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-black text-center bg-gray-100 ${
              i > 0 ? "border-t border-black" : ""
            }`}
          >
            {line.label}
          </div>
        ) : (
          <div
            key={i}
            className={`grid grid-cols-2 text-[11px] leading-snug ${i > 0 ? "border-t border-black" : ""} ${
              matched ? "bg-gray-200" : ""
            }`}
          >
            <span
              className={`px-3 py-1 border-r border-black text-black flex items-center justify-between gap-1 break-words min-w-0 ${
                matched ? "font-bold" : ""
              }`}
            >
              <span className="break-words">{line.label}</span>
              {matched && <Check className="w-3 h-3 flex-shrink-0" />}
            </span>
            <span className={`px-3 py-1 text-black break-words min-w-0 ${matched ? "font-bold" : ""}`}>
              {line.range}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Print-HTML string equivalent of RefKeyValueBox.
function refKeyValueRowsHtml(groups) {
  const lines = flattenKeyValueGroups(groups);
  return lines
    .map((line, i) => {
      const borderTop = i > 0 ? "border-top:1px solid #000;" : "";
      if (line.type === "header") {
        return `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#000;text-align:center;padding:4px 12px;background:#f3f4f6;${borderTop}">${line.label}</div>`;
      }
      return `<div style="display:grid;grid-template-columns:1fr 1fr;font-size:10px;color:#000;min-width:0;${borderTop}">
        <div style="padding:6px 12px;border-right:1px solid #000;min-width:0;overflow-wrap:break-word;word-break:break-word;">${line.key}</div>
        <div style="padding:6px 12px;min-width:0;overflow-wrap:break-word;word-break:break-word;">${line.value}</div>
      </div>`;
    })
    .join("");
}

// Print-HTML string equivalent of RefTierBox.
function refTierRowsHtml(groups, smart = true) {
  const lines = flattenTierGroups(groups);
  return lines
    .map((line, i) => {
      const borderTop = i > 0 ? "border-top:1px solid #000;" : "";
      if (line.type === "header") {
        return `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#000;text-align:center;padding:4px 12px;background:#f3f4f6;${borderTop}">${line.label}</div>`;
      }
      const matched = smart && line.matched;
      return `<div style="display:grid;grid-template-columns:1fr 1fr;font-size:10px;color:#000;min-width:0;${borderTop}${
        matched ? "background:#e6e6e6;font-weight:700;" : ""
      }">
        <div style="padding:4px 12px;border-right:1px solid #000;min-width:0;overflow-wrap:break-word;word-break:break-word;display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <span style="overflow-wrap:break-word;word-break:break-word;">${line.label}</span>
          ${matched ? `<span style="font-size:10px;flex-shrink:0;">✓</span>` : ""}
        </div>
        <div style="padding:4px 12px;min-width:0;overflow-wrap:break-word;word-break:break-word;">${line.range}</div>
      </div>`;
    })
    .join("");
}

function formatValue(field) {
  return Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "");
}

// A bordered black-on-white box with bold uppercase text. Status is now
// always the "tag" case (or nothing) — this just prints whatever label
// was typed for the matched tier.
function StatusBox({ status, label }) {
  if (!status) return <span className="text-xs text-gray-300">—</span>;
  const TEXT = label || "—";
  return (
    <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-black border border-black px-2 py-0.5">
      {TEXT}
    </span>
  );
}

function ParamRow({ name, field, hasUnits, hasStatus, isAlt, smart }) {
  const value = formatValue(field);
  const unit = field.unit || "";
  const tierGroups = Array.isArray(field.referenceTiers) && field.referenceTiers.length ? field.referenceTiers : null;
  const ref = tierGroups ? null : getRefDisplay(field);
  const status = hasEvaluableStatus(field) ? getStatus(field) : null;
  return (
    <tr className={isAlt ? "bg-gray-50" : "bg-white"}>
      <td className="pl-4 pr-3 py-2.5 text-sm text-black border-b border-r border-black">{name}</td>
      <td className="px-3 py-2.5 text-sm font-bold text-black border-b border-r border-black tabular-nums">
        {value || <span className="text-gray-300 font-normal">—</span>}
      </td>
      {hasUnits && (
        <td className="px-3 py-2.5 text-[11px] font-semibold text-black border-b border-r border-black">
          {unit || <span className="text-gray-300">—</span>}
        </td>
      )}
      <td
        className={`text-xs text-black border-b border-black tabular-nums align-top ${hasStatus ? "border-r" : ""} ${
          tierGroups || Array.isArray(ref) ? "p-0" : "px-3 py-2.5"
        }`}
      >
        {tierGroups ? (
          <RefTierBox groups={tierGroups} smart={smart} />
        ) : Array.isArray(ref) ? (
          <RefKeyValueBox groups={ref} />
        ) : (
          ref || <span className="text-gray-300">—</span>
        )}
      </td>
      {hasStatus && (
        <td className="px-3 pr-4 py-2.5 border-b border-black">
          <StatusBox status={status} label={field.referenceTag} />
        </td>
      )}
    </tr>
  );
}

function Section({ sectionName, sectionData, index, showHeader, smart = true }) {
  const [collapsed, setCollapsed] = useState(false);
  const entries = getSectionEntries(sectionData);
  const hasUnits = entries.some(([, v]) => Boolean(v.unit));
  const hasStatus = smart && entries.some(([, v]) => hasEvaluableStatus(v));

  const tableBody = (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-100 border-b border-black">
          <th className="pl-4 pr-3 py-1.5 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-black w-[34%]">
            Parameter
          </th>
          <th className="px-3 py-1.5 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-black w-[16%]">
            Result
          </th>
          {hasUnits && (
            <th className="px-3 py-1.5 text-left text-[10px] font-bold text-black uppercase tracking-wider border-r border-black w-[12%]">
              Unit
            </th>
          )}
          <th
            className={`px-3 py-1.5 text-left text-[10px] font-bold text-black uppercase tracking-wider w-[24%] ${
              hasStatus ? "border-r border-black" : ""
            }`}
          >
            Ref. Range
          </th>
          {hasStatus && (
            <th className="px-3 pr-4 py-1.5 text-left text-[10px] font-bold text-black uppercase tracking-wider w-[18%]">
              Status
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {entries.map(([n, f], i) => (
          <ParamRow
            key={n}
            name={n}
            field={f}
            hasUnits={hasUnits}
            hasStatus={hasStatus}
            isAlt={i % 2 === 1}
            smart={smart}
          />
        ))}
      </tbody>
    </table>
  );

  if (!showHeader) return <div className="border border-black mb-2.5">{tableBody}</div>;

  return (
    <div className="border border-black mb-2.5">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 border-b border-black transition-colors text-left"
      >
        <span className="w-5 h-5 border border-black bg-white flex items-center justify-center text-black text-[10px] font-bold flex-shrink-0">
          {String.fromCharCode(65 + index)}
        </span>
        <span className="flex-1 text-sm font-bold text-black uppercase tracking-wide">{sectionName}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-black transition-transform flex-shrink-0 ${collapsed ? "" : "rotate-180"}`}
        />
      </button>
      {!collapsed && <div>{tableBody}</div>}
    </div>
  );
}

function PatientGrid({ patient, isIndoor }) {
  const mainFields = [
    { label: "Patient Name", value: patient.name, Icon: User },
    { label: "Age / Gender", value: [patient.age, patient.gender].filter(Boolean).join(" · "), Icon: Hash },
    { label: "Contact", value: patient.contact, Icon: Phone },
    { label: "Sample Date", value: patient.sampleDate, Icon: Calendar },
    { label: "Report Date", value: patient.reportDate, Icon: Calendar },
  ];
  const Cell = ({ label, value, Icon, last }) => (
    <div className={`bg-white px-3 py-2 border-b border-black ${last ? "" : "border-r"}`}>
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-2.5 h-2.5 text-black flex-shrink-0" />
        <p className="text-[9px] font-bold text-black uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-xs font-semibold text-black truncate">{value || "—"}</p>
    </div>
  );
  return (
    <div className="border border-black border-b-0">
      <div className="grid grid-cols-5">
        {mainFields.map((f, i) => (
          <Cell key={f.label} {...f} last={i === mainFields.length - 1} />
        ))}
      </div>
      <div className="bg-white px-3 py-1.5 flex items-center gap-3 border-b border-black">
        <Stethoscope className="w-2.5 h-2.5 text-black flex-shrink-0" />
        <span className="text-[9px] font-bold text-black uppercase tracking-widest">Referred By</span>
        <span className="text-xs font-semibold text-black">{patient.referredBy || "—"}</span>
      </div>
    </div>
  );
}

// ── Print HTML builder — Tailwind (via Play CDN) for all visual styling.
// Deliberately monochrome: black text, black rules, white paper. Status is
// shown as a bordered box with bold text, whatever label was typed for the
// matched tier — no color, no automatic low/high guessing, no shading.
function buildPrintHTML({ reportName, shortId, patient, labInfo, sections, printType, isIndoor, smart = true }) {
  const isPad = printType === "PAD";
  const padHeightMm = labInfo.padHeight > 0 ? labInfo.padHeight : DEFAULT_PAD_HEIGHT_MM;

  const statusHtml = (status, tagLabel) => {
    if (!status) return `<span class="text-[11px] text-gray-300">—</span>`;
    const TEXT = tagLabel || "—";
    return `<span class="inline-block text-[9px] font-bold uppercase tracking-wide text-black border border-black py-0.5 px-[7px]">${TEXT}</span>`;
  };

  const renderSection = (sectionName, sectionData, index) => {
    const showHeader = sectionData.__showTitle !== false;
    const entries = getSectionEntries(sectionData);
    const hasUnits = entries.some(([, v]) => Boolean(v.unit));
    const hasStatus = smart && entries.some(([, v]) => hasEvaluableStatus(v));

    const unitHeader = hasUnits
      ? `<th class="py-[5px] px-3 text-left text-[9px] font-bold text-black uppercase tracking-[0.05em] border-r border-black w-[12%]">Unit</th>`
      : "";
    const statusHeader = hasStatus
      ? `<th class="py-[5px] px-3 text-left text-[9px] font-bold text-black uppercase tracking-[0.05em] w-[18%]">Status</th>`
      : "";

    const rows = entries
      .map(([name, field], i) => {
        const value = formatValue(field);
        const unit = field.unit || "";
        const tierGroups =
          Array.isArray(field.referenceTiers) && field.referenceTiers.length ? field.referenceTiers : null;
        const ref = tierGroups ? null : getRefDisplay(field);
        const refHtml = tierGroups
          ? refTierRowsHtml(tierGroups, smart)
          : Array.isArray(ref)
            ? refKeyValueRowsHtml(ref)
            : ref || "—";
        const status = hasEvaluableStatus(field) ? getStatus(field) : null;
        const rowBg = i % 2 === 1 ? "bg-gray-50" : "bg-white";
        const refIsBoxed = Boolean(tierGroups) || Array.isArray(ref);
        const refBorder = hasStatus ? "border-r border-black" : "";
        const refCellClass = refIsBoxed
          ? `text-[11px] text-black border-b ${refBorder} align-top p-0`
          : `py-[7px] px-3 text-[11px] text-black border-b ${refBorder} align-top`;
        return `<tr class="${rowBg}">
        <td class="py-[7px] px-3 text-xs text-black border-b border-r border-black">${name}</td>
        <td class="py-[7px] px-3 text-xs font-bold text-black border-b border-r border-black">${value || "—"}</td>
        ${hasUnits ? `<td class="py-[7px] px-3 text-[10px] font-semibold text-black border-b border-r border-black">${unit || "—"}</td>` : ""}
        <td class="${refCellClass}">${refHtml}</td>
        ${hasStatus ? `<td class="py-[7px] px-3 border-b border-black">${statusHtml(status, field.referenceTag)}</td>` : ""}
      </tr>`;
      })
      .join("");

    const headerHTML = showHeader
      ? `<div class="bg-gray-100 border-b border-black py-2 px-3.5 flex items-center gap-2">
          <span class="w-5 h-5 bg-white border border-black rounded-none flex items-center justify-center text-black text-[9px] font-bold">${String.fromCharCode(65 + index)}</span>
          <span class="text-black text-xs font-bold uppercase tracking-wide flex-1">${sectionName}</span>
        </div>`
      : "";

    return `<div class="border border-black mb-2.5">
      ${headerHTML}
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-gray-100 border-b border-black">
            <th class="py-[5px] px-3 text-left text-[9px] font-bold text-black uppercase tracking-[0.05em] border-r border-black w-[34%]">Parameter</th>
            <th class="py-[5px] px-3 text-left text-[9px] font-bold text-black uppercase tracking-[0.05em] border-r border-black w-[16%]">Result</th>
            ${unitHeader}
            <th class="py-[5px] px-3 text-left text-[9px] font-bold text-black uppercase tracking-[0.05em] ${hasStatus ? "border-r border-black" : ""} w-[24%]">Ref. Range</th>
            ${statusHeader}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  };

  const mainFields = [
    { label: "Patient Name", value: patient.name },
    { label: "Age / Gender", value: [patient.age, patient.gender].filter(Boolean).join(" · ") },
    { label: "Contact", value: patient.contact },
    { label: "Sample Date", value: patient.sampleDate },
    { label: "Report Date", value: patient.reportDate },
  ];
  const mainCells = mainFields
    .map(
      ({ label, value }, i) =>
        `<td class="py-1.5 px-3 bg-white align-top ${i < mainFields.length - 1 ? "border-r" : ""} border-black w-1/5">
          <div class="text-[8px] font-bold text-black uppercase tracking-[0.06em]">${label}</div>
          <div class="text-[11px] font-semibold text-black mt-0.5">${value || "—"}</div>
        </td>`,
    )
    .join("");

  const topBlock = isPad
    ? `<div style="height:${padHeightMm}mm;" class="bg-white"></div>`
    : `<div class="border-b-2 border-black py-4 px-1 flex items-start justify-between">
        <div>
          <div class="text-[16px] font-bold text-black uppercase tracking-wide">${labInfo.name}</div>
          ${labInfo.tagline ? `<div class="text-[10px] text-black italic mt-[3px]">${labInfo.tagline}</div>` : ""}
          <div class="text-[9px] text-black mt-1">${labInfo.address}</div>
        </div>
        <div class="text-right">
          <div class="text-[9px] text-black">Tel: ${labInfo.phone}</div>
          ${labInfo.email ? `<div class="text-[9px] text-black mt-0.5">${labInfo.email}</div>` : ""}
          ${labInfo.regNo ? `<div class="text-[9px] text-black mt-1">Reg. No: ${labInfo.regNo}</div>` : ""}
        </div>
      </div>`;

  const footerBlock = isPad
    ? ""
    : `<div class="py-2.5 px-1 border-t border-black bg-white print:fixed print:bottom-0 print:left-0 print:right-0">
        <table class="w-full max-w-[680px] mx-auto mb-2">
          <tr>
            <td class="w-[45%] pr-5">
              <div class="h-[30px] border-b border-dashed border-black"></div>
              <div class="text-[9px] text-black mt-[3px]">Pathologist Signature &amp; Seal</div>
            </td>
            <td class="w-[10%]"></td>
            <td class="w-[45%] pl-5">
              <div class="h-[30px] border-b border-dashed border-black"></div>
              <div class="text-[9px] text-black mt-[3px] text-right">Authorized Signatory</div>
            </td>
          </tr>
        </table>
        <div class="text-[9px] text-black text-center max-w-[680px] mx-auto">
          For qualified medical professionals only. Interpret results in full clinical context. · ${labInfo.name} · ${labInfo.phone}
        </div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${reportName}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  @page { size: A4; margin: 15mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body class="font-sans bg-white text-black m-0 p-0">
  <div class="max-w-[680px] mx-auto ${isPad ? "pb-5" : "pb-[90px]"}">
    ${topBlock}
    <div class="bg-gray-100 py-2 px-3 flex items-center justify-between border border-black border-t-0">
      <div class="text-sm font-bold text-black uppercase tracking-wide">${reportName}</div>
      ${shortId ? `<div class="text-[9px] text-black font-mono">${isIndoor ? "Admission No" : "Invoice No"}: ${shortId}</div>` : ""}
    </div>
    <table class="w-full border-collapse border border-black border-t-0">
      <tr class="border-b border-black">${mainCells}</tr>
      <tr>
        <td colspan="5" class="py-[5px] px-3 bg-white">
          <span class="text-[8px] font-bold text-black uppercase tracking-[0.06em] mr-2.5">Referred By</span>
          <span class="text-[11px] font-semibold text-black">${patient.referredBy || "—"}</span>
        </td>
      </tr>
    </table>
    <div class="pt-1 px-1">
      ${sections.map(([name, data], i) => renderSection(name, data, i)).join("")}
    </div>
  </div>
  ${footerBlock}
</body>
</html>`;
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
}) {
  const [dlStatus, setDlStatus] = useState("idle");
  const [shareStatus, setShareStatus] = useState("idle");
  // "smart" (default): number fields are labeled from their matched
  // comparison tier, shown in a Status column, with the matched
  // reference row ticked. "classic": the Status column and tick marks
  // are hidden — just the raw result and the plain reference table.
  const [mode, setMode] = useState("smart");
  const smart = mode === "smart";

  const resolvedPatient = patient ?? EMPTY_PATIENT;
  const isPad = printType === "PAD";
  const resolvedReportName = reportName || report.name || "Lab Report";
  const filename = `${resolvedReportName.replace(/\s+/g, "_")}_report.pdf`;
  const shortId = invoiceId || report.invoiceId || "";

  const sections = Object.entries(report).filter(
    ([key, val]) =>
      !REPORT_META_KEYS.has(key) && val !== null && typeof val === "object" && !Array.isArray(val) && !val.$oid,
  );

  const generateBlob = () =>
    pdf(
      <ReportPDFDocument
        report={report}
        reportName={resolvedReportName}
        shortId={shortId}
        patient={resolvedPatient}
        labInfo={labInfo}
        isIndoor={isIndoor}
        isPad={isPad}
        smart={smart}
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
      smart,
    });

    const existing = document.getElementById("ur-print-frame");
    if (existing) existing.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "ur-print-frame";
    iframe.className = "fixed top-0 left-0 w-0 h-0 border-0 invisible";
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
      <Check className="w-3.5 h-3.5 text-emerald-400" />
    ) : (
      <Download className="w-3.5 h-3.5" />
    );
  const dlLabel = dlStatus === "loading" ? "Generating…" : dlStatus === "done" ? "Downloaded!" : "Download PDF";
  const shIcon =
    shareStatus === "loading" ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : shareStatus === "copied" || shareStatus === "done" ? (
      <Check className="w-3.5 h-3.5 text-emerald-500" />
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
    <div className="max-w-2xl mx-auto font-sans">
      {/* Toolbar — unchanged from before, not part of the printed/PDF
          report, keeps its normal interactive styling. */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
          <button
            onClick={() => setMode("classic")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === "classic" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Classic
          </button>
          <button
            onClick={() => setMode("smart")}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === "smart" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Smart
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            disabled={shareStatus === "loading"}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {shIcon} {shLabel}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-slate-400 transition-all"
          >
            <Printer className="w-3.5 h-3.5" />
            {isPad ? "Print (Pad)" : "Print (Plain A4)"}
          </button>
          <button
            onClick={handleDownload}
            disabled={dlStatus === "loading"}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {dlIcon} {dlLabel}
          </button>
        </div>
      </div>

      {/* Report body — doc-style monochrome layout: black rules, black
          text, boxed parameter/result/range/status cells, matching what
          actually prints (PDF and browser print alike). */}
      <div className="bg-white border border-black">
        {!isPad && (
          <div className="border-b-2 border-black px-5 py-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 border border-black flex items-center justify-center flex-shrink-0 mt-0.5">
                <FlaskConical className="w-5 h-5 text-black" />
              </div>
              <div>
                <p className="text-sm font-bold text-black uppercase tracking-wide">{labInfo.name}</p>
                {labInfo.tagline && <p className="text-black text-[11px] mt-0.5 italic">{labInfo.tagline}</p>}
                <div className="flex items-center gap-1 mt-1.5">
                  <MapPin className="w-2.5 h-2.5 text-black flex-shrink-0" />
                  <p className="text-black text-[10px]">{labInfo.address}</p>
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0 space-y-1">
              <div className="flex items-center justify-end gap-1">
                <Phone className="w-2.5 h-2.5 text-black" />
                <p className="text-black text-[10px]">{labInfo.phone}</p>
              </div>
              {labInfo.email && (
                <div className="flex items-center justify-end gap-1">
                  <Mail className="w-2.5 h-2.5 text-black" />
                  <p className="text-black text-[10px]">{labInfo.email}</p>
                </div>
              )}
              {labInfo.regNo && <p className="text-black text-[10px]">Reg. No: {labInfo.regNo}</p>}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-5 py-2.5 bg-gray-100 border-b border-black">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-black flex-shrink-0" />
            <h2 className="text-sm font-bold text-black uppercase tracking-wide">{resolvedReportName}</h2>
          </div>
          {shortId && (
            <p className="text-[10px] text-black font-mono">
              {isIndoor ? "Admission No" : "Invoice No"}: {shortId}
            </p>
          )}
        </div>

        <PatientGrid patient={resolvedPatient} isIndoor={isIndoor} />

        <div className="px-5 pt-4 pb-4">
          {sections.map(([sectionName, sectionData], i) => (
            <Section
              key={sectionName}
              sectionName={sectionName}
              sectionData={sectionData}
              index={i}
              showHeader={sectionData.__showTitle !== false}
              smart={smart}
            />
          ))}
        </div>
      </div>

      {!isPad && (
        <div className="mt-8 pt-6 border-t border-black">
          <div className="grid grid-cols-2 gap-8 mb-5">
            <div>
              <div className="h-10 border-b border-dashed border-black" />
              <p className="text-[10px] text-black mt-1.5">Pathologist Signature &amp; Seal</p>
            </div>
            <div>
              <div className="h-10 border-b border-dashed border-black" />
              <p className="text-[10px] text-black mt-1.5 text-right">Authorized Signatory</p>
            </div>
          </div>
          <p className="text-[10px] text-black text-center leading-relaxed">
            For qualified medical professionals only. Interpret results in full clinical context.
            <span className="mx-1.5">·</span>
            {labInfo.name}
            <span className="mx-1.5">·</span>
            {labInfo.phone}
          </p>
        </div>
      )}
    </div>
  );
}

export default ReportViewer;
