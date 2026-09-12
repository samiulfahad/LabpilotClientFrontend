/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 */
import { useEffect, useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Printer, Download, Phone, Mail, MapPin, Share2, Wallet, CheckCircle, FileText } from "lucide-react";
import QRCode from "qrcode";
import { pdf, Document, Page, View, Text, Image, StyleSheet, Link, Svg, Path } from "@react-pdf/renderer";
import invoiceService from "../../../api/invoice";
import { useAuthStore } from "../../../store/authStore";
import LoadingScreen from "../../../components/loadingPage";
import Popup from "../../../components/popup";

// ─── Constants ────────────────────────────────────────────────────────────────

/** LAB_INFO is derived from the auth store at runtime — see PrintInvoice component. */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0 }).format(
    isNaN(Number(n)) ? 0 : Number(n),
  );

const formatDateTime = (ts) => {
  const d = new Date(ts);
  const h = d.getHours();
  return {
    date: `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`,
    time: `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")}${h >= 12 ? "PM" : "AM"}`,
  };
};

// "12PM, 10th Sep 2026" — Date and Time merged into a single "Time" field,
// with an ordinal suffix on the day.
const formatDateTimeMerged = (ts) => {
  const d = new Date(ts);
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = d.toLocaleString("default", { month: "short" });
  const year = d.getFullYear();
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hour12}:${minutes}${ampm}, ${day}${suffix} ${month} ${year}`;
};

// Gender shown as a single letter next to the patient's name — "male"/"female"
// (or any casing/variant starting with m/f) collapses to M/F; anything else
// (e.g. "other", blank) is left as-is rather than guessed at.
const formatGenderShort = (gender) => {
  if (!gender) return "N/A";
  const g = String(gender).trim().toLowerCase();
  if (g.startsWith("m")) return "M";
  if (g.startsWith("f")) return "F";
  return gender;
};

// ── Age helpers ──────────────────────────────────────────────────────────────
// Patient age is stored/sent as { years, months, days } (see CreateInvoice.jsx
// and invoiceRoutes.js). Format it into a compact single string here —
// "24years 5months 10days" — skipping any zero/blank part. Also tolerates the
// legacy shape (a bare number/string, from invoices created before this
// change) by falling back to "<n> years".
const formatAge = (age) => {
  if (age === null || age === undefined || age === "") return "N/A";

  // Legacy shape: a plain number or numeric string.
  if (typeof age === "number" || typeof age === "string") {
    return `${age} years`;
  }

  // Current shape: { years, months, days }.
  const years = parseInt(age.years, 10) || 0;
  const months = parseInt(age.months, 10) || 0;
  const days = parseInt(age.days, 10) || 0;
  const parts = [];
  if (years > 0) parts.push(`${years}years`);
  if (months > 0) parts.push(`${months}months`);
  if (days > 0) parts.push(`${days}days`);
  return parts.length > 0 ? parts.join(" ") : "0years";
};

// Compact age for the patient header row — same { years, months, days }
// shape as formatAge above (and same legacy number/string fallback).
// - Only one component present (e.g. just years): spelled out in full,
//   e.g. "2 years", "5 Months", "10 Days".
// - More than one component present: abbreviated and comma-separated,
//   e.g. "2y, 5M, 10D".
const formatAgeCompact = (age) => {
  if (age === null || age === undefined || age === "") return "N/A";

  if (typeof age === "number" || typeof age === "string") {
    return `${age} years`;
  }

  const years = parseInt(age.years, 10) || 0;
  const months = parseInt(age.months, 10) || 0;
  const days = parseInt(age.days, 10) || 0;
  const componentCount = [years, months, days].filter((n) => n > 0).length;

  if (componentCount === 0) return "0 Days";

  if (componentCount === 1) {
    if (years > 0) return `${years} years`;
    if (months > 0) return `${months} Months`;
    return `${days} Days`;
  }

  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}M`);
  if (days > 0) parts.push(`${days}D`);
  return parts.join(", ");
};

/** Normalise raw data from either router state or API response into a consistent shape. */
const normaliseInvoice = (raw) => ({
  invoiceId: raw.invoiceId || "",
  createdAt: raw.createdAt || Date.now(),
  patient: {
    name: raw.patient?.name || "N/A",
    gender: raw.patient?.gender || "N/A",
    // Kept as-is (object or legacy number/string) — formatAge() handles both
    // shapes at display time, in both the HTML card and the PDF.
    age: raw.patient?.age ?? null,
    contactNumber: raw.patient?.contactNumber || "N/A",
  },
  // Only field consulted for the "Doctor's Name" display — referrer is
  // never fetched or stored here since it isn't shown anywhere on this view.
  doctor: raw.doctor || null,
  tests: Array.isArray(raw.tests) ? raw.tests : [],
  products: Array.isArray(raw.products) ? raw.products : [],
  amount: {
    initial: Number(raw.amount?.initial) || 0,
    referrerDiscount: Number(raw.amount?.referrerDiscount) || 0,
    labAdjustment: Number(raw.amount?.labAdjustment) || 0,
    afterLabAdjustmentAndReferrerDiscount: Number(raw.amount?.afterLabAdjustmentAndReferrerDiscount) || 0,
    final: Number(raw.amount?.final) || 0,
    paid: Number(raw.amount?.paid) || 0,
    invoiceFee: Number(raw.amount?.invoiceFee) || 0,
  },
  reportLink: raw.reportLink || raw.link || "https://scan.labpilotpro.com",
});

