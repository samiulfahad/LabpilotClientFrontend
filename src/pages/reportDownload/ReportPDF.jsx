import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Fallback pad height (mm) used when a lab hasn't set medicalReport.padHeight.
const DEFAULT_PAD_HEIGHT_MM = 38;

// Every color in this document is grayscale on purpose — this is a
// black-ink-on-white-paper report, not a screen UI.
const BLACK = "#000000";
const LINE = "#000000";
const HEAD_BG = "#ececec";
const ALT_BG = "#f8f8f8";
const ABNORMAL_BG = "#e6e6e6"; // used for the matched-tier row inside RefTierBoxPDF

const s = StyleSheet.create({
  // 42pt ≈ 15mm on all sides, matching the print/HTML view's @page margin;
  // paddingBottom keeps the same extra room reserved for the fixed footer
  // (64pt) on top of that standard margin.
  page: { fontFamily: "Helvetica", fontSize: 9, color: BLACK, padding: 42, paddingBottom: 106 },

  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: `2 solid ${LINE}`,
    paddingBottom: 10,
    marginBottom: 10,
  },
  labName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: BLACK, textTransform: "uppercase", letterSpacing: 0.6 },
  labTagline: { fontSize: 8, color: BLACK, marginTop: 3, fontFamily: "Helvetica-Oblique" },
  labAddr: { fontSize: 7.5, color: BLACK, marginTop: 4 },
  headerRight: { alignItems: "flex-end" },
  headerLine: { fontSize: 7.5, color: BLACK, marginBottom: 2 },

  titleBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1 solid ${LINE}`,
    paddingBottom: 6,
    marginBottom: 10,
  },
  titleText: { fontSize: 12.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  invoiceText: { fontSize: 8, fontFamily: "Courier" },

  patientTable: { border: `1 solid ${LINE}`, marginBottom: 10 },
  patientRow: { flexDirection: "row" },
  patientCell: { flex: 1, borderRight: `1 solid ${LINE}`, borderBottom: `1 solid ${LINE}`, padding: "5 8" },
  patientCellLast: { flex: 1, borderBottom: `1 solid ${LINE}`, padding: "5 8" },
  cellLabel: {
    fontSize: 6.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
    fontFamily: "Helvetica-Bold",
  },
  cellValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: BLACK },
  referredRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: "5 8" },

  sectionWrap: { border: `1 solid ${LINE}`, marginBottom: 10 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: HEAD_BG,
    borderBottom: `1 solid ${LINE}`,
    padding: "6 8",
  },
  sectionBadge: {
    width: 16,
    height: 16,
    border: `1 solid ${LINE}`,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionBadgeTxt: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: BLACK },
  sectionName: {
    flex: 1,
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: BLACK,
  },

  tableHead: { flexDirection: "row", backgroundColor: HEAD_BG, borderBottom: `1 solid ${LINE}` },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    padding: "5 8",
    borderRight: `1 solid ${LINE}`,
    color: BLACK,
    flexShrink: 1,
  },
  thLast: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    padding: "5 8",
    color: BLACK,
    flexShrink: 1,
  },
  tableRow: { flexDirection: "row", borderBottom: `1 solid ${LINE}` },
  tableRowAlt: { backgroundColor: ALT_BG },
  td: { fontSize: 9, padding: "5 8", borderRight: `1 solid ${LINE}`, color: BLACK, flexShrink: 1 },
  tdLast: { fontSize: 9, padding: "5 8", color: BLACK, flexShrink: 1 },
  tdBold: { fontFamily: "Helvetica-Bold" },
  tdMuted: { fontSize: 8, color: BLACK },

  statusBox: {
    borderWidth: 1,
    borderColor: BLACK,
    borderStyle: "solid",
    paddingVertical: 2,
    paddingHorizontal: 6,
    alignSelf: "flex-start",
  },
  statusTxt: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 0.3, color: BLACK },
  statusDash: { fontSize: 8, color: BLACK },

  footer: { position: "absolute", bottom: 0, left: 0, right: 0, padding: "12 28", borderTop: `1 solid ${LINE}` },
  sigRow: { flexDirection: "row", marginBottom: 10 },
  sigBox: { flex: 1 },
  sigLine: { borderBottom: `1 dashed ${LINE}`, height: 26, marginBottom: 4 },
  sigLabel: { fontSize: 7, color: BLACK },
  footerNote: { fontSize: 7, color: BLACK, textAlign: "center", marginTop: 6 },
});

// Status is purely the tag typed on the matched tier — nothing to
// interpret, no fallback numeric comparison, no keyword guessing.
function getStatus(field) {
  return field?.referenceTag || null;
}
// A field only routed to plainEntries (the narrow name+value layout) when
// it has none of these — but a Key-Value Pair reference (referenceValue as
// an array of groups) was missing from this check, so a field with no unit
// and no numeric range — e.g. a text/textarea field carrying only a
// grouped Key-Value reference — fell into plainEntries instead of the
// properly width-balanced resultEntries table, and got squeezed into a
// sliver of the row width. Any field carrying that grouped reference now
// counts as a result field regardless of whether it also has a unit.
function isResultField(field) {
  if (!field || typeof field !== "object") return false;
  return (
    Boolean(field.referenceRange) ||
    Boolean(field.referenceTag) ||
    Boolean(field.unit) ||
    Array.isArray(field.referenceValue)
  );
}
function hasEvaluableStatus(field) {
  return Boolean(field?.referenceTag);
}

function getSectionEntries(sectionData) {
  return Object.entries(sectionData).filter(([key]) => key !== "__showTitle");
}

// Meta keys that live alongside the result sections on `report` but aren't
// sections themselves.
const REPORT_META_KEYS = new Set(["_id", "name", "reportDate", "sampleCollectionDate"]);

// Turns a relative weight into a flexible column: flexBasis:0 + flexGrow:weight
// shares the row's width proportionally between columns, and flexShrink:1
// lets a column that's given too little room shrink instead of forcing its
// Text to overflow past its edge — long values wrap onto extra lines
// instead of getting cropped at the column boundary.
function colFlex(weight) {
  return { flexBasis: 0, flexGrow: weight, flexShrink: 1 };
}

// field.referenceTiers is an array of GROUPS — [{ group, rows }] — where
// `group` is null for a "simple" (ungrouped) standard range, or a label
// like "Male" / "Female" / "18y – 60y" for gender/age scoped ranges. Not
// every report carries this (older/simple submissions only have a single
// referenceRange/referenceTag), so it's an optional richer view of the
// same match, checked first when present.
function flattenTierGroups(groups) {
  const lines = [];
  groups.forEach((g) => {
    if (g.group) lines.push({ type: "header", label: g.group });
    (g.rows || []).forEach((r) => lines.push({ type: "row", ...r }));
  });
  return lines;
}

// field.referenceValue (for a keyvalue-scoped text/textarea field) may come
// through as an array of GROUPS — [{ header, pairs: [{ key, value }] }] —
// where `header` is optional.
function flattenKeyValueGroups(groups) {
  const lines = [];
  groups.forEach((g) => {
    if (g.header) lines.push({ type: "header", label: g.header });
    (g.pairs || []).forEach((p) => lines.push({ type: "row", key: p.key, value: p.value }));
  });
  return lines;
}

// Status rendered as a bordered box with bold uppercase text — no color,
// just whatever label was typed on the matched tier.
function StatusBoxPDF({ label }) {
  if (!label) return <Text style={s.statusDash}>—</Text>;
  return (
    <View style={s.statusBox}>
      <Text style={s.statusTxt}>{label.toUpperCase()}</Text>
    </View>
  );
}

// A Key-Value Pair reference — stacked rows with a border-top divider
// between them, no outer box of its own. The parent cell hands this
// component the full cell area with zero padding so each row's own
// padding + border-top stretches edge-to-edge across the cell. A header
// band is only rendered for groups that were actually given one.
function RefKeyValueBoxPDF({ groups }) {
  const lines = flattenKeyValueGroups(groups);
  return (
    <View style={{ width: "100%" }}>
      {lines.map((line, i) =>
        line.type === "header" ? (
          <View
            key={i}
            style={{
              borderTop: i > 0 ? `1 solid ${LINE}` : undefined,
              backgroundColor: HEAD_BG,
              paddingVertical: 2,
              paddingHorizontal: 5,
            }}
          >
            <Text
              style={{
                fontSize: 7,
                fontFamily: "Helvetica-Bold",
                color: BLACK,
                textAlign: "center",
                textTransform: "uppercase",
              }}
            >
              {line.label}
            </Text>
          </View>
        ) : (
          <View
            key={i}
            style={{
              borderTop: i > 0 ? `1 solid ${LINE}` : undefined,
              flexDirection: "row",
            }}
          >
            <View
              style={{
                flexBasis: 0,
                flexGrow: 1,
                flexShrink: 1,
                borderRight: `1 solid ${LINE}`,
                paddingVertical: 3,
                paddingHorizontal: 5,
              }}
            >
              <Text style={{ fontSize: 7.5, fontFamily: "Helvetica", color: BLACK }}>{line.key}</Text>
            </View>
            <View
              style={{
                flexBasis: 0,
                flexGrow: 1,
                flexShrink: 1,
                paddingVertical: 3,
                paddingHorizontal: 5,
              }}
            >
              <Text style={{ fontSize: 7.5, fontFamily: "Helvetica", color: BLACK }}>{line.value}</Text>
            </View>
          </View>
        ),
      )}
    </View>
  );
}

// A number field's full reference table, when present. Every group
// defined on the field's standard range is rendered, with the row the
// patient's actual value landed in getting ABNORMAL_BG's neutral gray
// fill, bold text, and a plain tick mark next to the tier name —
// grayscale only, matching this report's black-ink-on-white-paper theme.
function RefTierBoxPDF({ groups, smart = true }) {
  const lines = flattenTierGroups(groups);
  return (
    <View style={{ width: "100%" }}>
      {lines.map((line, i) => {
        const matched = smart && line.matched;
        return line.type === "header" ? (
          <View
            key={i}
            style={{
              borderTop: i > 0 ? `1 solid ${LINE}` : undefined,
              backgroundColor: HEAD_BG,
              paddingVertical: 2,
              paddingHorizontal: 5,
            }}
          >
            <Text
              style={{
                fontSize: 7,
                fontFamily: "Helvetica-Bold",
                color: BLACK,
                textAlign: "center",
                textTransform: "uppercase",
              }}
            >
              {line.label}
            </Text>
          </View>
        ) : (
          <View
            key={i}
            style={{
              borderTop: i > 0 ? `1 solid ${LINE}` : undefined,
              backgroundColor: matched ? ABNORMAL_BG : undefined,
              flexDirection: "row",
            }}
          >
            <View
              style={{
                flexBasis: 0,
                flexGrow: 1,
                flexShrink: 1,
                borderRight: `1 solid ${LINE}`,
                paddingVertical: 2,
                paddingHorizontal: 5,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Text
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  fontSize: 7.5,
                  fontFamily: matched ? "Helvetica-Bold" : "Helvetica",
                  color: BLACK,
                }}
              >
                {line.label}
              </Text>
              {matched && (
                <Text style={{ flexShrink: 0, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: BLACK }}>✓</Text>
              )}
            </View>
            <View
              style={{
                flexBasis: 0,
                flexGrow: 1,
                flexShrink: 1,
                paddingVertical: 2,
                paddingHorizontal: 5,
              }}
            >
              <Text style={{ fontSize: 7.5, fontFamily: matched ? "Helvetica-Bold" : "Helvetica", color: BLACK }}>
                {line.range}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function PDFSection({ sectionName, sectionData, index, showHeader, smart = true }) {
  const entries = getSectionEntries(sectionData);
  const resultEntries = entries.filter(([, v]) => isResultField(v));
  const plainEntries = entries.filter(([, v]) => !isResultField(v));
  const hasUnits = resultEntries.some(([, v]) => Boolean(v.unit));
  const hasStatus = smart && resultEntries.some(([, v]) => hasEvaluableStatus(v));

  // Parameter/Result/Unit trimmed down and the freed-up space handed to
  // Ref. Range, since that column carries the full tier/key-value table.
  const W = hasUnits
    ? hasStatus
      ? { param: 22, result: 12, unit: 8, ref: 38, status: 20 }
      : { param: 24, result: 14, unit: 10, ref: 52 }
    : hasStatus
      ? { param: 24, result: 14, ref: 42, status: 20 }
      : { param: 26, result: 18, ref: 56 };

  return (
    <View style={s.sectionWrap}>
      {showHeader && (
        <View style={s.sectionHead}>
          <View style={s.sectionBadge}>
            <Text style={s.sectionBadgeTxt}>{String.fromCharCode(65 + index)}</Text>
          </View>
          <Text style={s.sectionName}>{sectionName}</Text>
        </View>
      )}

      {resultEntries.length > 0 && (
        <View>
          <View style={s.tableHead}>
            <Text style={[s.th, colFlex(W.param)]}>Parameter</Text>
            <Text style={[s.th, colFlex(W.result)]}>Result</Text>
            {hasUnits && <Text style={[s.th, colFlex(W.unit)]}>Unit</Text>}
            <Text style={[hasStatus ? s.th : s.thLast, colFlex(W.ref)]}>Reference Range</Text>
            {hasStatus && <Text style={[s.thLast, colFlex(W.status)]}>Status</Text>}
          </View>
          {resultEntries.map(([name, field], i) => {
            const value = String(field.value ?? "");
            const unit = field.unit || "";
            const tierGroups =
              Array.isArray(field.referenceTiers) && field.referenceTiers.length ? field.referenceTiers : null;
            const ref = tierGroups ? null : field.referenceRange || field.referenceValue || "";
            const refIsKV = !tierGroups && Array.isArray(ref);
            const status = getStatus(field);
            return (
              <View key={name} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]} wrap={!(tierGroups || refIsKV)}>
                <Text style={[s.td, colFlex(W.param)]}>{name}</Text>
                <Text style={[s.td, s.tdBold, colFlex(W.result)]}>{value || "—"}</Text>
                {hasUnits && <Text style={[s.td, s.tdMuted, colFlex(W.unit)]}>{unit || "—"}</Text>}
                {tierGroups ? (
                  <View style={[hasStatus ? s.td : s.tdLast, colFlex(W.ref), { padding: 0 }]}>
                    <RefTierBoxPDF groups={tierGroups} smart={smart} />
                  </View>
                ) : refIsKV ? (
                  <View style={[hasStatus ? s.td : s.tdLast, colFlex(W.ref), { padding: 0 }]}>
                    <RefKeyValueBoxPDF groups={ref} />
                  </View>
                ) : (
                  <Text style={[hasStatus ? s.td : s.tdLast, s.tdMuted, colFlex(W.ref)]}>{ref || "—"}</Text>
                )}
                {hasStatus && (
                  <View style={[s.tdLast, colFlex(W.status)]}>
                    <StatusBoxPDF label={status} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {plainEntries.length > 0 && (
        <View style={resultEntries.length > 0 ? { borderTop: `1 solid ${LINE}` } : undefined}>
          {plainEntries.map(([name, field], i) => {
            const val = Array.isArray(field.value) ? field.value.join(", ") : String(field.value ?? "—");
            const isKV = Array.isArray(field.referenceValue);
            return (
              <View key={name} style={[s.tableRow, i % 2 === 1 && s.tableRowAlt]} wrap={!isKV}>
                <Text style={[s.td, colFlex(32)]}>{name}</Text>
                {isKV ? (
                  <View style={{ ...colFlex(68), flexDirection: "row", alignItems: "flex-start" }}>
                    <Text style={[s.tdBold, { fontSize: 9, color: BLACK, padding: "5 8" }]}>{val || "—"}</Text>
                    <View style={{ flex: 1 }}>
                      <RefKeyValueBoxPDF groups={field.referenceValue} />
                    </View>
                  </View>
                ) : (
                  <View style={{ ...colFlex(68), flexDirection: "row", alignItems: "center", padding: "5 8" }}>
                    <Text style={[s.tdBold, { fontSize: 9, color: BLACK }]}>{val || "—"}</Text>
                  </View>
                )}
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
  isPad = false,
  smart = true,
}) {
  const sections = Object.entries(report).filter(
    ([key, val]) =>
      !REPORT_META_KEYS.has(key) && val !== null && typeof val === "object" && !Array.isArray(val) && !val.$oid,
  );

  const mainFields = [
    { label: "Patient Name", value: patient.name },
    { label: "Age / Gender", value: [patient.age, patient.gender].filter(Boolean).join(" · ") },
    { label: "Contact", value: patient.contact },
    { label: "Sample Date", value: patient.sampleDate },
    { label: "Report Date", value: patient.reportDate },
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
          <View style={s.letterhead}>
            <View>
              <Text style={s.labName}>{labInfo.name}</Text>
              {labInfo.tagline ? <Text style={s.labTagline}>{labInfo.tagline}</Text> : null}
              <Text style={s.labAddr}>{labInfo.address}</Text>
            </View>
            <View style={s.headerRight}>
              <Text style={s.headerLine}>Tel: {labInfo.phone}</Text>
              {labInfo.email ? <Text style={s.headerLine}>{labInfo.email}</Text> : null}
              {labInfo.regNo ? <Text style={s.headerLine}>Reg. No: {labInfo.regNo}</Text> : null}
            </View>
          </View>
        )}

        <View style={s.titleBar}>
          <Text style={s.titleText}>{reportName}</Text>
          {shortId ? (
            <Text style={s.invoiceText}>
              {isIndoor ? "Admission No" : "Invoice No"}: {shortId}
            </Text>
          ) : null}
        </View>

        <View style={s.patientTable}>
          <View style={s.patientRow}>
            {mainFields.map(({ label, value }, i) => (
              <View key={label} style={i === mainFields.length - 1 ? s.patientCellLast : s.patientCell}>
                <Text style={s.cellLabel}>{label}</Text>
                <Text style={s.cellValue}>{value || "—"}</Text>
              </View>
            ))}
          </View>
          <View style={s.referredRow}>
            <Text style={[s.cellLabel, { marginBottom: 0 }]}>Referred By</Text>
            <Text style={[s.cellValue, { fontSize: 9 }]}>{patient.referredBy || "—"}</Text>
          </View>
        </View>

        {sections.map(([sectionName, sectionData], i) => (
          <PDFSection
            key={sectionName}
            sectionName={sectionName}
            sectionData={sectionData}
            index={i}
            showHeader={sectionData.__showTitle !== false}
            smart={smart}
          />
        ))}

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
