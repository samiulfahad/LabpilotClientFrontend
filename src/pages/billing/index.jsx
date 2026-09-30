/**
 * Billing.jsx
 * Read-only billing page. Labs cannot mark bills paid from the client;
 * an unpaid bill shows a "Send Money to bKash" card instead.
 *
 * React Compiler handles memoisation — no useCallback/useMemo
 */

import { useState, useEffect } from "react";
import {
  CreditCard,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileText,
  TrendingUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Banknote,
  ReceiptText,
  BadgeCheck,
  CircleDollarSign,
  History,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import billingService from "../../api/billing";
import Popup from "../../components/popup";
import { useAuthStore } from "../../store/authStore";

// ── Config ─────────────────────────────────────────────────────────────────────

const PAYMENT_NUMBER = "01723939836"; // bKash / Nagad (Send Money)

// ── Error helpers ──────────────────────────────────────────────────────────────

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";

const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};

// ── Network error helper (mirrors CollectionReport et al.) ──────────────────
const isNetworkError = (error) => error?.isAxiosError === true && !error.response;

// ── Formatters ─────────────────────────────────────────────────────────────────

const BST_OFFSET_MS = 6 * 60 * 60 * 1000;

const fmt = {
  currency: (amount) => `৳${(amount ?? 0).toLocaleString("en-IN")}`,

  // billingPeriodStart/End and dueDate are BST calendar boundaries stored as
  // UTC ms — shift into BST, then lock the formatter to UTC display so the
  // viewer's own browser timezone can't re-shift the date again.
  date: (ts) =>
    ts
      ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(
          new Date(ts + BST_OFFSET_MS),
        )
      : "—",

  period: (ts) =>
    ts
      ? new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", timeZone: "UTC" }).format(
          new Date(ts + BST_OFFSET_MS),
        )
      : "—",

  // paidAt is an exact instant, not a BST calendar boundary — showing it in
  // the viewer's own local time is correct here, so no BST shift applied.
  datetime: (ts) =>
    ts
      ? new Date(ts).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "—",
};

// ── Breakdown row builder ───────────────────────────────────────────────────────
// Mirrors the backend's forceInvoiceFee branching: when true, feePerInvoice is
// the flat per-invoice rate actually charged; when false, totalInvoiceFee (the
// sum of each invoice's own fee) is what was actually charged.
const buildBreakdownRows = (breakdown) => {
  if (!breakdown) return [];
  const rows = breakdown.forceInvoiceFee
    ? [
        { label: "মাসিক ফি", value: breakdown.monthlyFee },
        { label: "প্রতি-ইনভয়েস ফি (নির্ধারিত)", value: breakdown.feePerInvoice },
        { label: "প্রতি-ইনভয়েস কমিশন", value: breakdown.commission },
        { label: "ইনভয়েস থেকে নেট চার্জ", value: breakdown.netInvoiceFee },
      ]
    : [
        { label: "মাসিক ফি", value: breakdown.monthlyFee },
        { label: "মোট ইনভয়েস ফি", value: breakdown.totalInvoiceFee },
        { label: "প্রতি-ইনভয়েস কমিশন", value: breakdown.commission },
        { label: "ইনভয়েস থেকে নেট চার্জ", value: breakdown.netInvoiceFee },
      ];
  return rows.filter((r) => r.value != null && r.value !== 0);
};

// ── Stat Card ──────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, color, grad, icon: Icon }) => (
  <div className="bg-white relative overflow-hidden border border-[#E2E8F0] rounded-2xl p-[14px_16px] shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
    <div className="absolute top-0 right-0 w-16 h-16 opacity-5 rounded-[0_16px_0_100%]" style={{ background: grad }} />
    <div className="flex items-center gap-2 mb-2">
      <div
        className="flex items-center justify-center w-[26px] h-[26px] rounded-lg"
        style={{ background: grad, boxShadow: `0 3px 8px ${color}30` }}
      >
        <Icon className="w-[13px] h-[13px] text-white" />
      </div>
      <p className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.06em] text-[#94A3B8]">
        {label}
      </p>
    </div>
    <p className="font-['IBM_Plex_Mono',monospace] text-[26px] font-extrabold leading-none" style={{ color }}>
      {value}
    </p>
  </div>
);