// Builds the "Doctor's Name" display string — sourced only from `doctor`
// (name + degree). Referrer is never consulted for this field.
const getDoctorNameLabel = ({ doctor }) => {
  if (!doctor) return null;
  // doctor may arrive as a plain string ("Dr. Kawsar Ahmed") from some
  // invoice payloads, or as an object ({ name, degree }) from others.
  if (typeof doctor === "string") return doctor.trim() || null;
  if (!doctor.name) return null;
  return doctor.degree ? `${doctor.name}, ${doctor.degree}` : doctor.name;
};

/** Derive display flags from the normalised invoice. */
const getPricingFlags = ({ amount, doctor }) => {
  const due = Math.max(0, amount.final - amount.paid);
  const doctorNameLabel = getDoctorNameLabel({ doctor });
  // Subtotal = sum of line items (amount.initial) + the online invoice fee,
  // so it reflects everything charged before discounts/adjustments come off.
  const subtotalValue = amount.initial + amount.invoiceFee;
  return {
    showReferrerDiscount: amount.referrerDiscount > 0,
    showInvoiceFee: amount.invoiceFee > 0,
    showLabAdjustment: amount.labAdjustment > 0,
    // Show the Subtotal row whenever it would differ from the raw item sum
    // (a fee was added) or there's a deduction below it to subtotal from.
    showSubtotal: amount.referrerDiscount > 0 || amount.labAdjustment > 0 || amount.invoiceFee > 0,
    subtotalValue,
    showDoctorName: Boolean(doctorNameLabel),
    doctorNameLabel,
    due,
    isFullyPaid: due === 0,
  };
};

// Deduction/addition rows shown above the Total (Online Report Fee, Subtotal,
// Media Discount, Lab Adjustment) — built once from the flags above so the
// PDF and on-screen card both just .map() this instead of repeating four
// near-identical conditional blocks each.
const getPricingRows = (invoice) => {
  const { amount } = invoice;
  const flags = getPricingFlags(invoice);
  return [
    flags.showInvoiceFee && { key: "fee", label: "Online Report Fee", value: `+ ${fmt(amount.invoiceFee)}` },
    flags.showSubtotal && { key: "subtotal", label: "Subtotal", value: fmt(flags.subtotalValue) },
    flags.showReferrerDiscount && {
      key: "discount",
      label: "Media Discount",
      value: `- ${fmt(amount.referrerDiscount)}`,
    },
    flags.showLabAdjustment && {
      key: "labadj",
      label: "Lab Adjustment",
      value: `- ${fmt(amount.labAdjustment)}`,
    },
  ].filter(Boolean);
};

// Lab name can be arbitrarily long (multi-branch names, English+Bangla mixes).
// Instead of truncating with an ellipsis, shrink the font a step at a time and
// let it wrap — never crop. Sizes bumped up a step across the board (and the
// wrap width widened) so long names read bigger before they have to shrink.
// Same thresholds reused for the PDF (point sizes).
const getLabNameHtmlSizeClass = (name) => {
  const len = name?.length || 0;
  if (len > 40) return "text-lg";
  if (len > 26) return "text-xl";
  return "text-2xl";
};

const getLabNamePdfFontSize = (name) => {
  const len = name?.length || 0;
  if (len > 40) return 12;
  if (len > 26) return 14;
  return 16;
};

// Rasterizes the lab's SVG logo markup (decoration.logo) into a PNG data URL
// so it can be used as a react-pdf <Image> source — react-pdf's Image only
// accepts raster sources (PNG/JPG), not arbitrary SVG markup, so this is
// necessary for the PDF version of the logo. The on-screen HTML card renders
// the SVG markup directly instead (see InvoiceCard) and doesn't need this.
const svgToPngDataUrl = (svgMarkup, size = 128) =>
  new Promise((resolve, reject) => {
    try {
      const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        // Fit the logo into a square canvas, preserving aspect ratio and
        // centering it, so non-square logos don't get stretched.
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    } catch (e) {
      reject(e);
    }
  });

// ── Axios‑native network error detection (same as all other pages) ──────────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// ─── PDF styles ───────────────────────────────────────────────────────────────
// Page carries the symmetric outer margin (A5 print-safe); every section below
// is inset from that shared padding instead of its own horizontal padding, so
// left/right margins stay identical all the way down the page.

const PAGE_MARGIN = 18;
// Shared vertical gap between the three stacked rows in the patient box
// (Invoice ID/Age, Name+Gender/Contact+Time, and Doctor's Name) — one
// constant so all three gaps stay equal instead of drifting independently.
const PATIENT_ROW_GAP = 6;

