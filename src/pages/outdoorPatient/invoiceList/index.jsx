/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 */
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  CheckCircle2,
  ArrowLeft,
  Wallet,
  AlertCircle,
  PackageCheck,
  FlaskConical,
  Banknote,
  Pencil,
  User,
  Phone,
  Calendar,
  ChevronDown,
  X,
  Eye,
  UserCircle,
  Receipt,
  TestTube2,
  DollarSign,
  UserCheck,
  Clock,
  Printer,
  Copy,
  Check,
  CreditCard,
  Loader2,
  Search,
  Cake,
  VenusAndMars,
  Stethoscope,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Popup from "../../../components/popup";
import Modal from "../../../components/modal";
import LoadingScreen from "../../../components/loadingPage";
import invoiceService from "../../../api/invoice";
import TimeFrame from "../../../components/timeFrame";
import { useAuthStore } from "../../../store/authStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0 }).format(n || 0);

const fmtNum = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "0");

const formatDateTime = (ts) => {
  const d = new Date(ts);
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";
  const h = d.getHours();
  return {
    date: `${day}${suffix} ${d.toLocaleString("default", { month: "short" })}, ${d.getFullYear()}`,
    time: `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`,
  };
};

// Compact "relative-ish" line used on cards: "7th Sep, 2026 · 4:32 PM"
const formatDateTimeLine = (ts) => {
  const { date, time } = formatDateTime(ts);
  return `${date} · ${time}`;
};

// Patient age is stored server-side as { years, months, days } (see
// invoiceRoutes.js patientAgeSchema) rather than a single number, so
// newborns/infants can be recorded precisely. Format as a compact string,
// skipping zero parts — e.g. "24y", "5m 10d", "0d" if somehow all-zero.
const formatAge = (age) => {
  if (!age) return "—";
  const parts = [];
  if (age.years) parts.push(`${age.years}y`);
  if (age.months) parts.push(`${age.months}m`);
  if (age.days) parts.push(`${age.days}d`);
  return parts.length ? parts.join(" ") : "0d";
};

const getDue = (inv) => Math.max(0, (inv.amount?.final ?? 0) - (inv.amount?.paid ?? 0));
const isFullyPaid = (inv) => getDue(inv) === 0;
const isDelivered = (inv) => inv.delivery?.status === true;
const getTests = (inv) => inv.tests ?? [];
const hasReportSchemas = (inv) => getTests(inv).some((t) => t.schemaId);

// Strips everything except letters/digits and lowercases, so search is
// forgiving of punctuation/spacing differences — e.g. typing "drc" matches
// a patient/doctor name stored as "Dr. C", "dr c", "DR-C", etc. Frontend-only,
// applied to both the typed query and the fields being matched against.
const normalize = (s) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

// Clipboard helper — uses the async Clipboard API where available and falls
// back to the legacy execCommand approach for non-secure contexts / older webviews.
const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy method
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};

// ── Error helpers ─────────────────────────────────────────────────────────────

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";

const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};

// ── Axios‑native network error detection (same as all other pages) ──────────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// ─── Payment modes (mirrors CreateInvoice.jsx / SearchInvoice.jsx) ───────────

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "others", label: "Others" },
];

// Contact numbers are required to be exactly 11 digits (standard BD mobile
// number length, e.g. 01XXXXXXXXX). Enforced client-side on entry (digits-
// only, hard-capped at 11 chars) and again before submit.
const PHONE_LENGTH = 11;
const isValidPhone = (value) => new RegExp(`^\\d{${PHONE_LENGTH}}$`).test((value || "").trim());

// "All" sentinel used by the doctor/referrer filter dropdowns.
const FILTER_ALL = "__all__";

// ─── Copy Invoice ID Button ───────────────────────────────────────────────────

const CopyIdButton = ({ value, size = "xs" }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyToClipboard(String(value));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const dims = size === "sm" ? "w-6 h-6" : "w-5 h-5";
  const iconDims = size === "sm" ? "w-3 h-3" : "w-2.5 h-2.5";

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "কপি হয়েছে" : "আইডি কপি করুন"}
      aria-label="Copy invoice ID"
      className={`relative shrink-0 ${dims} flex items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:scale-95 transition-all`}
    >
      {copied ? <Check className={`${iconDims} text-emerald-600`} /> : <Copy className={iconDims} />}
    </button>
  );
};

// ─── Collect Due Modal ────────────────────────────────────────────────────────

const CollectDueModal = ({ invoice, isOpen, onClose, onConfirm, onNetworkError }) => {
  const due = invoice ? getDue(invoice) : 0;
  const [amount, setAmount] = useState(due);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setAmount(due);
      setPaymentMode("cash");
      setError("");
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, invoice?.invoiceId]);

  if (!isOpen || !invoice) return null;

  const clampAmount = (val) => {
    if (val === "") return setAmount("");
    const num = parseFloat(val);
    if (Number.isNaN(num)) return setAmount("");
    setAmount(Math.min(Math.max(0, num), due));
  };

  const toFixed2 = (n) => parseFloat(n.toFixed(2));
  const numericAmount = parseFloat(amount) || 0;
  const isValid = numericAmount > 0 && numericAmount <= due;

  const handleSubmit = async () => {
    if (!isValid) {
      setError(`পরিমাণ ৳১ থেকে ${fmt(due)} এর মধ্যে হতে হবে`);
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      await onConfirm({ amount: toFixed2(numericAmount), paymentMode });
    } catch (err) {
      if (isNetworkError(err)) {
        setError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
        onNetworkError?.();
      } else {
        setError("আদায় ব্যর্থ হয়েছে, আবার চেষ্টা করুন।");
      }
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={submitting ? undefined : onClose} size="sm">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Banknote className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">বকেয়া আদায়</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              #{invoice.invoiceId} · {invoice.patient?.name}
            </p>
          </div>
        </div>
        {!submitting && (
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-5 py-5 space-y-4">
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-red-100 bg-red-50">
          <span className="text-xs font-medium uppercase tracking-wide text-red-600">মোট বাকি</span>
          <span className="text-lg font-bold text-red-600 tabular-nums">{fmt(due)}</span>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">আদায়কৃত পরিমাণ</label>
          <div className="relative">
            <Wallet className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => clampAmount(e.target.value)}
              min="0"
              max={due}
              step="0.01"
              disabled={submitting}
              className="w-full pl-10 pr-3 py-3 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50 focus:bg-white disabled:opacity-60"
            />
          </div>
          <div className="flex items-center justify-between mt-2 gap-2">
            <button
              type="button"
              onClick={() => setAmount(due)}
              disabled={submitting}
              className="text-xs font-medium text-emerald-600 hover:underline"
            >
              সম্পূর্ণ বাকি আদায় করুন ({fmt(due)})
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">পেমেন্ট মাধ্যম</label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                disabled={submitting}
                onClick={() => setPaymentMode(mode.value)}
                aria-pressed={paymentMode === mode.value}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                  paymentMode === mode.value
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}
      </div>

      <div className="flex gap-2 px-5 pb-5 pt-1">
        <button
          onClick={onClose}
          disabled={submitting}
          className="flex-1 py-3 text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
        >
          বাতিল
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="flex-1 py-3 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-1.5"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> আদায় হচ্ছে...
            </>
          ) : (
            <>
              <Banknote className="w-4 h-4" /> আদায় করুন {numericAmount > 0 ? `(${fmt(numericAmount)})` : ""}
            </>
          )}
        </button>
      </div>
    </Modal>
  );
};

