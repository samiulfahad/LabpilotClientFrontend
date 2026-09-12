import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Fallback pad height (mm) used when a lab hasn't set medicalReport.padHeight
// — mirrors the same constant/fallback in ReportViewer.jsx's buildPrintHTML.
const DEFAULT_PAD_HEIGHT_MM = 38;

const C = {
  dark: "#000000",
  slate700: "#334155",
  slate600: "#000000",
  slate400: "#000000",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  body: "#000000",
  normal: "#166534",
  low: "#92400e",
  high: "#991b1b",
  tag: "#6d28d9",
  lowBg: "#fffbeb",
  highBg: "#fef2f2",
  normBg: "#f0fdf4",
  tagBg: "#f5f3ff",
  lowBdr: "#fde68a",
  highBdr: "#fecaca",
  normBdr: "#bbf7d0",
  tagBdr: "#ddd6fe",
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: C.dark, paddingBottom: 80 },

  header: {
    borderBottom: `2 solid ${C.dark}`,
    padding: "12 16",
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "white",
  },
  labName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.dark },
  labSub: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.slate400,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  labAddr: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.slate400, marginTop: 4 },
  headerRight: { alignItems: "flex-end" },
  headerContact: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.slate600, marginBottom: 2 },
  headerReg: { fontSize: 7, color: C.slate400, fontFamily: "Courier-Bold" },

  titleBar: {
    backgroundColor: C.slate50,
    padding: "7 16",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1 solid ${C.slate200}`,
  },
  titleText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.dark },
  invoiceText: { fontSize: 7.5, color: C.slate600, fontFamily: "Courier-Bold" },

  patientRow: { flexDirection: "row", borderBottom: `1 solid ${C.slate200}` },
  patientCell: { flex: 1, padding: "6 10", backgroundColor: "white", borderRight: `1 solid ${C.slate200}` },
  cellLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: C.slate400,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2.5,
  },
  cellValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.dark },

  referredRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: "5 10",
    backgroundColor: "#fafafa",
    borderBottom: `1 solid ${C.slate200}`,
    gap: 8,
  },

  summaryBar: {
    backgroundColor: C.slate50,
    padding: "5 16",
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderBottom: `1 solid ${C.slate200}`,
  },

  sectionWrap: { marginBottom: 8, border: `1 solid ${C.slate200}` },
  sectionHead: {
    backgroundColor: C.slate700,
    padding: "6 12",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "white" },
  sectionCount: { fontSize: 7, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.5 },

  tableHead: {
    flexDirection: "row",
    backgroundColor: C.slate50,
    borderBottom: `1 solid ${C.slate200}`,
    padding: "3 0",
  },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#000000",
    textTransform: "uppercase",
    paddingHorizontal: 8,
    letterSpacing: 0.3,
  },
  tableRow: { flexDirection: "row", borderBottom: `1 solid ${C.slate100}`, paddingVertical: 5 },
  td: { fontSize: 9, paddingHorizontal: 8, color: C.body, fontFamily: "Helvetica-Bold" },
  tdBold: { fontSize: 9, paddingHorizontal: 8, fontFamily: "Helvetica-Bold" },
  tdMono: { fontSize: 9, paddingHorizontal: 8, fontFamily: "Courier-Bold", color: C.slate600 },
  tdUnit: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 8,
    color: C.slate400,
    textTransform: "uppercase",
  },
  pill: { paddingHorizontal: 5, paddingVertical: 1.5 },

  // ── Static standard range sidebar ──────────────────────────────────────────
  rangeBoxWrap: { border: `1 solid ${C.slate200}` },
  rangeBoxHead: { backgroundColor: C.slate700, padding: "6 12" },
  rangeBoxHeadText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "white",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rangeBox: {
    backgroundColor: C.slate50,
    padding: 8,
  },
  rangeBoxText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.slate600, lineHeight: 1.4 },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "10 16",
    borderTop: `1 solid ${C.slate200}`,
    backgroundColor: "white",
  },
  sigRow: { flexDirection: "row", marginBottom: 8 },
  sigBox: { flex: 1 },
  sigLine: { borderBottom: "1 dashed #94a3b8", height: 22, marginBottom: 3 },
  sigLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.slate400 },
  footerNote: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.slate400, textAlign: "center", marginTop: 4 },
});

// Meta keys that live alongside the result sections on `report` but aren't
// sections themselves — mirrors REPORT_META_KEYS in ReportViewer.jsx so the
// PDF hides the same fields the screen/print view hides (previously this
// only excluded _id/name, so reportDate/sampleCollectionDate could leak
// through as a bogus section here if ever stored as an object).
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

// A number field's status now comes from whichever the schema produced:
// - referenceTag (current) — the label of the standard-range tier the value
//   matched (e.g. "High", "Reactive", "Trace"). Status bucket comes from the
//   label text itself; no ratio to compute since a tier isn't a single
//   min/max span.
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

function isResultField(field) {
  if (!field || typeof field !== "object") return false;
  return Boolean(field.referenceRange) || Boolean(field.referenceTag) || Boolean(field.unit);
}

function getSectionEntries(sectionData) {
  return Object.entries(sectionData).filter(([key]) => key !== "__showTitle");
}

const ROW_COLORS = {
  high: { bg: "#fff8f8", val: C.high },
  low: { bg: "#fffdf5", val: C.low },
  normal: { bg: "white", val: C.dark },
  tag: { bg: "#faf5ff", val: C.tag },
};

const PILL_COLORS = {
  high: { bg: C.highBg, color: C.high, border: C.highBdr },
  low: { bg: C.lowBg, color: C.low, border: C.lowBdr },
  normal: { bg: C.normBg, color: C.normal, border: C.normBdr },
  tag: { bg: C.tagBg, color: C.tag, border: C.tagBdr },
};

function Pill({ info }) {
  if (!info) return null;
  const pc = PILL_COLORS[info.status];
  if (!pc) return null;
  return (
    <View style={[s.pill, { backgroundColor: pc.bg, borderWidth: 0.5, borderColor: pc.border }]}>
      <Text style={{ color: pc.color, fontSize: 7, fontFamily: "Helvetica-Bold" }}>{info.label}</Text>
    </View>
  );
}

function PDFSection({ sectionName, sectionData, showHeader }) {
  const entries = getSectionEntries(sectionData);
  const resultEntries = entries.filter(([, v]) => isResultField(v));
  const plainEntries = entries.filter(([, v]) => !isResultField(v));
  const hasResultTable = resultEntries.length > 0;
  const hasUnits = resultEntries.some(([, v]) => Boolean(v.unit));
  // A section shows the Ref./Status columns if any result field carries
  // either a legacy referenceRange or a current referenceTag.
  const hasRefInfo = resultEntries.some(([, v]) => Boolean(v.referenceRange) || Boolean(v.referenceTag));

  const W = hasRefInfo
    ? hasUnits
      ? { param: "32%", result: "13%", unit: "10%", ref: "22%", status: "23%" }
      : { param: "34%", result: "16%", ref: "26%", status: "24%" }
    : hasUnits
      ? { param: "40%", result: "30%", unit: "30%" }
      : { param: "58%", result: "42%" };

  return (
    <View style={s.sectionWrap}>
      {showHeader && (
        <View style={s.sectionHead}>
          <Text style={s.sectionName}>{sectionName}</Text>
          <Text style={s.sectionCount}>
            {entries.length} parameter{entries.length !== 1 ? "s" : ""}
          </Text>
        </View>
      )}

      {/* When the section has at least one result-style field, ALL fields —
          including radio/select/checkbox/textarea/plain-text ones — render
          as rows in this same table, with "—" filling the Unit/Ref-Range/
          Status columns for non-result fields. Only when no field is
          result-style does the section fall back to the plain two-column
          layout below. */}
      {hasResultTable && (
        <View>
          <View style={s.tableHead}>
            <Text style={[s.th, { width: W.param }]}>Parameter</Text>
            <Text style={[s.th, { width: W.result }]}>Result</Text>
            {hasUnits && <Text style={[s.th, { width: W.unit }]}>Unit</Text>}
            {hasRefInfo && (
              <>
                <Text style={[s.th, { width: W.ref }]}>Ref. Range</Text>
                <Text style={[s.th, { width: W.status }]}>Status</Text>
              </>
            )}
          </View>
          {entries.map(([name, field]) => {
            if (isResultField(field)) {
              const value = String(field.value ?? "");
              // A tier-tagged field has no stored numeric range text (only
              // the matched tier's label, in referenceTag) — the Ref. Range
              // column stays dashed for those; the tag's label carries the
              // classification in the Status column instead.
              const ref = field.referenceRange || "";
              const info = hasRefInfo ? getStatusInfo(field) : null;
              const rc = info ? (ROW_COLORS[info.status] ?? {}) : {};
              return (
                <View key={name} style={[s.tableRow, { backgroundColor: rc.bg ?? "white" }]}>
                  <Text style={[s.td, { width: W.param }]}>{name}</Text>
                  <Text style={[s.tdBold, { width: W.result, color: rc.val ?? C.dark }]}>{value}</Text>
                  {hasUnits && <Text style={[s.tdUnit, { width: W.unit }]}>{field.unit || "—"}</Text>}
                  {hasRefInfo && (
                    <>
                      <Text style={[s.tdMono, { width: W.ref }]}>{ref || "—"}</Text>
                      <View style={{ width: W.status, justifyContent: "center", paddingHorizontal: 6 }}>
                        <Pill info={info} />
                      </View>
                    </>
                  )}
                </View>
              );
            }
            const val = Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "—");
            return (
              <View key={name} style={[s.tableRow, { backgroundColor: "white" }]}>
                <Text style={[s.td, { width: W.param }]}>{name}</Text>
                <Text style={[s.tdBold, { width: W.result }]}>{val || "—"}</Text>
                {hasUnits && <Text style={[s.tdUnit, { width: W.unit }]}>—</Text>}
                {hasRefInfo && (
                  <>
                    <Text style={[s.tdMono, { width: W.ref }]}>—</Text>
                    <View style={{ width: W.status, justifyContent: "center", paddingHorizontal: 6 }} />
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}

      {!hasResultTable && plainEntries.length > 0 && (
        <View>
          {plainEntries.map(([name, field]) => {
            const val = Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "—");
            return (
              <View key={name} style={[s.tableRow, { backgroundColor: "white" }]}>
                <Text style={[s.td, { width: "38%", color: C.slate400 }]}>{name}</Text>
                <Text style={[s.tdBold, { flex: 1 }]}>{val || "—"}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export function ReportPDFDocument({
  report,
  reportName,
  shortId,
  patient,
  labInfo,
  isIndoor = false,
  staticStandardRange = null,
  isPad = false,
}) {
  const sections = Object.entries(report).filter(
    ([key, val]) =>
      !REPORT_META_KEYS.has(key) && val !== null && typeof val === "object" && !Array.isArray(val) && !val.$oid,
  );

  let normal = 0,
    low = 0,
    high = 0;
  sections.forEach(([, sec]) => {
    getSectionEntries(sec).forEach(([, field]) => {
      if (!isResultField(field)) return;
      const info = getStatusInfo(field);
      if (!info) return;
      if (info.status === "normal") normal++;
      else if (info.status === "low") low++;
      else if (info.status === "high") high++;
    });
  });
  const total = normal + low + high;

  const mainFields = [
    { label: "Patient Name", value: patient.name },
    { label: "Age / Gender", value: [patient.age, patient.gender].filter(Boolean).join(" · ") },
    { label: "Contact", value: patient.contact },
    ...(patient.sampleDate ? [{ label: "Sample Date", value: patient.sampleDate }] : []),
    ...(patient.reportDate ? [{ label: "Report Date", value: patient.reportDate }] : []),
  ];

  // Pad mode: leave the physical pre-printed letterhead area blank by
  // spacing down padHeightMm (from the lab's medicalReport.padHeight
  // setting, in mm) instead of drawing the lab header — mirrors the
  // isPad branch in ReportViewer.jsx's buildPrintHTML (topBlock).
  const padHeightMm = labInfo.padHeight > 0 ? labInfo.padHeight : DEFAULT_PAD_HEIGHT_MM;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {isPad ? (
          <View style={{ height: `${padHeightMm}mm` }} />
        ) : (
          <View style={s.header}>
            <View>
              <Text style={s.labName}>{labInfo.name}</Text>
              {labInfo.tagline ? <Text style={s.labSub}>{labInfo.tagline}</Text> : null}
              <Text style={s.labAddr}>{labInfo.address}</Text>
            </View>
            <View style={s.headerRight}>
              <Text style={s.headerContact}>{labInfo.phone}</Text>
              {labInfo.email ? <Text style={s.headerContact}>{labInfo.email}</Text> : null}
              {labInfo.regNo ? <Text style={s.headerReg}>Reg: {labInfo.regNo}</Text> : null}
            </View>
          </View>
        )}

        {/* Title bar */}
        <View style={s.titleBar}>
          <Text style={s.titleText}>{reportName}</Text>
          {shortId ? (
            <Text style={s.invoiceText}>
              {isIndoor ? "Admission" : "Invoice"}: {shortId}
            </Text>
          ) : null}
        </View>

        {/* Patient grid */}
        <View style={s.patientRow}>
          {mainFields.map(({ label, value }) => (
            <View key={label} style={s.patientCell}>
              <Text style={s.cellLabel}>{label}</Text>
              <Text style={s.cellValue}>{value || "—"}</Text>
            </View>
          ))}
        </View>
        <View style={s.referredRow}>
          <Text style={[s.cellLabel, { marginBottom: 0 }]}>Referred By</Text>
          <Text style={[s.cellValue, { fontSize: 9 }]}>{patient.referredBy || "—"}</Text>
        </View>

        {/* Summary */}
        {total > 0 && (
          <View style={s.summaryBar}>
            <Text style={{ fontSize: 8, color: C.slate600, fontFamily: "Helvetica-Bold" }}>{total} parameters:</Text>
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.normal }}>{normal} Normal</Text>
            {low > 0 && <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.low }}>{low} Low</Text>}
            {high > 0 && <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: C.high }}>{high} High</Text>}
          </View>
        )}

        {/* Sections (+ optional static standard-range sidebar) */}
        <View
          style={{
            padding: "10 14",
            flexDirection: staticStandardRange ? "row" : "column",
            gap: staticStandardRange ? 10 : 0,
          }}
        >
          <View style={{ flex: staticStandardRange ? 3 : 1 }}>
            {sections.map(([sectionName, sectionData]) => (
              <PDFSection
                key={sectionName}
                sectionName={sectionName}
                sectionData={sectionData}
                showHeader={sectionData.__showTitle !== false}
              />
            ))}
          </View>

          {staticStandardRange && (
            <View style={[s.rangeBoxWrap, { flex: 1 }]}>
              <View style={s.rangeBoxHead}>
                <Text style={s.rangeBoxHeadText}>Standard Reference</Text>
              </View>
              <View style={s.rangeBox}>
                <Text style={s.rangeBoxText}>{staticStandardRange}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Footer — omitted in Pad mode, matching footerBlock in
            ReportViewer.jsx's buildPrintHTML (isPad ? "" : footerBlock) */}
        {!isPad && (
          <View style={s.footer} fixed>
            <View style={s.sigRow}>
              <View style={[s.sigBox, { marginRight: 40 }]}>
                <View style={s.sigLine} />
                <Text style={s.sigLabel}>Pathologist Signature &amp; Seal</Text>
              </View>
              <View style={[s.sigBox, { marginLeft: 40 }]}>
                <View style={s.sigLine} />
                <Text style={[s.sigLabel, { textAlign: "right" }]}>Authorized Signatory</Text>
              </View>
            </View>
            <Text style={s.footerNote}>
              For qualified medical professionals only. Interpret results in full clinical context. · {labInfo.name} ·{" "}
              {labInfo.phone}
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