const pdf$ = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#000000",
    paddingTop: PAGE_MARGIN,
    paddingBottom: PAGE_MARGIN,
    paddingLeft: PAGE_MARGIN,
    paddingRight: PAGE_MARGIN,
  },
  // header — centered, white bg, black text. Invoice ID / date / time no
  // longer live up here — ID moved into the patient grid, date/time moved
  // into the patient grid too — so this is now just the lab identity block.
  header: {
    alignItems: "center",
    borderBottom: "1.5 solid #e5e7eb",
    paddingBottom: 5,
    // Positioning context for the absolutely-positioned logo below.
    position: "relative",
  },
  // Pad mode — header is hidden entirely and replaced with blank space equal
  // to the lab's `decoration.invoicePadHeaderHeight`, so a pre-printed pad
  // (with the lab's letterhead already on paper) lines up correctly. No
  // border/padding here — the letterhead area must stay completely blank.
  headerPadSpacer: {},
  // Footer counterpart of headerPadSpacer — blank space equal to the lab's
  // `decoration.invoicePadFooterHeight`, reserved at the very bottom of the
  // page (below the pricing section) in pad mode so a pre-printed pad's
  // footer letterhead/branding area isn't overwritten. No border/padding —
  // must stay completely blank, same as the header spacer.
  footerPadSpacer: {},
  // Logo pinned to the header's top-left corner via position:"absolute"
  // (react-pdf/Yoga honors this). Taking it out of the normal flow means
  // its footprint can never push, shrink, or otherwise resize the labName/
  // poweredBy block or any other sibling — it just renders on its own
  // stacking layer (zIndex) on top of the header background. Sized well up
  // (46pt vs the old inline 26pt) since growing it no longer costs anything.
  logoBoxAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 46,
    height: 46,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  logoTextBig: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 16 },
  // Actual lab logo (rasterized from decoration.logo SVG) — same footprint/
  // positioning as logoBoxAbsolute so swapping between them doesn't shift anything.
  logoImageAbsolute: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 46,
    height: 46,
    objectFit: "contain",
    zIndex: 10,
  },
  logoTextBlock: { alignItems: "center", width: "100%" },
  // fontSize overridden per-invoice via getLabNamePdfFontSize; full width and
  // centered now that it's its own row below the logo, so long names have
  // the entire page width to wrap into before needing to shrink.
  labName: { color: "#000000", fontFamily: "Helvetica-Bold", textAlign: "center", width: "100%", lineHeight: 1.15 },
  poweredBy: { color: "#6b7280", fontSize: 6.5, marginTop: 1, textAlign: "center" },
  labAddress: { color: "#000000", fontSize: 8, marginTop: 4, textAlign: "center" },
  labContact: { color: "#000000", fontSize: 7.5, marginTop: 2, textAlign: "center" },
  // sections — horizontal inset now comes solely from the page padding
  section: { paddingTop: 12, paddingBottom: 12, borderBottom: "1 solid #e5e7eb" },
  sectionLast: { paddingTop: 4 },
  // Patient info block — no border; spacing/padding still separates it from
  // the header above and the item table below. Tightened further (6/6/6 ->
  // 3/3/3) so the gap to the header above and the item table below is
  // minimal on print/download/share output.
  patientBox: {
    marginTop: 3,
    marginBottom: 3,
    padding: 3,
  },
  // Invoice ID and Age stack in the same left column (Age lines up directly
  // under Invoice ID). Name/Gender and Contact/Time stack in the column to
  // its right, in the same way. Doctor's Name (when present) still spans
  // the full box width below both columns.
  patientRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  patientGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  patientFieldFull: { width: "100%", marginBottom: 6 },
  patientHeaderRow: { flexDirection: "row", alignItems: "flex-start", width: "100%" },
  patientIdCol: { flexShrink: 0, marginRight: 14 },
  patientIdField: { marginBottom: PATIENT_ROW_GAP },
  patientMainCol: { flex: 1 },
  patientTopRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: PATIENT_ROW_GAP },
  patientTopName: { flexGrow: 1, flexShrink: 1, marginRight: 14 },
  patientTopGender: { flexShrink: 0 },
  // flexShrink: 0 + marginRight on Contact keeps it at its natural text
  // width and spaced from Time — Yoga's default flexShrink: 1 would
  // otherwise squeeze the row to fit, wrapping "01726678987" mid-word.
  // Time also gets flexShrink: 0 now (no maxWidth) so it holds its natural
  // width and stays on one line with its label instead of wrapping — the
  // patientBox/QR sizing below was trimmed to make room for that.
  patientSubRow: { flexDirection: "row", alignItems: "flex-start" },
  patientSubField: { flexShrink: 0, marginRight: 14 },
  patientSubFieldWrap: { flexShrink: 0 },
  fieldInline: { fontSize: 8.5, color: "#000000" },
  fieldLabelLine: { fontFamily: "Helvetica", fontSize: 8.5, color: "#000000" },
  fieldValueLine: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: "#000000" },
  // QR — sized to sit level with the patient-info text block rather than
  // towering over it now that the box has a fixed, compact height. Trimmed
  // down a bit further (46 -> 40, marginLeft 16 -> 10) to free up horizontal
  // room for the now-unwrapped Time field beside it.
  qrContainer: { alignItems: "center", justifyContent: "center", marginLeft: 10 },
  qrImage: { width: 40, height: 40 },
  qrLabel: { fontSize: 6, color: "#000000", textAlign: "center", marginTop: 2 },
  dlBtnWrapper: { marginTop: 4, position: "relative" },
  dlBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 4,
    paddingTop: 2.5,
    paddingBottom: 2.5,
    paddingLeft: 6,
    paddingRight: 6,
  },
  dlBtnInner: { flexDirection: "row", alignItems: "center" },
  dlBtnIcon: { width: 6, height: 6, marginRight: 2.5 },
  dlBtnOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
  dlBtnText: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 6 },
  // table
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", padding: "5 8", borderBottom: "1 solid #e5e7eb" },
  // Row vertical padding trimmed further (2.5 -> 1) so more test/product
  // lines fit on a single A5 page before the pricing summary spills onto a
  // second page. Header row above is untouched so it stays readable.
  tableRow: { flexDirection: "row", padding: "1 8", borderBottom: "1 solid #f3f4f6" },
  tableRowEven: { flexDirection: "row", padding: "1 8", borderBottom: "1 solid #f3f4f6", backgroundColor: "#fafafa" },
  colNum: { width: "8%", fontSize: 8, color: "#000000" },
  colName: { flex: 1, fontSize: 8, color: "#000000" },
  colPrice: { width: "25%", fontSize: 8, textAlign: "right", fontFamily: "Helvetica-Bold", color: "#000000" },
  colHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: "#000000",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  // pricing
  pricingBox: { marginTop: 10, alignItems: "flex-end" },
  pricingInner: { width: 220 },
  pricingRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  pricingLabel: { fontSize: 8, color: "#000000" },
  // These were five identically-defined styles (fee/neg/paid/due all had the
  // exact same fontSize/weight/color) — collapsed into one shared style.
  pricingValue: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#000000" },
  divider: { borderTop: "1.5 solid #d1d5db", marginVertical: 5 },
  dashedDivider: { borderTop: "1 dashed #d1d5db", marginVertical: 5 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  totalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#000000" },
  totalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#000000" },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 6,
    padding: "4 8",
    backgroundColor: "#dcfce7",
    borderRadius: 4,
  },
  paidBadgeText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#000000" },
});