// ─── Action chips (matches SearchInvoice.jsx's ResultCard styling exactly) ────

const ActionChip = ({ onClick, icon: Icon, label, className }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${className}`}
  >
    <Icon className="w-3.5 h-3.5" /> {label}
  </button>
);

const ActionLinkChip = ({ to, state, icon: Icon, label, className }) => (
  <Link
    to={to}
    state={state}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${className}`}
  >
    <Icon className="w-3.5 h-3.5" /> {label}
  </Link>
);

// ─── Invoice Card (same visual design as SearchInvoice.jsx's ResultCard) ──────

const InvoiceCard = ({
  invoice,
  index,
  onDelivered,
  onCollected,
  onPatientUpdated,
  onLoadingChange,
  onError,
  onSuccess,
  onNetworkError,
  fromBackendSearch = false,
}) => {
  const { date, time } = formatDateTime(invoice.createdAt);
  const [confirming, setConfirming] = useState(false);
  const [collectingDue, setCollectingDue] = useState(false);
  const [editingPatient, setEditingPatient] = useState(false);
  const [viewingDetails, setViewingDetails] = useState(false);

  const due = getDue(invoice);
  const fullyPaid = isFullyPaid(invoice);
  const delivered = isDelivered(invoice);
  const hasReports = hasReportSchemas(invoice);
  const patient = invoice.patient;
  const doctorName = invoice.doctor?.name;
  const referrerName = invoice.referrer?.name;

  const handleConfirmDelivery = async () => {
    setConfirming(false);
    try {
      onLoadingChange("Marking as delivered...");
      await invoiceService.markDelivered(invoice.invoiceId);
      onDelivered(invoice.invoiceId);
    } catch (err) {
      if (isNetworkError(err)) {
        onNetworkError?.();
      } else {
        onError(getErrorMessage(err, "Failed to mark as delivered. Please try again."));
      }
    } finally {
      onLoadingChange(null);
    }
  };

  const handleCollectDue = async ({ amount, paymentMode }) => {
    try {
      const { data } = await invoiceService.collectDue(invoice.invoiceId, { amount, paymentMode });
      onCollected(invoice.invoiceId, amount);
      setCollectingDue(false);
      onSuccess(
        data?.due > 0
          ? `${patient.name} থেকে ${fmt(amount)} আদায় হয়েছে। অবশিষ্ট বাকি: ${fmt(data.due)}।`
          : `${patient.name} থেকে ${fmt(amount)} আদায় হয়েছে। ইনভয়েস #${invoice.invoiceId} সম্পূর্ণ পরিশোধিত।`,
      );
    } catch (err) {
      throw err; // let CollectDueModal catch it
    }
  };

  return (
    <>
      {confirming && (
        <Popup
          type="warning"
          message={`Mark invoice #${invoice.invoiceId} for ${patient.name} as delivered? This action cannot be undone.`}
          confirmText="Mark Delivered"
          cancelText="Cancel"
          onConfirm={handleConfirmDelivery}
          onClose={() => setConfirming(false)}
        />
      )}

      <CollectDueModal
        invoice={invoice}
        isOpen={collectingDue}
        onClose={() => setCollectingDue(false)}
        onConfirm={handleCollectDue}
        onNetworkError={onNetworkError}
      />

      <EditPatientModal
        invoice={invoice}
        isOpen={editingPatient}
        onClose={() => setEditingPatient(false)}
        onSaved={onPatientUpdated}
        onLoadingChange={onLoadingChange}
        onError={onError}
        onNetworkError={onNetworkError}
      />
      <InvoiceDetailsModal
        invoiceId={invoice.invoiceId}
        isOpen={viewingDetails}
        onClose={() => setViewingDetails(false)}
        invoice={invoice}
        onPatientUpdated={onPatientUpdated}
        onLoadingChange={onLoadingChange}
        onError={onError}
      />

      <div className="no-print">
        <div className="bg-white shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all duration-200 overflow-hidden">
          {fromBackendSearch && (
            <div className="mx-4 mt-3.5 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 flex items-start gap-2">
              <Search className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-700 leading-snug">
                ইনভয়েস <span className="font-bold">#{invoice.invoiceId}</span> নির্ধারিত সময়সীমার বাইরে পাওয়া গেছে —{" "}
                {date} তারিখে {time} এ তৈরি হয়েছিল।
              </p>
            </div>
          )}
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm">
              <span className="text-[11px] font-bold text-white">{index + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-sm leading-tight truncate">{patient.name}</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                #{invoice.invoiceId} · {date} · {time}
                {invoice.createdBy?.name && (
                  <span className="text-gray-300 hidden sm:inline"> · by {invoice.createdBy.name}</span>
                )}
              </p>
              {(doctorName || referrerName) && (
                <p className="text-[11px] text-gray-400 mt-0.5 truncate flex items-center gap-2">
                  {doctorName && (
                    <span className="inline-flex items-center gap-1">
                      <Stethoscope className="w-3 h-3 text-slate-400" /> {doctorName}
                    </span>
                  )}
                  {referrerName && (
                    <span className="inline-flex items-center gap-1" title="Media">
                      <Users className="w-3 h-3 text-slate-400" /> {referrerName}
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {fullyPaid ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-100 text-xs font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Paid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-600 border border-red-100 text-xs font-medium whitespace-nowrap">
                  <Wallet className="w-3 h-3" />৳{due.toLocaleString()}
                </span>
              )}
              {delivered && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-semibold">
                  <PackageCheck className="w-3 h-3" />
                  <span className="hidden sm:inline">Delivered</span>
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-1.5 flex-wrap justify-start">
              <ActionChip
                onClick={() => setViewingDetails(true)}
                icon={Eye}
                label="Details"
                className="text-violet-700 bg-violet-50 hover:bg-violet-100 border-violet-100"
              />
              <ActionLinkChip
                to={`/outdoor/invoice/print/${invoice.invoiceId}`}
                icon={FileText}
                label="Invoice"
                className="text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-100"
              />
              {hasReports && (
                <ActionLinkChip
                  to="/report"
                  state={{ invoiceId: invoice.invoiceId }}
                  icon={FlaskConical}
                  label="Reports"
                  className="text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 border-transparent shadow-sm"
                />
              )}
              <ActionChip
                onClick={() => setEditingPatient(true)}
                icon={Pencil}
                label="Edit"
                className="text-gray-600 bg-gray-100 hover:bg-gray-200 border-gray-200"
              />
              {!fullyPaid && (
                <ActionChip
                  onClick={() => setCollectingDue(true)}
                  icon={CreditCard}
                  label="Collect"
                  className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                />
              )}
              {!delivered && (
                <ActionChip
                  onClick={() => setConfirming(true)}
                  icon={PackageCheck}
                  label="Deliver"
                  className="text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-100"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Filter select (doctor / referrer) ─────────────────────────────────────
// Options come from whatever's already in the loaded `invoices` array — never
// from /invoice/doctors or /invoice/required-data, which return the lab's
// entire doctor/referrer roster (hundreds of records) regardless of whether
// they were ever actually used on an invoice.

const FilterSelect = ({ icon: Icon, value, onChange, options, counts, placeholder }) => (
  <div className="relative flex-1 min-w-[140px]">
    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none pl-8 pr-7 py-2.5 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-600"
    >
      <option value={FILTER_ALL}>{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt} {counts?.[opt] ? `(${counts[opt]})` : ""}
        </option>
      ))}
    </select>
    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const InvoiceList = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  // ═══════ Frontend permission check ═══════
  const hasAccess = isAdmin || !!user?.permissions?.invoiceList;
  if (!hasAccess) {
    return <Popup type="denied" message="ইনভয়েস লিস্ট দেখার অনুমতি আপনার নেই।" onClose={() => navigate("/")} />;
  }
  // ══════════════════════════════════════════

  const [invoices, setInvoices] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState(null);
  const [popup, setPopup] = useState(null);
  const [networkError, setNetworkError] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeRange, setTimeRange] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [doctorFilter, setDoctorFilter] = useState(FILTER_ALL);
  const [referrerFilter, setReferrerFilter] = useState(FILTER_ALL);

  // Ledger totals (মোট বিলকৃত / আদায় / বাকি) and the invoice count shown in
  // the header come from a dedicated DB aggregation over the FULL selected
  // date range — not from whatever page of 20 happens to be loaded.
  const [summary, setSummary] = useState({ count: 0, totalBilled: 0, totalPaid: 0, totalDue: 0 });
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Sentinel element for infinite scroll — replaces the old "Load more" button.
  const sentinelRef = useRef(null);

  // Backend search fallback — only kicks in when the text search (name / id
  // / phone) matches nothing among the invoices already loaded for the
  // current date range. Hits GET /invoice/search, which isn't date-bound.
  const [searchResults, setSearchResults] = useState(null); // null = not searched
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [deletedInvoiceNotice, setDeletedInvoiceNotice] = useState(null);

  const loadSummary = async (range = timeRange) => {
    try {
      setSummaryLoading(true);
      const { data } = await invoiceService.getInvoiceSummary({
        startDate: range?.start,
        endDate: range?.end,
      });
      setSummary({
        count: data.count ?? 0,
        totalBilled: data.totalBilled ?? 0,
        totalPaid: data.totalPaid ?? 0,
        totalDue: data.totalDue ?? 0,
      });
    } catch (err) {
      // Secondary data — a failed summary shouldn't block the invoice list
      // itself, so this doesn't raise a popup. Network issues still flip the
      // shared offline banner since loadInvoices will hit the same problem.
      if (isNetworkError(err)) setNetworkError(true);
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadInvoices = async (cursor = null, replace = true, range = timeRange) => {
    try {
      replace ? setInitialLoading(true) : setLoadingMore(true);
      const { data } = await invoiceService.getInvoices({
        cursor,
        limit: 20,
        ...(range && { startDate: range.start, endDate: range.end }),
      });
      setInvoices((prev) => (replace ? data.invoices : [...prev, ...data.invoices]));
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      // Loaded data changed — previously-picked doctor/referrer may not
      // exist in the new set, so reset back to "all" on a fresh fetch.
      if (replace) {
        setDoctorFilter(FILTER_ALL);
        setReferrerFilter(FILTER_ALL);
        setSearchResults(null);
        setSearchError(null);
        setDeletedInvoiceNotice(null);
      }
    } catch (err) {
      if (isNetworkError(err)) {
        setNetworkError(true);
      } else {
        setPopup({ type: "error", message: getErrorMessage(err, "Could not load invoices") });
      }
    } finally {
      setInitialLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    const initial = { start: new Date(now).setHours(0, 0, 0, 0), end: new Date(now).setHours(23, 59, 59, 999) };
    setTimeRange(initial);
    loadInvoices(null, true, initial);
    loadSummary(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFetchData = (start, end) => {
    const range = { start, end };
    setTimeRange(range);
    setStatusFilter("all");
    loadInvoices(null, true, range);
    loadSummary(range);
  };

  // ── Backend search fallback ──────────────────────────────────────────────
  // Only fires when: the text search has ≥2 chars, it matches nothing among
  // the invoices already loaded for the current date range, and neither the
  // doctor nor media filter is active (those only make sense against loaded
  // data). Debounced so it doesn't fire on every keystroke.
  useEffect(() => {
    const term = searchTerm.trim();

    if (term.length < 2 || doctorFilter !== FILTER_ALL || referrerFilter !== FILTER_ALL) {
      setSearchResults(null);
      setSearching(false);
      setSearchError(null);
      setDeletedInvoiceNotice(null);
      return;
    }

    const q = normalize(term);
    const localMatches = invoices.some(
      (inv) =>
        normalize(inv.patient?.name).includes(q) ||
        normalize(inv.invoiceId).includes(q) ||
        normalize(inv.patient?.contactNumber).includes(q),
    );
    if (localMatches) {
      setSearchResults(null);
      setSearching(false);
      setSearchError(null);
      setDeletedInvoiceNotice(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    const timer = setTimeout(async () => {
      try {
        const { data } = await invoiceService.searchInvoices(term);
        setSearchResults(data.results || []);
        setDeletedInvoiceNotice(data.deletedInvoice || null);
      } catch (err) {
        setSearchResults([]);
        setDeletedInvoiceNotice(null);
        if (isNetworkError(err)) {
          setSearchError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
        } else {
          setSearchError(getErrorMessage(err, "অনুসন্ধান ব্যর্থ হয়েছে, আবার চেষ্টা করুন।"));
        }
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, doctorFilter, referrerFilter]);

  // Doctor / referrer (labeled "Media" in the UI, matching the "মিডিয়া"
  // section in InvoiceDetailsModal) options derived purely from the invoices
  // currently in memory — a lab may have 200 doctors and 300 referrers on
  // file, but only whichever handful actually appear across these invoices
  // show up here. Each option's bracketed number is how many of the loaded
  // invoices (i.e. patients) are tied to that doctor/referrer.
  const doctorCounts = {};
  const referrerCounts = {};
  invoices.forEach((inv) => {
    const d = inv.doctor?.name;
    const r = inv.referrer?.name;
    if (d) doctorCounts[d] = (doctorCounts[d] || 0) + 1;
    if (r) referrerCounts[r] = (referrerCounts[r] || 0) + 1;
  });
  const doctorOptions = Object.keys(doctorCounts).sort((a, b) => a.localeCompare(b));
  const referrerOptions = Object.keys(referrerCounts).sort((a, b) => a.localeCompare(b));

  const filteredInvoices = invoices
    .filter((inv) =>
      statusFilter === "pending" ? !isFullyPaid(inv) : statusFilter === "paid" ? isFullyPaid(inv) : true,
    )
    .filter((inv) => (doctorFilter === FILTER_ALL ? true : inv.doctor?.name === doctorFilter))
    .filter((inv) => (referrerFilter === FILTER_ALL ? true : inv.referrer?.name === referrerFilter))
    .filter((inv) => {
      if (!searchTerm.trim()) return true;
      const q = normalize(searchTerm);
      return (
        normalize(inv.patient?.name).includes(q) ||
        normalize(inv.invoiceId).includes(q) ||
        normalize(inv.patient?.contactNumber).includes(q)
      );
    });

  // When the loaded (date-range-bound) invoices have no match, fall back to
  // whatever GET /invoice/search turned up — still respecting the active
  // status chip so "বাকি"/"পরিশোধিত" stay meaningful.
  const backendFallbackResults = (searchResults ?? []).filter((inv) =>
    statusFilter === "pending" ? !isFullyPaid(inv) : statusFilter === "paid" ? isFullyPaid(inv) : true,
  );
  const usingBackendFallback = filteredInvoices.length === 0 && backendFallbackResults.length > 0;
  const displayInvoices = usingBackendFallback ? backendFallbackResults : filteredInvoices;

  // Serial numbers count DOWN from the DB total, matching real invoice
  // order: the newest invoice shown (top of the list) gets the highest
  // number, decreasing by 1 per older invoice — e.g. 15, 14, 13, 12…
  // `invoices` is already newest-first (server sorts by createdAt desc), so
  // position 0 in that array is the true "last" invoice of the range.
  // Backend-fallback search results (outside this date range) aren't in
  // that map, so they fall back to their position within the search results.
  const totalCount = summary.count || invoices.length;
  const serialByInvoiceId = new Map(invoices.map((inv, i) => [inv.invoiceId, totalCount - i]));

  // ── Infinite scroll ───────────────────────────────────────────────────────
  // Replaces the old manual "Load more" button — fetches the next page
  // automatically once the sentinel at the bottom of the list scrolls into
  // view. Only active for the plain, unfiltered date-range list; filtered
  // views and backend-fallback search results don't auto-paginate.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loadingMore || usingBackendFallback) return;
    if (statusFilter !== "all" || doctorFilter !== FILTER_ALL || referrerFilter !== FILTER_ALL) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadInvoices(nextCursor, false);
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, nextCursor, usingBackendFallback, statusFilter, doctorFilter, referrerFilter]);

  const headingLabel = (() => {
    if (!timeRange) return "";
    const s = new Date(timeRange.start);
    const e = new Date(timeRange.end);
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
    if (s.toDateString() === e.toDateString()) return `${day(s)} ${monthYear(s)}`;
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
    if (sameMonth) return `${s.getDate()} – ${e.getDate()} ${monthYear(s)}`;
    return `${s.toLocaleString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  })();

  // Optimistic updates — applied to `invoices` AND `searchResults`, since a
  // card the user is acting on may currently be rendered from either array
  // (backend fallback results live outside the date-bound `invoices` list).
  const patchInvoiceEverywhere = (id, patch) => {
    setInvoices((prev) => prev.map((inv) => (inv.invoiceId === id ? patch(inv) : inv)));
    setSearchResults((prev) => (prev ? prev.map((inv) => (inv.invoiceId === id ? patch(inv) : inv)) : prev));
  };

  const handleDelivered = (id) =>
    patchInvoiceEverywhere(id, (inv) => ({ ...inv, delivery: { ...inv.delivery, status: true } }));

  const handleCollected = (id, collectedAmount) =>
    patchInvoiceEverywhere(id, (inv) => ({
      ...inv,
      amount: {
        ...inv.amount,
        paid: Math.min(inv.amount.final, (inv.amount.paid || 0) + collectedAmount),
      },
    }));

  const handlePatientUpdated = (id, fields) => patchInvoiceEverywhere(id, (inv) => ({ ...inv, ...fields }));

  // Doctor and Media filters are mutually exclusive — picking one resets the
  // other back to "all" rather than combining both filters at once.
  const handleDoctorFilterChange = (value) => {
    setDoctorFilter(value);
    if (value !== FILTER_ALL) setReferrerFilter(FILTER_ALL);
  };
  const handleReferrerFilterChange = (value) => {
    setReferrerFilter(value);
    if (value !== FILTER_ALL) setDoctorFilter(FILTER_ALL);
  };

  const hasActiveFilters =
    searchTerm.trim() || statusFilter !== "all" || doctorFilter !== FILTER_ALL || referrerFilter !== FILTER_ALL;

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDoctorFilter(FILTER_ALL);
    setReferrerFilter(FILTER_ALL);
    setSearchResults(null);
    setSearchError(null);
    setDeletedInvoiceNotice(null);
  };

  return (
    <section className="min-h-screen bg-slate-50 pb-8 font-noto">
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body * { visibility: hidden; }
          #invoicelist-printable, #invoicelist-printable * { visibility: visible; }
          #invoicelist-printable { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; }
          .no-print { display: none !important; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {loadingMessage && <LoadingScreen message={loadingMessage} />}
      {popup && <Popup type={popup.type} message={popup.message} onClose={() => setPopup(null)} />}
      {networkError && <Popup type="offline" onClose={() => setNetworkError(false)} />}

      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 no-print">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/outdoor"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 truncate">ইনভয়েস তালিকা</h1>
              <p className="text-[11px] text-slate-400 truncate">
                {summaryLoading ? "…" : fmtNum(summary.count)}টি ইনভয়েস
              </p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            disabled={initialLoading}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* TimeFrame */}
        <div className="mb-4 no-print">
          <TimeFrame onFetchData={handleFetchData} />
        </div>

        {initialLoading ? (
          <SkeletonList />
        ) : (
          <div id="invoicelist-printable">
            {/* Summary card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">ইনভয়েস লেজার</p>
                  <h2 className="text-lg font-bold text-slate-900">{headingLabel}</h2>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <SummaryStat label="মোট বিলকৃত" value={fmt(summary.totalBilled)} loading={summaryLoading} />
                <SummaryStat label="আদায়" value={fmt(summary.totalPaid)} tone="green" loading={summaryLoading} />
                <SummaryStat
                  label="বাকি"
                  value={fmt(summary.totalDue)}
                  tone={summary.totalDue > 0 ? "red" : "green"}
                  loading={summaryLoading}
                />
              </div>
            </div>

            {/* Search + filters — no-print */}
            <div className="mb-4 space-y-2 no-print">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="নাম, ফোন বা আইডি দিয়ে খুঁজুন..."
                  className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { key: "all", label: "সব" },
                  { key: "pending", label: "বাকি" },
                  { key: "paid", label: "পরিশোধিত" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`shrink-0 px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      statusFilter === key
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-600 hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(doctorOptions.length > 0 || referrerOptions.length > 0) && (
                <div className="flex items-center gap-2">
                  {doctorOptions.length > 0 && (
                    <FilterSelect
                      icon={Stethoscope}
                      value={doctorFilter}
                      onChange={handleDoctorFilterChange}
                      options={doctorOptions}
                      counts={doctorCounts}
                      placeholder="সব ডাক্তার"
                    />
                  )}
                  {referrerOptions.length > 0 && (
                    <FilterSelect
                      icon={Users}
                      value={referrerFilter}
                      onChange={handleReferrerFilterChange}
                      options={referrerOptions}
                      counts={referrerCounts}
                      placeholder="সব মিডিয়া"
                    />
                  )}
                </div>
              )}

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
                >
                  <X className="w-3 h-3" /> ফিল্টার মুছুন
                </button>
              )}
            </div>

            {/* Invoice cards */}
            {displayInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
                {searching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    <p className="text-xs">খোঁজা হচ্ছে...</p>
                  </>
                ) : deletedInvoiceNotice ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <p className="text-xs text-center px-4">
                      ইনভয়েস <span className="font-bold text-slate-700">#{deletedInvoiceNotice.invoiceId}</span>
                      {deletedInvoiceNotice.patientName && ` (${deletedInvoiceNotice.patientName})`} ডিলিট করা হয়েছে
                      {deletedInvoiceNotice.deletedAt && ` — ${formatDateTimeLine(deletedInvoiceNotice.deletedAt)}`}
                      {deletedInvoiceNotice.deletedBy && ` · by ${deletedInvoiceNotice.deletedBy}`}
                    </p>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    <p className="text-xs">
                      {hasActiveFilters ? "কোনো ফলাফল পাওয়া যায়নি" : "নির্ধারিত সময়সীমায় কোনো ইনভয়েস তৈরি হয়নি"}
                    </p>
                    {searchError && <p className="text-[11px] text-red-500 px-4 text-center">{searchError}</p>}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {displayInvoices.map((invoice, index) => {
                  const serial = serialByInvoiceId.get(invoice.invoiceId) ?? index + 1;
                  return (
                    <InvoiceCard
                      key={invoice._id}
                      invoice={invoice}
                      index={serial - 1}
                      fromBackendSearch={usingBackendFallback}
                      onDelivered={handleDelivered}
                      onCollected={handleCollected}
                      onPatientUpdated={handlePatientUpdated}
                      onLoadingChange={(msg) => setLoadingMessage(msg)}
                      onError={(msg) => setPopup({ type: "error", message: msg })}
                      onSuccess={(msg) => setPopup({ type: "success", message: msg })}
                      onNetworkError={() => setNetworkError(true)}
                    />
                  );
                })}
              </div>
            )}

            {/* Infinite-scroll sentinel — hidden while showing backend-fallback
                results, since those aren't part of the paginated, date-bound
                invoices list. Auto-fetches the next page when scrolled into view. */}
            {hasMore &&
              !usingBackendFallback &&
              statusFilter === "all" &&
              doctorFilter === FILTER_ALL &&
              referrerFilter === FILTER_ALL && (
                <div ref={sentinelRef} className="flex items-center justify-center py-6 no-print">
                  {loadingMore && (
                    <span className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> আরো লোড হচ্ছে...
                    </span>
                  )}
                </div>
              )}

            <p className="mt-4 text-center text-[10px] text-slate-400">
              শুধুমাত্র সক্রিয় (ডিলিট না হওয়া) ইনভয়েসের হিসাব অন্তর্ভুক্ত
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

const SummaryStat = ({ label, value, tone = "default", loading = false }) => {
  const toneClass = tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-slate-900";
  return (
    <div className="bg-slate-50 rounded-xl px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-0.5">{label}</p>
      {loading ? (
        <div className="h-3.5 w-3/4 bg-slate-200 rounded animate-pulse" />
      ) : (
        <p className={`text-xs font-bold tabular-nums truncate ${toneClass}`}>{value}</p>
      )}
    </div>
  );
};

// ─── Invoice Details Modal ────────────────────────────────────────────────────

export const InvoiceDetailsModal = ({
  invoiceId,
  isOpen,
  onClose,
  invoice: invoiceRow,
  onPatientUpdated,
  onLoadingChange,
  onError,
}) => {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchInvoice = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await invoiceService.getInvoiceByInvoiceId(invoiceId);
      setInvoice(res.data);
    } catch (err) {
      if (isNetworkError(err)) {
        setError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
      } else {
        setError(getErrorMessage(err, "Failed to load invoice details."));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !invoiceId) return;
    setInvoice(null);
    fetchInvoice();
  }, [isOpen, invoiceId]);

  const rowHasReports = hasReportSchemas(invoiceRow ?? {});
  const due = invoice ? getDue(invoice) : 0;
  const fullyPaid = invoice ? due === 0 : false;
  const delivered = invoice ? isDelivered(invoice) : false;
  const { date, time } = invoice ? formatDateTime(invoice.createdAt) : { date: "", time: "" };

  const patient = invoice?.patient ?? null;
  const referrer = invoice?.referrer ?? null;
  const amount = invoice?.amount ?? null;
  const createdBy = invoice?.createdBy ?? null;
  const deliveredBy = invoice?.delivery?.by ?? null;

  const hasReferrer = referrer && (referrer.name || referrer.id);
  const hasDiscount = (amount?.referrerDiscount ?? 0) > 0;
  const hasCommission = (amount?.referrerCommission ?? 0) > 0;
  const showSubtotal = hasDiscount || (amount?.labAdjustment ?? 0) > 0;

  const paymentModeLabel = (value) => PAYMENT_MODES.find((m) => m.value === value)?.label ?? value;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Receipt className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">Invoice Details</h2>
            <div className="flex items-center gap-1 mt-0.5">
              <p className="text-xs text-slate-400 font-mono">#{invoiceId}</p>
              <CopyIdButton value={invoiceId} size="sm" />
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-5 space-y-4">
        {loading && <DetailsSkeleton />}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-xs text-slate-500">{error}</p>
            <button onClick={fetchInvoice} className="text-xs text-blue-600 hover:underline font-medium">
              আবার চেষ্টা করুন
            </button>
          </div>
        )}

        {invoice && !loading && (
          <>
            {/* Created-by / timestamp — prominent, at top of details */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-blue-500">তৈরি করেছেন</p>
                  <p className="text-xs font-semibold text-slate-900 truncate">{createdBy?.name ?? "—"}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-blue-500">তারিখ ও সময়</p>
                <p className="text-xs font-semibold text-slate-900">
                  {date} · {time}
                </p>
              </div>
            </div>

            {/* Patient */}
            <ManifestBlock icon={UserCircle} label="রোগীর তথ্য">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <ManifestField label="Name" value={patient.name} />
                <ManifestField label="Gender" value={<span className="capitalize">{patient.gender}</span>} />
                <ManifestField label="Age" value={formatAge(patient.age)} />
                <ManifestField label="Contact" value={patient.contactNumber || "—"} />
              </div>
            </ManifestBlock>

            {/* Delivery info */}
            {delivered && deliveredBy?.name && (
              <ManifestBlock icon={PackageCheck} label="ডেলিভারি">
                <ManifestField label="Delivered By" value={deliveredBy.name} valueClass="text-blue-600" />
              </ManifestBlock>
            )}

            {/* Referrer */}
            {hasReferrer && (
              <ManifestBlock icon={User} label="মিডিয়া">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <ManifestField label="Name" value={referrer.name || "—"} />
                  {referrer.type && (
                    <div>
                      <p className="text-[10px] uppercase text-slate-400 mb-0.5">Type</p>
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-md capitalize ${
                          referrer.type === "doctor"
                            ? "bg-blue-100 text-blue-700"
                            : referrer.type === "agent"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-teal-100 text-teal-700"
                        }`}
                      >
                        {referrer.type}
                      </span>
                    </div>
                  )}
                  {hasDiscount && (
                    <ManifestField
                      label="Discount"
                      value={`- ${fmt(amount.referrerDiscount)}`}
                      valueClass="text-red-600"
                    />
                  )}
                  {hasCommission && (
                    <ManifestField
                      label="Commission"
                      value={fmt(amount.referrerCommission)}
                      valueClass="text-blue-600"
                    />
                  )}
                </div>
              </ManifestBlock>
            )}

            {/* Tests */}
            <ManifestBlock icon={TestTube2} label="টেস্ট সমূহ" badge={invoice.tests?.length ?? 0}>
              <div className="space-y-1">
                {(invoice.tests ?? []).map((t, i) => (
                  <div key={t.testId || i} className="flex items-baseline gap-2">
                    <span className="text-[10px] text-slate-400 w-4 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-xs text-slate-900 flex-1 truncate">{t.name}</span>
                    <span className="flex-1 border-b border-dotted border-slate-200 translate-y-[-3px]" />
                    <span className="text-xs text-blue-600 tabular-nums shrink-0 font-medium">{fmt(t.price)}</span>
                  </div>
                ))}
              </div>
            </ManifestBlock>

            {/* Collection History */}
            {invoice.collections?.length > 0 && (
              <ManifestBlock icon={Clock} label="আদায় ইতিহাস" badge={invoice.collections.length}>
                <div className="space-y-1.5">
                  {invoice.collections.map((c, i) => {
                    const { date: cDate, time: cTime } = formatDateTime(c.at);
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-900 font-medium">{c.by?.name ?? "—"}</p>
                          <p className="text-[10px] text-slate-400">
                            {`${cDate} · ${cTime}`}
                            {c.mode && ` · ${paymentModeLabel(c.mode)}`}
                          </p>
                        </div>
                        <span className="text-sm text-emerald-600 tabular-nums font-semibold">{fmt(c.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </ManifestBlock>
            )}

            {/* Payment */}
            <ManifestBlock icon={DollarSign} label="পেমেন্ট বিবরণ">
              <div className="space-y-1.5 text-xs">
                {showSubtotal && <LedgerPayRow label="Subtotal" value={fmt(amount.initial)} />}
                {hasDiscount && (
                  <LedgerPayRow
                    label="Referrer Discount"
                    value={`- ${fmt(amount.referrerDiscount)}`}
                    valueClass="text-red-600"
                  />
                )}
                {(amount?.labAdjustment ?? 0) > 0 && (
                  <LedgerPayRow
                    label="Lab Adjustment"
                    value={`- ${fmt(amount.labAdjustment)}`}
                    valueClass="text-red-600"
                  />
                )}
                <div className="flex justify-between pt-2 border-t border-slate-100 font-semibold text-slate-900">
                  <span>মোট</span>
                  <span className="text-blue-600">{fmt(amount.final)}</span>
                </div>
                <LedgerPayRow label="আদায়" value={fmt(amount.paid)} valueClass="text-emerald-600 font-semibold" />
                {invoice.paymentMode && (
                  <LedgerPayRow
                    label="সর্বশেষ মাধ্যম"
                    value={paymentModeLabel(invoice.paymentMode)}
                    valueClass="text-slate-500"
                  />
                )}
                {!fullyPaid ? (
                  <LedgerPayRow label="বাকি" value={fmt(due)} valueClass="text-red-600 font-semibold" />
                ) : (
                  <div className="flex items-center justify-end gap-1.5 text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" />
                    <span className="text-[10px] font-semibold uppercase">Fully Paid</span>
                  </div>
                )}
              </div>
            </ManifestBlock>

            {/* Status row */}
            <div className="flex items-center gap-2">
              <ManifestStatusBadge
                active={delivered}
                activeClass="text-blue-600 border-blue-200 bg-blue-50"
                inactiveClass="text-slate-400 border-slate-200"
                icon={PackageCheck}
                activeLabel="Delivered"
                inactiveLabel="Not Delivered"
              />
              <ManifestStatusBadge
                active={fullyPaid}
                activeClass="text-emerald-600 border-emerald-200 bg-emerald-50"
                inactiveClass="text-red-600 border-red-200 bg-red-50"
                icon={Wallet}
                activeLabel="Fully Paid"
                inactiveLabel={`Due ৳${due.toLocaleString()}`}
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {invoiceRow && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="py-2.5 px-4 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
            >
              বন্ধ করুন
            </button>
            <Link
              to={`/outdoor/invoice/print/${invoiceId}`}
              className="flex-1 py-2.5 text-xs font-semibold border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-colors text-center"
            >
              ইনভয়েস খুলুন
            </Link>
            {rowHasReports && (
              <Link
                to="/report"
                state={{ invoiceId }}
                className="flex-1 py-2.5 text-xs font-semibold border border-red-600 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-colors text-center flex items-center justify-center gap-1.5"
              >
                <FlaskConical className="w-3 h-3" /> রিপোর্ট
              </Link>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── Edit Patient Modal ───────────────────────────────────────────────────────
//
// Patient age is stored server-side as { years, months, days } (see
// invoiceRoutes.js patientAgeSchema), NOT a single number — this modal now
// exposes three separate fields instead of one "Age" input, and requires at
// least one part to be non-zero (enforced client-side, matching the
// backend's schema comment: "None of the three parts is individually
// required server-side — any that are omitted default to 0").
//
// Contact number must be exactly 11 digits (standard BD mobile number
// length). Input strips non-digit characters and hard-caps length as the
// user types; submit is blocked until the value matches exactly.

export const EditPatientModal = ({ invoice, isOpen, onClose, onSaved, onLoadingChange, onError, onNetworkError }) => {
  const [form, setForm] = useState({ name: "", gender: "", years: "", months: "", days: "", contactNumber: "" });

  useEffect(() => {
    if (!invoice?.patient) return;
    const { name, gender, age, contactNumber } = invoice.patient;
    setForm({
      name: name || "",
      gender: gender || "",
      years: age?.years ? String(age.years) : "",
      months: age?.months ? String(age.months) : "",
      days: age?.days ? String(age.days) : "",
      contactNumber: contactNumber || "",
    });
  }, [invoice]);

  const hasAge = Number(form.years) > 0 || Number(form.months) > 0 || Number(form.days) > 0;
  const phoneValid = isValidPhone(form.contactNumber);
  const isValid = form.name.trim() && form.gender && hasAge && phoneValid;

  const handleSubmit = async () => {
    if (!isValid) return;
    onClose();

    const age = {
      years: Number(form.years) || 0,
      months: Number(form.months) || 0,
      days: Number(form.days) || 0,
    };
    const patient = {
      name: form.name.trim(),
      gender: form.gender,
      age,
      contactNumber: form.contactNumber.trim(),
    };

    try {
      onLoadingChange("Updating patient info...");
      await invoiceService.updatePatientInfo(invoice.invoiceId, { patient });
      onSaved(invoice.invoiceId, { patient });
    } catch (err) {
      if (isNetworkError(err)) {
        onNetworkError?.();
        onError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
      } else {
        onError(getErrorMessage(err, "Failed to update patient info. Please try again."));
      }
    } finally {
      onLoadingChange(null);
    }
  };

  const inputCls =
    "w-full pl-10 pr-3 py-3 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50 focus:bg-white";
  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  // Clamps a numeric age-part field to [0, max] as the user types, allowing
  // an empty string mid-edit rather than snapping to 0.
  const setAgePart = (field, max) => (e) => {
    const raw = e.target.value;
    if (raw === "") return setForm((p) => ({ ...p, [field]: "" }));
    const num = Math.min(max, Math.max(0, parseInt(raw, 10) || 0));
    setForm((p) => ({ ...p, [field]: String(num) }));
  };

  // Strips non-digits and hard-caps at PHONE_LENGTH characters as the user types.
  const setPhone = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, PHONE_LENGTH);
    setForm((p) => ({ ...p, contactNumber: digits }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">রোগীর তথ্য সম্পাদনা</h2>
            <p className="text-xs text-slate-400 mt-0.5">Invoice #{invoice?.invoiceId}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-5 space-y-4">
        <EditField label="Patient Name" required>
          <IconWrap icon={User}>
            <input type="text" value={form.name} onChange={set("name")} className={inputCls} placeholder="Full name" />
          </IconWrap>
        </EditField>

        <EditField label="Gender" required>
          <div className="flex gap-2">
            {["male", "female", "other"].map((g) => (
              <label
                key={g}
                className={`flex-1 flex items-center justify-center py-2.5 rounded-xl border cursor-pointer text-xs font-medium capitalize transition-all select-none ${
                  form.gender === g
                    ? "border-blue-600 bg-blue-50 text-blue-600"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="edit-gender"
                  value={g}
                  checked={form.gender === g}
                  onChange={() => setForm((p) => ({ ...p, gender: g }))}
                  className="sr-only"
                />
                {g}
              </label>
            ))}
          </div>
        </EditField>

        <EditField label="Age" required>
          <div className="grid grid-cols-3 gap-2">
            {[
              { field: "years", max: 150, label: "Years" },
              { field: "months", max: 11, label: "Months" },
              { field: "days", max: 31, label: "Days" },
            ].map(({ field, max, label }) => (
              <div key={field}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form[field]}
                  onChange={setAgePart(field, max)}
                  min="0"
                  max={max}
                  placeholder={label}
                  className="w-full px-2 py-3 text-base text-center border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50 focus:bg-white"
                />
                <span className="block text-center text-[10px] text-slate-400 mt-1">{label}</span>
              </div>
            ))}
          </div>
          {!hasAge && <p className="mt-1.5 text-[11px] text-red-500">অন্তত একটি বয়স অংশ পূরণ করুন</p>}
        </EditField>

        <EditField label="Contact" required>
          <IconWrap icon={Phone}>
            <input
              type="tel"
              inputMode="numeric"
              value={form.contactNumber}
              onChange={setPhone}
              className={inputCls}
              placeholder="01XXXXXXXXX"
              maxLength={PHONE_LENGTH}
            />
          </IconWrap>
          {form.contactNumber && !phoneValid && (
            <p className="mt-1.5 text-[11px] text-red-500">মোবাইল নম্বর অবশ্যই {PHONE_LENGTH} ডিজিটের হতে হবে</p>
          )}
        </EditField>
      </div>

      <div className="flex gap-2 px-5 pb-5 pt-1">
        <button
          onClick={onClose}
          className="flex-1 py-3 text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
        >
          বাতিল
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className="flex-1 py-3 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
        >
          সংরক্ষণ করুন
        </button>
      </div>
    </Modal>
  );
};

// ─── Shared Modal Primitives ──────────────────────────────────────────────────

const ManifestBlock = ({ icon: Icon, label, badge, children }) => (
  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
      </div>
      {badge !== undefined && <span className="text-[10px] text-slate-400">{badge}টি</span>}
    </div>
    {children}
  </div>
);

const ManifestField = ({ label, value, valueClass = "text-slate-900" }) => (
  <div>
    <p className="text-[10px] uppercase text-slate-400 mb-0.5">{label}</p>
    <p className={`font-semibold text-xs leading-snug ${valueClass}`}>{value}</p>
  </div>
);

const LedgerPayRow = ({ label, value, valueClass = "text-slate-900" }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-slate-500 flex-1">{label}</span>
    <span className="flex-1 border-b border-dotted border-slate-200 translate-y-[-3px]" />
    <span className={`shrink-0 ${valueClass}`}>{value}</span>
  </div>
);

const ManifestStatusBadge = ({ active, activeClass, inactiveClass, icon: Icon, activeLabel, inactiveLabel }) => (
  <span
    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-semibold uppercase tracking-wide border ${active ? activeClass : inactiveClass}`}
  >
    <Icon className="w-3.5 h-3.5" />
    {active ? activeLabel : inactiveLabel}
  </span>
);

const EditField = ({ label, required, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-500 mb-1.5">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const IconWrap = ({ icon: Icon, children }) => (
  <div className="relative">
    <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    {children}
  </div>
);

// ─── Skeletons ─────────────────────────────────────────────────────────────────

const SkeletonList = () => (
  <div className="space-y-3 animate-pulse">
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="h-4 w-40 bg-slate-100 rounded" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 bg-slate-100 rounded-xl" />
        ))}
      </div>
    </div>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex justify-between">
          <div className="h-4 w-32 bg-slate-100 rounded" />
          <div className="h-4 w-20 bg-slate-100 rounded" />
        </div>
        <div className="h-8 bg-slate-100 rounded-xl" />
        <div className="flex gap-1.5">
          <div className="h-7 w-16 bg-slate-100 rounded-lg" />
          <div className="h-7 w-16 bg-slate-100 rounded-lg" />
          <div className="h-7 w-16 bg-slate-100 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);

const DetailsSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-3">
      <div className="h-3 bg-slate-100 rounded w-1/3" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2 bg-slate-100 rounded w-1/2" />
            <div className="h-3 bg-slate-100 rounded w-3/4" />
          </div>
        ))}
      </div>
    </div>
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2">
      <div className="h-3 bg-slate-100 rounded w-1/4" />
      {[1, 2].map((i) => (
        <div key={i} className="flex justify-between items-center">
          <div className="h-3 bg-slate-100 rounded w-1/2" />
          <div className="h-3 bg-slate-100 rounded w-1/5" />
        </div>
      ))}
    </div>
  </div>
);

export default InvoiceList;