// ── Action Chip ────────────────────────────────────────────────────────────────

const ActionChip = ({ onClick, icon: Icon, label, color, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-1.5 transition-all font-semibold px-3 py-[5px] rounded-lg font-['IBM_Plex_Mono',monospace] text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
    style={{ border: `1.5px solid ${color}25`, color, background: `${color}08` }}
    onMouseEnter={(e) => {
      if (disabled) return;
      e.currentTarget.style.background = `${color}18`;
      e.currentTarget.style.borderColor = `${color}50`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = `${color}08`;
      e.currentTarget.style.borderColor = `${color}25`;
    }}
  >
    <Icon className="w-[11px] h-[11px]" />
    {label}
  </button>
);

// ── Status Badge ───────────────────────────────────────────────────────────────

const StatusBadge = ({ status, isOverdue }) => {
  if (status === "paid")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-['IBM_Plex_Mono',monospace] text-[10px] font-bold bg-[#10B98110] text-[#0D9488] border border-[#10B98125]">
        <CheckCircle2 className="w-[10px] h-[10px]" />
        পরিশোধিত
      </span>
    );
  if (isOverdue)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-['IBM_Plex_Mono',monospace] text-[10px] font-bold bg-[#EF444410] text-[#EF4444] border border-[#EF444425]">
        <AlertTriangle className="w-[10px] h-[10px]" />
        মেয়াদোত্তীর্ণ
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-['IBM_Plex_Mono',monospace] text-[10px] font-bold bg-[#F59E0B10] text-[#F59E0B] border border-[#F59E0B25]">
      <Clock className="w-[10px] h-[10px]" />
      বকেয়া
    </span>
  );
};

// ── Breakdown Accordion ────────────────────────────────────────────────────────

const BreakdownAccordion = ({ breakdown }) => {
  const [open, setOpen] = useState(false);
  if (!breakdown || Object.keys(breakdown).length === 0) return null;

  const rows = buildBreakdownRows(breakdown);
  if (rows.length === 0) return null;

  return (
    <div className="mt-3 border-[1.5px] border-[#E2E8F0] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[#F1F5F9]"
      >
        <span className="flex items-center gap-2 font-['IBM_Plex_Mono',monospace] text-[11px] font-bold uppercase tracking-[0.06em] text-[#64748B]">
          <TrendingUp className="w-[13px] h-[13px] text-[#6366F1]" />
          চার্জ বিস্তারিত
        </span>
        {open ? (
          <ChevronUp className="w-[13px] h-[13px] text-[#94A3B8]" />
        ) : (
          <ChevronDown className="w-[13px] h-[13px] text-[#94A3B8]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[#E2E8F0] divide-y divide-[#F1F5F9] bg-[#F8FAFC]">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between px-4 py-2.5">
              <span className="font-['IBM_Plex_Mono',monospace] text-[12px] text-[#64748B]">{r.label}</span>
              <span className="font-['IBM_Plex_Mono',monospace] text-[12px] font-bold text-[#0F172A]">
                {fmt.currency(r.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Current Bill Card ──────────────────────────────────────────────────────────

const CurrentBillCard = ({ status }) => {
  if (!status?.hasUnpaidBill) {
    return (
      <div
        className="flex items-center gap-4 p-5 rounded-2xl border-[1.5px] border-[#10B98130]"
        style={{ background: "linear-gradient(135deg,#F0FDF9,#ECFDF5)" }}
      >
        <div className="w-11 h-11 rounded-[14px] bg-[#10B98118] border border-[#10B98130] flex items-center justify-center shrink-0">
          <BadgeCheck className="w-5 h-5 text-[#0D9488]" />
        </div>
        <div>
          <p className="font-['IBM_Plex_Sans',sans-serif] text-sm font-bold text-[#0F172A]">কোনো বকেয়া নেই</p>
          <p className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#0D9488] mt-0.5">
            আপনার অ্যাকাউন্ট আপ-টু-ডেট। সব বিল পরিশোধিত।
          </p>
        </div>
      </div>
    );
  }

  const { bill, isOverdue } = status;
  const periodTs = bill.billingPeriodStart || bill.billingPeriod;
  const amount = bill.totalAmount ?? bill.amount;

  const accentColor = isOverdue ? "#EF4444" : "#F59E0B";
  const accentLight = isOverdue ? "#EF444410" : "#F59E0B10";
  const accentBorder = isOverdue ? "#EF444425" : "#F59E0B25";
  const gradFrom = isOverdue ? "#FEF2F2" : "#FFFBEB";
  const gradTo = isOverdue ? "#FFE4E6" : "#FEF3C7";
  const borderColor = isOverdue ? "#FECACA" : "#FDE68A";

  return (
    <div
      className="rounded-2xl border-[1.5px] p-5"
      style={{ background: `linear-gradient(135deg,${gradFrom},${gradTo})`, borderColor }}
    >
      {/* Bill header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 border"
            style={{ background: accentLight, borderColor: accentBorder }}
          >
            {isOverdue ? (
              <AlertTriangle className="w-5 h-5" style={{ color: accentColor }} />
            ) : (
              <Clock className="w-5 h-5" style={{ color: accentColor }} />
            )}
          </div>
          <div>
            <p
              className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.1em] mb-[2px]"
              style={{ color: accentColor }}
            >
              {isOverdue ? "পেমেন্ট মেয়াদোত্তীর্ণ" : "পেমেন্ট বকেয়া"}
            </p>
            <p className="font-['IBM_Plex_Sans',sans-serif] text-sm font-bold text-[#0F172A]">{fmt.period(periodTs)}</p>
          </div>
        </div>
        <StatusBadge status="unpaid" isOverdue={isOverdue} />
      </div>

      {/* Metric mini-cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "বকেয়া পরিমাণ", value: fmt.currency(amount), bold: true },
          { label: "শেষ তারিখ", value: fmt.date(bill.dueDate) },
          { label: "ইনভয়েস", value: `${bill.invoiceCount ?? 0}টি` },
        ].map(({ label, value, bold }) => (
          <div key={label} className="bg-white/70 rounded-xl border border-white/80 px-3 py-2.5">
            <p className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.06em] text-[#94A3B8] mb-1">
              {label}
            </p>
            <p
              className={`font-['IBM_Plex_Mono',monospace] leading-tight ${bold ? "text-[18px] font-extrabold text-[#0F172A]" : "text-[13px] font-semibold text-[#0F172A]"}`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <BreakdownAccordion breakdown={bill.breakdown} />

      {/* Send Money instruction — informational only, no client-side payment action */}
      <div className="mt-4 flex items-center gap-3 rounded-xl border-[1.5px] border-[#E2E8F0] bg-white px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-[#6366F1] flex items-center justify-center shrink-0">
          <Banknote className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
            bKash অথবা Nagad
          </p>
          <p className="font-['IBM_Plex_Sans',sans-serif] text-sm font-bold text-[#0F172A]">
            <span className="text-[#EF4444]">{fmt.currency(amount)}</span> সেন্ড মানি করুন
          </p>
          <p className="font-['IBM_Plex_Mono',monospace] text-[18px] font-extrabold text-[#0F172A] tracking-wide">
            {PAYMENT_NUMBER}
          </p>
        </div>
      </div>
    </div>
  );
};

// ── History Row ────────────────────────────────────────────────────────────────

const HistoryRow = ({ bill, index }) => {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = bill.status === "unpaid" && Date.now() > new Date(bill.dueDate).getTime();
  const isPaid = bill.status === "paid";
  const breakdownRows = buildBreakdownRows(bill.breakdown);

  return (
    <div className={`transition-all border-b border-[#E2E8F0] ${isPaid ? "opacity-100" : "opacity-90"}`}>
      <button onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        <div className="flex items-center gap-3 py-3 px-2 rounded-xl transition-all hover:bg-[#F1F5F9]">
          {/* Index */}
          <span className="flex items-center justify-center shrink-0 w-[26px] h-[26px] rounded-lg bg-[#EEF2FF] font-['IBM_Plex_Mono',monospace] text-[10px] font-bold text-[#64748B]">
            {String(index + 1).padStart(2, "0")}
          </span>

          {/* Period */}
          <div className="flex-1 min-w-0">
            <p className="font-['IBM_Plex_Sans',sans-serif] text-sm font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Calendar className="w-[11px] h-[11px] text-[#94A3B8] shrink-0" />
              {fmt.period(bill.billingPeriodStart)}
            </p>
          </div>

          {/* Amount */}
          <span className="font-['IBM_Plex_Mono',monospace] text-[13px] font-bold text-[#0F172A] shrink-0">
            {fmt.currency(bill.totalAmount)}
          </span>

          {/* Status badge */}
          <div className="shrink-0">
            <StatusBadge status={bill.status} isOverdue={isOverdue} />
          </div>

          <ChevronDown
            className={`w-[14px] h-[14px] text-[#94A3B8] transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div
          className="mx-2 mb-3 rounded-xl border border-[#E2E8F0] overflow-hidden"
          style={{ background: "linear-gradient(135deg,#F8FAFC,#EEF2FF)" }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
            {/* Breakdown */}
            {breakdownRows.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                <p className="px-4 py-2.5 font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] border-b border-[#E2E8F0]">
                  চার্জ বিস্তারিত
                </p>
                {breakdownRows.map((r) => (
                  <div
                    key={r.label}
                    className="flex justify-between px-4 py-2 border-b border-[#F1F5F9] last:border-b-0"
                  >
                    <span className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#64748B]">{r.label}</span>
                    <span className="font-['IBM_Plex_Mono',monospace] text-[11px] font-bold text-[#0F172A]">
                      {fmt.currency(r.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Details */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <p className="px-4 py-2.5 font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] border-b border-[#E2E8F0]">
                বিবরণ
              </p>
              <div className="divide-y divide-[#F1F5F9]">
                <div className="flex justify-between px-4 py-2">
                  <span className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#64748B]">মেয়াদ</span>
                  <span className="font-['IBM_Plex_Mono',monospace] text-[11px] font-bold text-[#0F172A]">
                    {fmt.date(bill.billingPeriodStart)} – {fmt.date(bill.billingPeriodEnd)}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-2">
                  <span className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#64748B]">ইনভয়েস</span>
                  <span className="font-['IBM_Plex_Mono',monospace] text-[11px] font-bold text-[#0F172A]">
                    {bill.invoiceCount ?? 0}টি
                  </span>
                </div>
                {bill.status === "paid" && (
                  <>
                    <div className="flex justify-between px-4 py-2">
                      <span className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#64748B]">পরিশোধ সময়</span>
                      <span className="font-['IBM_Plex_Mono',monospace] text-[11px] font-bold text-[#0F172A]">
                        {fmt.datetime(bill.paidAt)}
                      </span>
                    </div>
                    {bill.paidBy?.name && (
                      <div className="flex justify-between px-4 py-2">
                        <span className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#64748B]">পরিশোধকারী</span>
                        <span className="font-['IBM_Plex_Mono',monospace] text-[11px] font-bold text-[#0F172A]">
                          {bill.paidBy.name}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Skeleton ───────────────────────────────────────────────────────────────────

const Skeleton = () => (
  <div className="bg-white animate-pulse overflow-hidden border border-[#E2E8F0] rounded-[20px]">
    <div className="px-6 py-4 flex gap-4 border-b border-[#E2E8F0]">
      {[120, 70, 90].map((w, i) => (
        <div key={i} className="h-3 bg-[#E2E8F0] rounded-md" style={{ width: w }} />
      ))}
    </div>
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="flex items-center gap-3 px-6 py-3.5 border-b border-[#E2E8F0]">
        <div className="w-[26px] h-[26px] bg-[#E2E8F0] rounded-lg" />
        <div className="flex-1 h-[13px] bg-[#E2E8F0] rounded-md" />
        <div className="w-[65px] h-[22px] bg-[#E2E8F0] rounded-lg" />
        <div className="w-[60px] h-[22px] bg-[#E2E8F0] rounded-lg" />
      </div>
    ))}
  </div>
);

const StatsSkeleton = () => (
  <div className="grid grid-cols-3 gap-3 mb-5">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white animate-pulse border border-[#E2E8F0] rounded-2xl p-[14px_16px]">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-[26px] h-[26px] bg-[#E2E8F0] rounded-lg" />
          <div className="h-2 w-16 bg-[#E2E8F0] rounded-md" />
        </div>
        <div className="h-7 w-20 bg-[#E2E8F0] rounded-md" />
      </div>
    ))}
  </div>
);

const CurrentBillSkeleton = () => (
  <div className="bg-white animate-pulse border-[1.5px] border-[#E2E8F0] rounded-2xl p-5">
    <div className="flex items-start gap-3 mb-4">
      <div className="w-11 h-11 bg-[#E2E8F0] rounded-[14px] shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-2.5 w-24 bg-[#E2E8F0] rounded-md" />
        <div className="h-4 w-32 bg-[#E2E8F0] rounded-md" />
      </div>
    </div>
    <div className="grid grid-cols-3 gap-2 mb-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-[#F1F5F9] rounded-xl p-3 space-y-2">
          <div className="h-2 w-16 bg-[#E2E8F0] rounded-md" />
          <div className="h-5 w-20 bg-[#E2E8F0] rounded-md" />
        </div>
      ))}
    </div>
    <div className="h-11 w-full bg-[#E2E8F0] rounded-xl" />
  </div>
);

// ── Section Header ─────────────────────────────────────────────────────────────

const SectionHeader = ({ icon: Icon, eyebrow, subtitle, accentColor, right }) => (
  <div
    className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]"
    style={{ background: "linear-gradient(135deg,#F8FAFC,#EEF2FF)" }}
  >
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4" style={{ color: accentColor }} />
      <div>
        <p
          className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ color: accentColor }}
        >
          {eyebrow}
        </p>
        {subtitle && <p className="font-['IBM_Plex_Sans',sans-serif] text-xs text-[#94A3B8] mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {right}
  </div>
);

// ── Main Billing Page ──────────────────────────────────────────────────────────

const Billing = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const hasAccess = isAdmin || user?.permissions?.manageBilling === true;

  // All hooks must run unconditionally on every render — the permission
  // check (and its early return) happens AFTER every hook below.
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [statusError, setStatusError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offlinePopup, setOfflinePopup] = useState(false);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await billingService.getStatus();
      setStatus(res.data);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
        return;
      }
      setStatusError(getErrorMessage(err, "বিলিং স্ট্যাটাস লোড করতে ব্যর্থ।"));
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await billingService.getHistory();
      setHistory(res.data.bills ?? []);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
        return;
      }
      setHistoryError(getErrorMessage(err, "বিলিং ইতিহাস লোড করতে ব্যর্থ।"));
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    // Skip the fetch entirely for a user without access — the backend's
    // `authorize("manageBilling")` hook would reject history anyway.
    if (!hasAccess) return;
    fetchStatus();
    fetchHistory();
  }, [hasAccess]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchHistory()]);
    setRefreshing(false);
  };

  const totalPaid = history.filter((b) => b.status === "paid").reduce((s, b) => s + (b.totalAmount ?? 0), 0);
  const totalUnpaid = history.filter((b) => b.status === "unpaid").reduce((s, b) => s + (b.totalAmount ?? 0), 0);

  // ═══════════ ফ্রন্টএন্ড পারমিশন চেক ═══════════
  if (!hasAccess) {
    return (
      <Popup type="denied" message="মাসিক বিলিং দেখা বা পরিশোধ করার অনুমতি আপনার নেই।" onClose={() => navigate("/")} />
    );
  }
  // ════════════════════════════════════════════════

  return (
    <section
      className="min-h-screen px-4 py-6 font-['IBM_Plex_Sans',sans-serif]"
      style={{ background: "linear-gradient(to bottom right,#f8fafc,#eff6ff,#eef2ff)" }}
    >
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      <div className="max-w-2xl mx-auto">
        {/* ── Page header ────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-['IBM_Plex_Sans',sans-serif] text-[26px] font-bold text-[#0F172A] leading-tight">
              বিলিং
            </h1>
            <p className="text-sm text-[#64748B] mt-1">সাবস্ক্রিপশন পেমেন্ট ও বিলিং ইতিহাস পরিচালনা।</p>
          </div>
          <div className="pt-1">
            <ActionChip
              onClick={handleRefresh}
              icon={RefreshCw}
              label="রিফ্রেশ"
              color="#6366F1"
              disabled={refreshing}
            />
          </div>
        </div>

        {/* ── Stats strip ─────────────────────────────────────────────────── */}
        {loadingHistory ? (
          <StatsSkeleton />
        ) : history.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatCard
              label="মোট পরিশোধ"
              value={fmt.currency(totalPaid)}
              color="#0D9488"
              grad="linear-gradient(135deg,#0D9488,#0F766E)"
              icon={CircleDollarSign}
            />
            <StatCard
              label="বকেয়া"
              value={fmt.currency(totalUnpaid)}
              color={totalUnpaid > 0 ? "#EF4444" : "#94A3B8"}
              grad={
                totalUnpaid > 0 ? "linear-gradient(135deg,#EF4444,#DC2626)" : "linear-gradient(135deg,#94A3B8,#64748B)"
              }
              icon={Banknote}
            />
            <StatCard
              label="মোট রেকর্ড"
              value={`${history.length}`}
              color="#6366F1"
              grad="linear-gradient(135deg,#6366F1,#4F46E5)"
              icon={History}
            />
          </div>
        ) : null}

        {/* ── Current Bill card ───────────────────────────────────────────── */}
        <div className="bg-white overflow-hidden border border-[#E2E8F0] rounded-[20px] shadow-[0_4px_20px_rgba(15,23,42,0.07)] mb-4">
          <SectionHeader
            icon={CreditCard}
            eyebrow="বর্তমান বিল"
            accentColor="#6366F1"
            subtitle="এই মাসের পেমেন্ট স্ট্যাটাস"
          />
          <div className="p-4">
            {loadingStatus ? (
              <CurrentBillSkeleton />
            ) : statusError ? (
              <div className="flex items-center gap-2.5 px-4 py-3 bg-[#EF444408] border-[1.5px] border-[#EF444430] rounded-xl">
                <AlertCircle className="w-[14px] h-[14px] text-[#EF4444] shrink-0" />
                <div>
                  <p className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#EF4444]">{statusError}</p>
                  <button
                    onClick={fetchStatus}
                    className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#6366F1] mt-0.5 hover:underline"
                  >
                    আবার চেষ্টা করুন
                  </button>
                </div>
              </div>
            ) : (
              <CurrentBillCard status={status} />
            )}
          </div>
        </div>

        {/* ── History ledger card ─────────────────────────────────────────── */}
        <div className="bg-white overflow-hidden border border-[#E2E8F0] rounded-[20px] shadow-[0_4px_20px_rgba(15,23,42,0.07)]">
          <SectionHeader icon={FileText} eyebrow="বিলিং লেজার" accentColor="#6366F1" />

          {/* Column labels */}
          {!loadingHistory && history.length > 0 && (
            <div className="flex items-center gap-3 px-4 pt-3 pb-1">
              <span className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] w-[26px] shrink-0">
                #
              </span>
              <span className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] flex-1">
                মেয়াদ
              </span>
              <span className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] shrink-0">
                পরিমাণ
              </span>
              <span className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#94A3B8] shrink-0 w-[80px] text-right">
                স্ট্যাটাস
              </span>
              <span className="w-[14px] shrink-0" />
            </div>
          )}

          {/* Rows */}
          <div className="px-4 pb-4">
            {loadingHistory ? (
              <Skeleton />
            ) : historyError ? (
              <div className="flex items-center gap-2.5 px-4 py-3 my-2 bg-[#EF444408] border-[1.5px] border-[#EF444430] rounded-xl">
                <AlertCircle className="w-[14px] h-[14px] text-[#EF4444] shrink-0" />
                <div>
                  <p className="font-['IBM_Plex_Mono',monospace] text-[11px] text-[#EF4444]">{historyError}</p>
                  <button
                    onClick={fetchHistory}
                    className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#6366F1] mt-0.5 hover:underline"
                  >
                    আবার চেষ্টা করুন
                  </button>
                </div>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#94A3B8]">
                <ReceiptText className="w-7 h-7 opacity-40" />
                <p className="font-['IBM_Plex_Mono',monospace] text-xs">এখনো কোনো বিলিং রেকর্ড নেই</p>
                <p className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#CBD5E1]">বিল তৈরি হলে এখানে দেখাবে</p>
              </div>
            ) : (
              history.map((bill, index) => <HistoryRow key={bill._id} bill={bill} index={index} />)
            )}
          </div>

          {/* Footer note */}
          <div className="px-6 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC]">
            <p className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#94A3B8]">
              * শুধুমাত্র সক্রিয় সাবস্ক্রিপশনের বিল অন্তর্ভুক্ত
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Billing;