// ─── PDF Document ─────────────────────────────────────────────────────────────

// `padMode` — when true, the lab identity header (logo/name/address/contact)
// is replaced with blank space sized to `decoration.invoicePadHeaderHeight`,
// and blank space sized to `decoration.invoicePadFooterHeight` is reserved
// at the bottom of the page, so the document prints cleanly onto pre-printed
// letterhead pad paper that already carries the lab's branding in those
// areas. Assumes the stored heights are already in points (react-pdf's
// native unit) — adjust the raw values here if they're actually stored in mm.
//
// `logoPngUrl` — PNG data URL rasterized from the lab's decoration.logo SVG
// (see svgToPngDataUrl above). Falls back to the "LP" placeholder box when
// the lab has no logo saved yet or rasterization hasn't resolved.
const InvoicePDF = ({ invoice, qrCodeUrl, labInfo, logoPngUrl, hideDownloadButton = false, padMode = false }) => {
  const { patient, amount, tests, products, reportLink, invoiceId, createdAt } = invoice;
  const flags = getPricingFlags(invoice);
  const padHeaderHeight = labInfo.decoration?.invoicePadHeaderHeight ?? 0;
  const padFooterHeight = labInfo.decoration?.invoicePadFooterHeight ?? 0;

  return (
    <Document>
      <Page size="A5" style={pdf$.page}>
        {/* Header — normal mode shows the lab identity block; pad mode
            leaves the equivalent space blank for pre-printed letterhead. */}
        {padMode ? (
          <View style={[pdf$.headerPadSpacer, { height: padHeaderHeight }]} />
        ) : (
          <View style={pdf$.header}>
            {/* Absolutely positioned — sits on its own layer, never affects
                the layout/size of labName or anything else in the header. */}
            {logoPngUrl ? (
              <Image style={pdf$.logoImageAbsolute} src={logoPngUrl} />
            ) : (
              <View style={pdf$.logoBoxAbsolute}>
                <Text style={pdf$.logoTextBig}>LP</Text>
              </View>
            )}
            <View style={pdf$.logoTextBlock}>
              <Text style={[pdf$.labName, { fontSize: getLabNamePdfFontSize(labInfo.name) }]}>{labInfo.name}</Text>
              {/* Tagline comes from decoration.tagline — omitted entirely
                  when the lab hasn't set one (no "Powered by LabPilot Pro"
                  placeholder). */}
              {labInfo.tagline && <Text style={pdf$.poweredBy}>{labInfo.tagline}</Text>}
            </View>
            <Text style={pdf$.labAddress}>{labInfo.address}</Text>
            <Text style={pdf$.labContact}>
              {labInfo.phoneDisplay} • {labInfo.email}
            </Text>
          </View>
        )}

        {/* Patient — boxed so it reads as its own distinct block */}
        <View style={pdf$.patientBox}>
          <View style={pdf$.patientRow}>
            <View style={pdf$.patientGrid}>
              <View style={[pdf$.patientHeaderRow, flags.showDoctorName && { marginBottom: PATIENT_ROW_GAP }]}>
                <View style={pdf$.patientIdCol}>
                  <PDFField label="Invoice ID" value={invoiceId || "N/A"} style={pdf$.patientIdField} />
                  <PDFField label="Age" value={formatAgeCompact(patient.age)} />
                </View>
                <View style={pdf$.patientMainCol}>
                  <View style={pdf$.patientTopRow}>
                    <PDFField label="Name" value={patient.name} style={pdf$.patientTopName} />
                    <PDFField label="Gender" value={formatGenderShort(patient.gender)} style={pdf$.patientTopGender} />
                  </View>
                  <View style={pdf$.patientSubRow}>
                    <PDFField label="Contact" value={patient.contactNumber} style={pdf$.patientSubField} />
                    <PDFField label="Time" value={formatDateTimeMerged(createdAt)} style={pdf$.patientSubFieldWrap} />
                  </View>
                </View>
              </View>
              {flags.showDoctorName && (
                <PDFField label="Doctor's Name" value={flags.doctorNameLabel} style={pdf$.patientFieldFull} />
              )}
            </View>
            {qrCodeUrl && (
              <View style={pdf$.qrContainer}>
                <Image style={pdf$.qrImage} src={qrCodeUrl} />
                <Text style={pdf$.qrLabel}>Scan to download Reports</Text>
                {!hideDownloadButton && (
                  <View style={pdf$.dlBtnWrapper}>
                    <View style={pdf$.dlBtn}>
                      <View style={pdf$.dlBtnInner}>
                        <Svg style={pdf$.dlBtnIcon} viewBox="0 0 24 24">
                          <Path d="M12 16l-6-6h4V4h4v6h4l-6 6z" fill="#ffffff" />
                          <Path d="M20 18H4v2h16v-2z" fill="#ffffff" />
                        </Svg>
                        <Text style={pdf$.dlBtnText}>Click to Download Reports</Text>
                      </View>
                    </View>
                    <Link src={reportLink} style={pdf$.dlBtnOverlay}>
                      <Text> </Text>
                    </Link>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Tests & Products & Pricing */}
        <View style={pdf$.sectionLast}>
          {/* Smart header */}
          <View style={pdf$.tableHeader}>
            <Text style={[pdf$.colNum, pdf$.colHeader]}>#</Text>
            <Text style={[pdf$.colName, pdf$.colHeader]}>
              {tests.length > 0 && products.length > 0 ? "Test / Product" : tests.length > 0 ? "Test" : "Product"}
            </Text>
            <Text style={[pdf$.colPrice, pdf$.colHeader]}>Price</Text>
          </View>

          {/* Flat unified list — tests first, then products, sequentially numbered */}
          {[
            ...tests.map((t, i) => ({ n: i + 1, name: t.name, price: fmt(t.price) })),
            ...products.map((p, i) => {
              const qty = p.quantity ?? 1;
              const unitPrice = p.price ?? 0;
              return {
                n: tests.length + i + 1,
                name: qty > 1 ? `${p.name} (${qty} × ${fmt(unitPrice)})` : p.name,
                price: fmt(unitPrice * qty),
              };
            }),
          ].map((row, i) => (
            <View key={i} style={i % 2 === 0 ? pdf$.tableRow : pdf$.tableRowEven}>
              <Text style={pdf$.colNum}>{row.n}</Text>
              <Text style={pdf$.colName}>{row.name}</Text>
              <Text style={pdf$.colPrice}>{row.price}</Text>
            </View>
          ))}

          {/* Pricing summary — Online Invoice Fee, then Subtotal, then any
              deductions (Media Discount / Lab Adjustment), then Total. Rows
              come from getPricingRows() instead of four repeated blocks. */}
          <View style={pdf$.pricingBox}>
            <View style={pdf$.pricingInner}>
              {getPricingRows(invoice).map((row) => (
                <PDFPricingRow key={row.key} label={row.label} value={row.value} />
              ))}
              <View style={pdf$.divider} />
              <View style={pdf$.totalRow}>
                <Text style={pdf$.totalLabel}>Total Amount</Text>
                <Text style={pdf$.totalValue}>{fmt(amount.final)}</Text>
              </View>
              <View style={pdf$.dashedDivider} />
              <PDFPricingRow label="Paid Amount" value={fmt(amount.paid)} />
              {!flags.isFullyPaid && <PDFPricingRow label="Due Amount" value={fmt(flags.due)} />}
              {flags.isFullyPaid && (
                <View style={pdf$.paidBadge}>
                  <Text style={pdf$.paidBadgeText}>✓ FULLY PAID</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Footer — pad mode only: blank space reserved at the bottom of the
            page for a pre-printed pad's footer letterhead/branding, sized to
            decoration.invoicePadFooterHeight. Rendered as a sibling after the
            main content rather than absolutely positioned, so it simply adds
            to the page's natural flow/height instead of overlapping content. */}
        {padMode && <View style={[pdf$.footerPadSpacer, { height: padFooterHeight }]} />}
      </Page>
    </Document>
  );
};

// Small stateless helpers used only inside the PDF
const PDFField = ({ label, value, style }) => (
  <View style={style}>
    <Text style={pdf$.fieldInline}>
      <Text style={pdf$.fieldLabelLine}>{label}: </Text>
      <Text style={pdf$.fieldValueLine}>{value}</Text>
    </Text>
  </View>
);

const PDFPricingRow = ({ label, value, valueStyle = pdf$.pricingValue }) => (
  <View style={pdf$.pricingRow}>
    <Text style={pdf$.pricingLabel}>{label}</Text>
    <Text style={valueStyle}>{value}</Text>
  </View>
);

// ─── Invoice screen card ──────────────────────────────────────────────────────

const InvoiceCard = ({ invoice, qrCodeUrl, labInfo, downloading = false, sharing = false }) => {
  const { patient, amount, tests, products, reportLink, invoiceId, createdAt } = invoice;
  const flags = getPricingFlags(invoice);
  const showDownloadBtn = downloading || sharing;

  return (
    <div className="bg-white shadow-lg rounded-xl overflow-hidden">
      {/* Header — logo centered above the lab name/tagline block, which now
          spans the full header width so the name gets the whole x-axis to
          itself instead of sharing a row with the logo. */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 relative">
        {/* Logo — absolutely positioned at the top-left corner, sized well
            up independently of the name/address block. position: absolute
            takes it out of normal document flow entirely, so its footprint
            can never push, shrink, or otherwise affect the layout of the
            name block or anything else here — it just renders on its own
            stacking layer (z-10) above the header. */}
        <div className="absolute top-2 left-4 z-10">
          {labInfo.logoSvg ? (
            <div
              className="w-20 h-20 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: labInfo.logoSvg }}
            />
          ) : (
            <div className="w-20 h-20 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-2xl">LP</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center text-center">
          {/* Full width, independent of the logo above — no max-w
              constraint, no shared flex row, so long names have the entire
              header width to wrap into before the size-step-down kicks in. */}
          <div className="w-full text-center">
            <h1 className={`font-bold text-black leading-tight break-words ${getLabNameHtmlSizeClass(labInfo.name)}`}>
              {labInfo.name}
            </h1>
            {/* Tagline comes from decoration.tagline — omitted entirely when
                the lab hasn't set one (no "Powered by LabPilot Pro"
                placeholder). */}
            {labInfo.tagline && <p className="text-gray-500 text-[10px] leading-tight">{labInfo.tagline}</p>}
          </div>
          <div className="mt-1 space-y-1 text-black text-xs">
            <div className="flex items-center justify-center gap-1.5">
              <MapPin className="w-3 h-3 shrink-0" />
              <span>{labInfo.address}</span>
            </div>
            <div className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Phone className="w-3 h-3 shrink-0" />
                <span>{labInfo.phoneDisplay}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 shrink-0" />
                <span>{labInfo.email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Patient — boxed so it reads as its own distinct block. Invoice ID
          stacks above Age in the left column; Name+Gender stacks above
          Contact+Time in the column beside it, so Age lines up directly
          under Invoice ID. Outer py and inner p trimmed (py-4/p-2.5 ->
          py-2/p-1.5) to minimize the gap above and below this section. */}
      <div className="px-6 py-2">
        <div className="flex items-start gap-3 p-1.5">
          <div className="flex-1">
            {/* All three row-gaps in this box — ID→Age, Name/Gender→Contact/Time,
                and header→Doctor's Name — share the same mb-1.5, so this one
                wrapper's bottom margin (only added when Doctor's Name follows)
                keeps every gap equal instead of drifting independently. */}
            <div className={`flex items-start ${flags.showDoctorName ? "mb-1.5" : ""}`}>
              <div className="shrink-0 mr-4">
                <div className="mb-1.5">
                  <PatientField label="Invoice ID" value={invoiceId || "N/A"} />
                </div>
                <PatientField
                  label="Age"
                  value={<span className="whitespace-nowrap">{formatAgeCompact(patient.age)}</span>}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-4 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <PatientField label="Name" value={patient.name} />
                  </div>
                  <PatientField label="Gender" value={formatGenderShort(patient.gender)} />
                </div>
                <div className="flex items-start gap-4">
                  <PatientField
                    label="Contact"
                    value={<span className="whitespace-nowrap">{patient.contactNumber}</span>}
                  />
                  <PatientField
                    label="Time"
                    value={<span className="whitespace-nowrap">{formatDateTimeMerged(createdAt)}</span>}
                  />
                </div>
              </div>
            </div>
            {flags.showDoctorName && <PatientField label="Doctor's Name" value={flags.doctorNameLabel} />}
          </div>
          {qrCodeUrl && (
            <div className="shrink-0 flex flex-col items-center justify-center gap-0.5">
              <img src={qrCodeUrl} alt="QR Code" className="w-14 h-14" />
              <p className="text-[9px] text-black text-center leading-tight">Scan to download Reports</p>
              {showDownloadBtn && (
                <a
                  href={reportLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-semibold rounded transition-colors"
                >
                  <Download className="w-2 h-2" />
                  Click to Download Reports
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tests & Products & Pricing */}
      <div className="px-6 py-2">
        {/* Unified items table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-black uppercase w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-black uppercase">
                  {tests.length > 0 && products.length > 0 ? "Test / Product" : tests.length > 0 ? "Test" : "Product"}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-black uppercase">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ...tests.map((t, i) => ({ n: i + 1, key: t._id || `t${i}`, name: t.name, price: fmt(t.price) })),
                ...products.map((p, i) => {
                  const qty = p.quantity ?? 1;
                  const unitPrice = p.price ?? 0;
                  return {
                    n: tests.length + i + 1,
                    key: p._id || p.productId || `p${i}`,
                    name:
                      qty > 1 ? (
                        <>
                          {p.name}{" "}
                          <span className="text-black font-normal text-xs">
                            ({qty} × {fmt(unitPrice)})
                          </span>
                        </>
                      ) : (
                        p.name
                      ),
                    price: fmt(unitPrice * qty),
                  };
                }),
              ].map((row, i) => (
                <tr key={row.key} className={i % 2 === 1 ? "bg-gray-50/50" : ""}>
                  <td className="px-3 py-1 text-xs text-black">{row.n}</td>
                  <td className="px-3 py-1 text-sm text-black">{row.name}</td>
                  <td className="px-3 py-1 text-sm text-black text-right font-medium">{row.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pricing summary — Online Invoice Fee, then Subtotal, then any
            deductions (Media Discount / Lab Adjustment), then Total. Rows
            come from getPricingRows() instead of four repeated blocks. */}
        <div className="mt-3 flex justify-end">
          <div className="w-64 space-y-1.5">
            {getPricingRows(invoice).map((row) => (
              <PricingRow key={row.key} label={row.label} value={row.value} />
            ))}
            <div className="flex justify-between pt-2 border-t-2 border-gray-200">
              <span className="text-base font-semibold text-black">Total Amount</span>
              <span className="text-lg font-bold text-black">{fmt(amount.final)}</span>
            </div>
            <div className="pt-2 border-t border-dashed border-gray-300 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-black flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-green-600" /> Paid Amount
                </span>
                <span className="font-semibold text-black">{fmt(amount.paid)}</span>
              </div>
              {!flags.isFullyPaid && (
                <PricingRow label="Due Amount" value={fmt(flags.due)} valueClass="font-semibold text-black" />
              )}
              {flags.isFullyPaid && (
                <div className="flex items-center justify-end gap-1.5 py-1 px-2 bg-green-50 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-black text-xs font-semibold tracking-wide uppercase">Fully Paid</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Small stateless helpers used only inside InvoiceCard
const PatientField = ({ label, value }) => (
  <p className="text-sm text-black leading-snug">
    <span className="text-black">{label}:</span> <span className="font-medium text-black">{value}</span>
  </p>
);

const PricingRow = ({ label, value, valueClass = "font-medium text-black" }) => (
  <div className="flex justify-between text-sm">
    <span className="text-black">{label}</span>
    <span className={valueClass}>{value}</span>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const PrintInvoice = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { invoiceId } = useParams();
  const rawLab = useAuthStore((s) => s.lab);

  const labInfo = {
    name: rawLab?.name ?? "LabPilot Pro Diagnostics",
    address: rawLab?.contact?.address ?? "N/A",
    phone: rawLab?.contact?.primary ?? "N/A",
    // Combined phone string for display — "017... , 018..." when there are
    // two distinct numbers (comma-separated), de-duplicated so an identical
    // primary/secondary pair (or a missing secondary) just shows the one
    // number instead of repeating it.
    phoneDisplay:
      [rawLab?.contact?.primary, rawLab?.contact?.secondary]
        .filter((v, i, arr) => v && arr.indexOf(v) === i)
        .join(", ") || "N/A",
    email: rawLab?.contact?.publicEmail ?? "N/A",
    // Raw sanitized SVG markup, used directly by InvoiceCard (browser can
    // render inline SVG natively). Null when the lab hasn't set a logo.
    logoSvg: rawLab?.decoration?.logo || null,
    // Pulled from the lab's own decoration.tagline — no fallback text, so
    // labs that haven't set one simply show no tagline line at all.
    tagline: rawLab?.decoration?.tagline?.trim() || null,
    // Only the pieces of `decoration` this screen actually needs — pad-mode
    // print uses invoicePadHeaderHeight/invoicePadFooterHeight to leave
    // blank space for a pre-printed letterhead instead of rendering the lab
    // identity block, and to reserve room at the bottom of the page for the
    // pad's footer letterhead/branding.
    decoration: {
      invoicePadHeaderHeight: rawLab?.decoration?.invoicePadHeaderHeight ?? 0,
      invoicePadFooterHeight: rawLab?.decoration?.invoicePadFooterHeight ?? 0,
    },
  };

  const [invoice, setInvoice] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  // PNG data URL rasterized from labInfo.logoSvg — react-pdf's <Image> can't
  // consume raw SVG markup directly, so this is what actually gets passed
  // into InvoicePDF. Stays "" (→ "LP" fallback box) until rasterization
  // resolves, or permanently if the lab has no logo.
  const [logoPngUrl, setLogoPngUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printingPad, setPrintingPad] = useState(false);
  const [popup, setPopup] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false); // new

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  useEffect(() => {
    const load = async () => {
      try {
        let raw = location.state?.invoiceData ?? null;
        if (!raw) {
          if (!invoiceId) {
            setPopup({ type: "error", message: "No invoice data available" });
            setTimeout(() => navigate("/outdoor/invoice/new"), 2000);
            return;
          }
          raw = (await invoiceService.getInvoiceByInvoiceId(invoiceId)).data;
          console.log(raw);
        }
        console.log(raw);
        const normalised = normaliseInvoice(raw);
        setInvoice(normalised);

        setQrCodeUrl(
          await QRCode.toDataURL(normalised.reportLink, {
            width: 200,
            margin: 1,
            color: { dark: "#000000", light: "#ffffff" },
          }),
        );
      } catch (err) {
        if (isNetworkError(err)) {
          setOfflinePopup(true);
        } else {
          setPopup({ type: "error", message: "Failed to load invoice data" });
        }
        setTimeout(() => navigate("/outdoor/invoice/new"), 2000);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []); // eslint-disable-line

  // Rasterize the lab's SVG logo for PDF use once, whenever it changes (not
  // on every render — svgToPngDataUrl does real work via canvas/Blob URLs).
  // Silently falls back to the "LP" box on failure (e.g. malformed SVG)
  // rather than blocking PDF generation.
  useEffect(() => {
    if (!labInfo.logoSvg) {
      setLogoPngUrl("");
      return;
    }
    let cancelled = false;
    svgToPngDataUrl(labInfo.logoSvg)
      .then((dataUrl) => {
        if (!cancelled) setLogoPngUrl(dataUrl);
      })
      .catch((err) => {
        console.error("Failed to rasterize lab logo for PDF", err);
        if (!cancelled) setLogoPngUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [labInfo.logoSvg]);

  // ── PDF helpers ────────────────────────────────────────────────────────────

  // `hideDownloadButton` lets callers (print) render the PDF without the
  // "Click to Download Reports" CTA — it's a link overlay meant for on-screen
  // clicking, so it has no purpose on a physical printout. Download/Share
  // keep it since those PDFs stay digital.
  // `padMode` hides the lab identity header and replaces it with blank space
  // sized to `decoration.invoicePadHeaderHeight`, and reserves blank space
  // sized to `decoration.invoicePadFooterHeight` at the bottom of the page,
  // for printing onto pre-printed letterhead pad paper — used by the
  // "Print (Pad)" button.
  const buildPDF = ({ hideDownloadButton = false, padMode = false } = {}) =>
    pdf(
      <InvoicePDF
        invoice={invoice}
        qrCodeUrl={qrCodeUrl}
        labInfo={labInfo}
        logoPngUrl={logoPngUrl}
        hideDownloadButton={hideDownloadButton}
        padMode={padMode}
      />,
    ).toBlob();

  const triggerDownload = (blob, name) => {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), { href: url, download: name, style: "display:none" }).dispatchEvent(
      new MouseEvent("click"),
    );
    URL.revokeObjectURL(url);
  };

  // Filename now uses the invoice ID instead of the patient's name, so
  // downloaded/shared files are named e.g. "INV-000123.pdf" — used by both
  // handleDownload and handleShare below.
  const pdfName = () => `${invoice.invoiceId || "Invoice"}.pdf`;

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleDownload = async () => {
    try {
      setDownloading(true);
      triggerDownload(await buildPDF(), pdfName());
    } catch {
      setPopup({ type: "error", message: "Could not generate PDF" });
    } finally {
      setDownloading(false);
    }
  };

  // Shared by both Print and Print (Pad) — only the buildPDF options differ.
  const printBlob = async (buildOptions) => {
    const url = URL.createObjectURL(await buildPDF(buildOptions));
    const iframe = Object.assign(document.createElement("iframe"), {
      src: url,
      style: "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;",
    });
    document.body.appendChild(iframe);
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 60_000);
      }, 500);
    };
  };

  const handlePrint = async () => {
    try {
      setPrinting(true);
      // hideDownloadButton: true — the "Click to Download Reports" CTA is a
      // clickable link meant for an on-screen PDF; it has no purpose (and
      // shouldn't render) on a physical printout.
      await printBlob({ hideDownloadButton: true });
    } catch {
      setPopup({ type: "error", message: "Could not generate PDF for printing" });
    } finally {
      setPrinting(false);
    }
  };

  // Print (Pad) — same as Print, but leaves the header area blank
  // (decoration.invoicePadHeaderHeight tall) instead of printing the lab
  // identity block, and reserves blank space at the bottom of the page
  // (decoration.invoicePadFooterHeight tall), so it lines up on pre-printed
  // letterhead pad paper.
  const handlePrintPad = async () => {
    try {
      setPrintingPad(true);
      await printBlob({ hideDownloadButton: true, padMode: true });
    } catch {
      setPopup({ type: "error", message: "Could not generate PDF for printing" });
    } finally {
      setPrintingPad(false);
    }
  };

  const handleShare = async () => {
    try {
      setSharing(true);
      const { date } = formatDateTime(invoice.createdAt);
      const message =
        `Hello ${invoice.patient.name},\n\n` +
        `Your diagnostic reports from ${labInfo.name} are ready!\n\n` +
        `Tests: ${invoice.tests.length} test(s)\n` +
        (invoice.products.length > 0 ? `Products: ${invoice.products.length} item(s)\n` : "") +
        `Total: ${fmt(invoice.amount.final)}\n` +
        `Date: ${date}\n\n` +
        `Download your reports here:\n${invoice.reportLink}\n\n` +
        `For queries: ${labInfo.phone}\n— ${labInfo.name}`;

      const blob = await buildPDF();
      const name = pdfName();
      const file = new File([blob], name, { type: "application/pdf" });

      if (navigator.share) {
        const canShare = navigator.canShare?.({ files: [file] });
        await navigator.share({
          title: `Invoice – ${invoice.patient.name}`,
          text: message,
          ...(canShare ? { files: [file] } : {}),
        });
        if (!canShare) triggerDownload(blob, name);
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
        triggerDownload(blob, name);
      }
    } catch (err) {
      if (err.name !== "AbortError") setPopup({ type: "error", message: "Could not share invoice" });
    } finally {
      setSharing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen message="Loading invoice..." />;
  if (!invoice) return null;

  return (
    <>
      {popup && <Popup type={popup.type} message={popup.message} onClose={() => setPopup(null)} />}
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      {/* Action bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="py-4 flex justify-center">
          <div className="flex items-center gap-3">
            <ActionButton
              onClick={handleShare}
              disabled={sharing}
              icon={Share2}
              label="Share"
              busy={sharing}
              busyLabel="Preparing..."
            />
            <ActionButton
              onClick={handleDownload}
              disabled={downloading}
              icon={Download}
              label="Download"
              busy={downloading}
              busyLabel="Generating..."
            />
            {!isMobile && (
              <>
                <ActionButton
                  onClick={handlePrint}
                  disabled={printing}
                  icon={Printer}
                  label="Print"
                  busy={printing}
                  busyLabel="Generating..."
                  primary
                />
                <ActionButton
                  onClick={handlePrintPad}
                  disabled={printingPad}
                  icon={FileText}
                  label="Print (Pad)"
                  busy={printingPad}
                  busyLabel="Generating..."
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <InvoiceCard
            invoice={invoice}
            qrCodeUrl={qrCodeUrl}
            labInfo={labInfo}
            downloading={downloading}
            sharing={sharing}
          />
        </div>
      </div>
    </>
  );
};

const ActionButton = ({ onClick, disabled, icon: Icon, label, busy, busyLabel, primary = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
      primary
        ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
        : "text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-300"
    }`}
  >
    <Icon className="w-4 h-4" />
    {busy ? busyLabel : label}
  </button>
);

export default PrintInvoice;
