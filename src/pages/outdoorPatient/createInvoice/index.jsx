/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 */
import { useEffect, useState, useRef, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Search,
  X,
  User,
  Phone,
  UserCircle,
  Check,
  Percent,
  DollarSign,
  Plus,
  Trash2,
  AlertCircle,
  Receipt,
  Sparkles,
  ChevronRight,
  Calendar,
  Building2,
  Wallet,
  Package,
  CreditCard,
  Stethoscope,
} from "lucide-react";
import Modal from "../../../components/modal";
import Popup from "../../../components/popup";
import invoiceService from "../../../api/invoice";
import LoadingScreen from "../../../components/loadingPage";
import { useAuthStore } from "../../../store/authStore"; // adjust path to your actual store

// ─── Constants ───────────────────────────────────────────────────────────────

const GENDERS = ["male", "female", "other"];

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "others", label: "Others" },
];

// Order in which "Enter" moves focus from one field to the next.
// The "use doctor as referrer" toggle (and every other toggle switch) is a
// click/tap action, not a typing field, so it is intentionally NOT part of
// this chain — Enter skips straight over it.
const FIELD_ORDER = [
  "patientName",
  "ageYears",
  "ageMonths",
  "ageDays",
  "contactNumber",
  "gender",
  "doctorSearch",
  "referrerSearch",
  "itemSearch",
  "referrerDiscountAmount",
  "labAdjustmentAmount",
  "paidAmount",
  "paymentMode",
];

const INITIAL_FORM = {
  patient: {
    name: "",
    gender: "",
    age: { years: "", months: "", days: "" },
    contactNumber: "",
  },
  doctor: null,
  useDoctorAsReferrer: false,
  referredBy: null,
  selectedTests: [],
  selectedProducts: [],
  hasReferrerDiscount: false,
  referrerDiscount: 0,
  hasLabAdjustment: false,
  labAdjustmentAmount: 0,
  paidAmount: "",
  paymentMode: "cash",
  onlineFeeEnabled: true,
  onlineFeePaidBy: "lab",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0 }).format(n);

const toFixed2 = (n) => parseFloat(n.toFixed(2));

const paymentModeLabel = (value) => PAYMENT_MODES.find((m) => m.value === value)?.label ?? value;

const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── Age helpers ──────────────────────────────────────────────────────────────
// Age is collected as three parts (years / months / days) and combined into
// a single compact string for display and for the payload sent to the
// backend — e.g. { years: 24, months: 5, days: 10 } -> "24yrs 5mo 10d".
// Any part that is blank/zero is simply left out; if every part is blank the
// result is "" (used to gate the "Age is required" validation).
const parseAgePart = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const normalizeAge = (age) => ({
  years: parseAgePart(age?.years),
  months: parseAgePart(age?.months),
  days: parseAgePart(age?.days),
});

const formatAge = (age) => {
  if (!age) return "";
  const { years, months, days } = normalizeAge(age);
  const parts = [];
  if (years > 0) parts.push(`${years}yrs`);
  if (months > 0) parts.push(`${months}mo`);
  if (days > 0) parts.push(`${days}d`);
  if (parts.length === 0) {
    return age?.years === "" || age?.years === undefined ? "" : "0yrs";
  }
  return parts.join(" ");
};

// Whether enough of the age has been entered to satisfy the "required" rule.
// FIX: previously only checked `years`, so entering just Months or just Days
// (leaving Years blank) still failed with "Age is required". Now valid if
// ANY of the three parts has been typed into.
const isAgeFilled = (age) =>
  [age?.years, age?.months, age?.days].some((v) => v !== "" && v !== null && v !== undefined);

// ── Error helpers ────────────────────────────────────────────────────────────

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";

const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};

const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

const calcReferrerDiscount = ({ referrer, hasReferrerDiscount, referrerDiscount, initial }) => {
  if (!hasReferrerDiscount || typeof referrer !== "object" || !referrer) return 0;
  if (referrer.commissionType === "percentage" && referrerDiscount > 0)
    return toFixed2((initial * referrerDiscount) / 100);
  if (referrer.commissionType === "fixed") return toFixed2(parseFloat(referrerDiscount) || 0);
  return 0;
};

const calcReferrerCommission = (referrer, initial, referrerDiscountAmt) => {
  if (!referrer?.commissionType || !referrer?.commissionValue) return 0;
  const gross =
    referrer.commissionType === "percentage"
      ? toFixed2((initial * referrer.commissionValue) / 100)
      : referrer.commissionValue;
  return Math.max(0, toFixed2(gross - referrerDiscountAmt));
};

const computeAmount = (form, feeConfig = {}) => {
  const { feePerInvoice = 0, forceInvoiceFee = false } = feeConfig;

  const testsTotal = form.selectedTests.reduce((s, t) => s + (t.price || 0), 0);
  const productsTotal = form.selectedProducts.reduce((s, p) => s + (p.price || 0) * (p.quantity || 1), 0);
  const initial = testsTotal + productsTotal;

  const effectiveReferrer = form.useDoctorAsReferrer ? form.doctor : form.referredBy;

  const referrerDiscount = calcReferrerDiscount({
    referrer: effectiveReferrer,
    hasReferrerDiscount: form.hasReferrerDiscount,
    referrerDiscount: form.referrerDiscount,
    initial,
  });
  const afterReferrerDiscount = Math.max(0, initial - referrerDiscount);

  const labAdjustmentRaw = form.hasLabAdjustment ? parseFloat(form.labAdjustmentAmount) || 0 : 0;
  const labAdjustment = Math.min(Math.max(0, labAdjustmentRaw), afterReferrerDiscount);

  const referrerCommission = calcReferrerCommission(effectiveReferrer, initial, referrerDiscount);

  const feeApplied = feePerInvoice > 0 && (forceInvoiceFee || form.onlineFeeEnabled);
  const invoiceFee = feeApplied ? feePerInvoice : 0;

  const beforeFee = Math.max(0, afterReferrerDiscount - labAdjustment);
  const final = toFixed2(beforeFee + invoiceFee);
  const net = Math.max(0, toFixed2(final - referrerCommission));
  const paid = parseFloat(form.paidAmount) || 0;

  return {
    initial,
    labAdjustment,
    referrerDiscount,
    referrerCommission,
    final,
    net,
    paid,
    afterReferrerDiscount,
    invoiceFee,
    feeApplied,
  };
};

// ─── UI primitives ───────────────────────────────────────────────────────────

const Field = ({ label, required, optional, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
      {optional && <span className="text-gray-400 text-xs ml-1">(Optional)</span>}
    </label>
    {children}
  </div>
);

const blurOnWheel = (e) => e.currentTarget.blur();

// forwardRef so parent components can register these inputs in the
// Enter-to-next-field focus chain (see FIELD_ORDER / registerField).
const IconInput = forwardRef(({ icon: Icon, className = "", ...props }, ref) => (
  <div className="relative">
    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
    <input
      ref={ref}
      className={`w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm
        focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${className}`}
      {...props}
      onWheel={props.type === "number" ? blurOnWheel : props.onWheel}
    />
  </div>
));
IconInput.displayName = "IconInput";

const AgePartInput = forwardRef(({ value, onChange, max, placeholder, onKeyDown }, ref) => (
  <input
    ref={ref}
    type="number"
    inputMode="numeric"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onWheel={blurOnWheel}
    onKeyDown={onKeyDown}
    min="0"
    max={max}
    placeholder={placeholder}
    className="w-full text-center py-2.5 px-2 border border-gray-300 rounded-lg text-sm
      focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
  />
));
AgePartInput.displayName = "AgePartInput";

const AgeInputGroup = ({ age, onAgeChange, fieldRefs = {}, onFieldKeyDown = {} }) => {
  const preview = formatAge(age);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <AgePartInput
            ref={fieldRefs.years}
            value={age.years}
            onChange={(v) => onAgeChange("years", v)}
            max={150}
            placeholder="Years"
            onKeyDown={onFieldKeyDown.years}
          />
          <p className="text-[10px] text-gray-400 text-center mt-1">Years</p>
        </div>
        <div>
          <AgePartInput
            ref={fieldRefs.months}
            value={age.months}
            onChange={(v) => onAgeChange("months", v)}
            max={11}
            placeholder="Months"
            onKeyDown={onFieldKeyDown.months}
          />
          <p className="text-[10px] text-gray-400 text-center mt-1">Months</p>
        </div>
        <div>
          <AgePartInput
            ref={fieldRefs.days}
            value={age.days}
            onChange={(v) => onAgeChange("days", v)}
            max={31}
            placeholder="Days"
            onKeyDown={onFieldKeyDown.days}
          />
          <p className="text-[10px] text-gray-400 text-center mt-1">Days</p>
        </div>
      </div>
      {preview && (
        <p className="mt-1.5 text-xs font-medium text-blue-600 flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {preview}
        </p>
      )}
    </div>
  );
};

const SectionCard = ({ icon: Icon, title, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
      <div className="p-2 bg-blue-50 rounded-lg">
        <Icon className="w-4 h-4 text-blue-600" />
      </div>
      <h3 className="font-medium text-gray-900">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const AmountRow = ({ label, value, accent, border, large }) => (
  <div
    className={`flex justify-between ${border ? "pt-2 border-t border-gray-200" : ""} ${large ? "pt-3 border-t-2 border-gray-200 text-base" : "text-sm"}`}
  >
    <span className={large ? "font-semibold text-gray-900" : "text-gray-600"}>{label}</span>
    <span className={`font-medium ${accent || (large ? "text-xl font-bold text-blue-600" : "text-gray-900")}`}>
      {value}
    </span>
  </div>
);

// ─── Product type badge ───────────────────────────────────────────────────────

const PRODUCT_TYPE_STYLES = {
  product: "bg-teal-100 text-teal-700",
  service: "bg-purple-100 text-purple-700",
  medicine: "bg-orange-100 text-orange-700",
};

const ProductTypeBadge = ({ type }) => (
  <span
    className={`px-1.5 py-0.5 text-[10px] font-medium rounded capitalize ${PRODUCT_TYPE_STYLES[type] || "bg-gray-100 text-gray-600"}`}
  >
    {type}
  </span>
);

// ─── Toggle switch ─────────────────────────────────────────────────────────

const ToggleSwitch = ({ checked, onChange, icon: Icon, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={`flex items-center justify-between w-full gap-3 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
  >
    <div className="flex items-center gap-1.5">
      <div className={`p-1.5 rounded transition-colors duration-200 ${checked ? "bg-blue-600" : "bg-gray-100"}`}>
        <Icon className={`w-3.5 h-3.5 transition-colors duration-200 ${checked ? "text-white" : "text-gray-500"}`} />
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </span>
  </button>
);

// ─── Payment mode selector ─────────────────────────────────────────────────

const PaymentModeSelector = ({ value, onChange, firstButtonRef, onEnterNext }) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <div className="p-1.5 bg-blue-50 rounded">
        <CreditCard className="w-3.5 h-3.5 text-blue-600" />
      </div>
      <span className="text-sm font-medium text-gray-700">Payment Mode</span>
    </div>
    <div className="flex flex-wrap gap-2">
      {PAYMENT_MODES.map((mode, idx) => (
        <button
          key={mode.value}
          ref={idx === 0 ? firstButtonRef : undefined}
          type="button"
          onClick={() => onChange(mode.value)}
          onKeyDown={(e) => {
            // Enter both picks this mode and signals "done with the form" —
            // since Payment Mode is the last field in the chain, this is
            // what opens the invoice preview (see focusNextField's fallback).
            if (e.key === "Enter") {
              e.preventDefault();
              onChange(mode.value);
              onEnterNext?.();
            }
          }}
          aria-pressed={value === mode.value}
          className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === mode.value
              ? "bg-blue-600 border-blue-600 text-white shadow-sm"
              : "bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  </div>
);

// ─── Invoice Summary modal ────────────────────────────────────────────────────

const InvoiceSummary = ({ formData, amount, onConfirm, onClose }) => {
  const {
    patient,
    referredBy,
    doctor,
    useDoctorAsReferrer,
    selectedTests,
    selectedProducts,
    hasReferrerDiscount,
    referrerDiscount,
    hasLabAdjustment,
    paymentMode,
  } = formData;
  const effectiveReferrer = useDoctorAsReferrer ? doctor : referredBy;
  const due = Math.max(0, amount.final - amount.paid);

  // The preview was just opened by pressing Enter on the last form field, so
  // move focus straight to "Confirm & Create" — the next Enter then creates
  // the invoice, without the user having to click or tab to it.
  const confirmButtonRef = useRef(null);
  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  return (
    <div className="bg-white rounded-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
      <div className="px-8 py-6 border-b border-gray-100 flex items-center gap-3">
        <div className="p-2.5 bg-blue-50 rounded-xl">
          <Receipt className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Invoice Preview</h2>
          <p className="text-sm text-gray-500">Review details before confirmation</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        <SummaryBlock icon={UserCircle} title="Patient Details">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Detail label="Full Name" value={patient.name} />
            <Detail label="Gender" value={<span className="capitalize">{patient.gender}</span>} />
            <Detail label="Age" value={formatAge(patient.age) || "—"} />
            <Detail label="Contact" value={patient.contactNumber || "—"} />
            {doctor && (
              <div className="col-span-2">
                <p className="text-gray-500">Doctor</p>
                <p className="font-medium text-gray-900">{typeof doctor === "object" ? doctor.name : doctor}</p>
                {typeof doctor === "object" && doctor.degree && (
                  <p className="text-xs text-gray-500 mt-0.5">{doctor.degree}</p>
                )}
              </div>
            )}
            {effectiveReferrer && (
              <div className="col-span-2">
                <p className="text-gray-500">Media - কমিশন ভোগকারী</p>
                <p className="font-medium text-gray-900">
                  {typeof effectiveReferrer === "object" ? effectiveReferrer.name : effectiveReferrer}
                  {useDoctorAsReferrer && <span className="text-xs text-gray-400 ml-1">(Doctor)</span>}
                </p>
                {typeof effectiveReferrer === "object" && effectiveReferrer?.commissionValue > 0 && (
                  <p className="text-xs text-blue-600 mt-0.5">
                    Commission:{" "}
                    {effectiveReferrer.commissionType === "percentage"
                      ? `${effectiveReferrer.commissionValue}% = ${fmt(amount.referrerCommission)}`
                      : `Fixed ${fmt(amount.referrerCommission)}`}
                  </p>
                )}
              </div>
            )}
          </div>
        </SummaryBlock>

        {selectedTests.length > 0 && (
          <SummaryBlock
            icon={FileText}
            title="Diagnostic Tests"
            badge={`${selectedTests.length} ${selectedTests.length === 1 ? "Test" : "Tests"}`}
          >
            <div className="space-y-2">
              {selectedTests.map((t) => (
                <div key={t.testId} className="flex items-center justify-between p-3 bg-white rounded-lg">
                  <span className="text-sm text-gray-900">{t.name}</span>
                  <span className="text-sm font-medium text-gray-900">{fmt(t.price)}</span>
                </div>
              ))}
            </div>
          </SummaryBlock>
        )}

        {selectedProducts.length > 0 && (
          <SummaryBlock
            icon={Package}
            title="Products / Services"
            badge={`${selectedProducts.length} ${selectedProducts.length === 1 ? "Item" : "Items"}`}
          >
            <div className="space-y-2">
              {selectedProducts.map((p) => (
                <div key={p._id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                  <span className="text-sm text-gray-900 flex items-center gap-1.5">
                    {p.name}
                    <span className="text-xs text-gray-400">× {p.quantity}</span>
                    <ProductTypeBadge type={p.type} />
                  </span>
                  <span className="text-sm font-medium text-gray-900">{fmt(p.price * p.quantity)}</span>
                </div>
              ))}
            </div>
          </SummaryBlock>
        )}

        <SummaryBlock icon={DollarSign} title="Payment Summary">
          <div className="space-y-2 text-sm">
            <AmountRow label="Subtotal" value={fmt(amount.initial)} />
            {hasReferrerDiscount && amount.referrerDiscount > 0 && (
              <>
                <AmountRow
                  label={`${useDoctorAsReferrer ? "Doctor" : "Referrer"} Discount ${effectiveReferrer?.commissionType === "percentage" ? `(${referrerDiscount}%)` : "(Fixed)"}`}
                  value={`- ${fmt(amount.referrerDiscount)}`}
                  accent="text-red-600"
                />
                <AmountRow label="After Media Discount" value={fmt(amount.afterReferrerDiscount)} border />
              </>
            )}
            {hasLabAdjustment && amount.labAdjustment > 0 && (
              <AmountRow label="Lab Adjustment" value={`- ${fmt(amount.labAdjustment)}`} accent="text-red-600" border />
            )}
            {amount.feeApplied && amount.invoiceFee > 0 && (
              <AmountRow
                label="Online Invoice Fee"
                value={`+ ${fmt(amount.invoiceFee)}`}
                accent="text-blue-600"
                border
              />
            )}
            <AmountRow label="Total Amount" value={fmt(amount.final)} large />
            <div className="mt-3 pt-3 border-t border-dashed border-gray-300 space-y-2">
              <AmountRow
                label={
                  <span className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-green-600" /> Paid Amount
                    <span className="text-xs font-normal text-gray-400">({paymentModeLabel(paymentMode)})</span>
                  </span>
                }
                value={fmt(amount.paid)}
                accent="text-green-600"
              />
              {due > 0 ? (
                <AmountRow label="Due Amount" value={fmt(due)} accent="text-red-600" />
              ) : (
                <div className="flex items-center justify-end gap-1.5">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-green-600 text-xs font-medium">Fully Paid</span>
                </div>
              )}
            </div>
          </div>
        </SummaryBlock>
      </div>

      <div className="border-t border-gray-100 px-8 py-4 flex items-center justify-end gap-3">
        <button
          onClick={onClose}
          className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
        <button
          ref={confirmButtonRef}
          onClick={onConfirm}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          Confirm & Create
        </button>
      </div>
    </div>
  );
};

const SummaryBlock = ({ icon: Icon, title, badge, children }) => (
  <div className="bg-gray-50 rounded-xl p-5">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-white rounded-lg shadow-sm">
          <Icon className="w-4 h-4 text-gray-700" />
        </div>
        <h3 className="font-medium text-gray-900">{title}</h3>
      </div>
      {badge && <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">{badge}</span>}
    </div>
    {children}
  </div>
);

const Detail = ({ label, value }) => (
  <div>
    <p className="text-gray-500">{label}</p>
    <p className="font-medium text-gray-900">{value}</p>
  </div>
);

// ─── Invoice Form ─────────────────────────────────────────────────────────────

const InvoiceForm = ({
  formData,
  amount,
  isAdmin,
  canAdjustLab,
  maxLabAdjustment,
  feePerInvoice,
  forceInvoiceFee,
  availableReferrers,
  availableTests,
  availableProducts,
  availableDoctors,
  onChange,
  onPatientChange,
  onAgeChange,
  onTestToggle,
  onProductToggle,
  onProductQtyChange,
  onSubmit,
  pendingReferrerNameRef,
  pendingDoctorNameRef,
}) => {
  const [referrerQuery, setReferrerQuery] = useState("");
  const [doctorQuery, setDoctorQuery] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [showReferrerDrop, setShowReferrerDrop] = useState(false);
  const [showDoctorDrop, setShowDoctorDrop] = useState(false);
  const [showItemDrop, setShowItemDrop] = useState(false);
  const itemDropRef = useRef(null);

  const [referrerActiveIndex, setReferrerActiveIndex] = useState(-1);
  const [doctorActiveIndex, setDoctorActiveIndex] = useState(-1);
  const [itemActiveIndex, setItemActiveIndex] = useState(-1);
  const referrerOptionRefs = useRef([]);
  const doctorOptionRefs = useRef([]);
  const itemOptionRefs = useRef([]);

  // Guards against the onBlur "free-text fallback" firing right after a
  // keyboard (Enter) selection. Selecting via Enter calls focusNextField(),
  // which synchronously blurs the still-focused doctor/referrer input
  // *before* React flushes the selection's setState calls — so onBlur was
  // seeing stale state (doctor/referredBy still null) and immediately
  // overwriting the freshly selected object with a plain string. Setting
  // this ref the instant a selection happens tells onBlur to skip that
  // fallback for this one blur. Mouse selection never hits this path
  // because onMouseDown already calls preventDefault(), suppressing blur.
  const skipDoctorBlurRef = useRef(false);
  const skipReferrerBlurRef = useRef(false);

  // ── "Enter moves to next field" chain ──────────────────────────────────
  // fieldRefs holds the live DOM node for every field that participates in
  // FIELD_ORDER. Fields that aren't currently rendered (e.g. the referrer
  // discount input when the discount isn't enabled) simply never register a
  // ref, so focusNextField skips right past them. Toggle switches (like
  // "use doctor as referrer") never register here, so Enter always skips them.
  const fieldRefs = useRef({});
  const formRef = useRef(null);
  const registerField = (key) => (el) => {
    fieldRefs.current[key] = el;
  };

  const focusNextField = (fromKey) => {
    const idx = FIELD_ORDER.indexOf(fromKey);
    if (idx === -1) return;
    for (let i = idx + 1; i < FIELD_ORDER.length; i++) {
      const el = fieldRefs.current[FIELD_ORDER[i]];
      if (el && !el.disabled) {
        el.focus();
        return;
      }
    }
    // Nothing left after this field (Payment Mode, normally) — Enter here
    // means "I'm done with the form", so submit it, which runs the usual
    // validation and opens the invoice preview.
    formRef.current?.requestSubmit();
  };

  const handleEnterToNext = (fromKey) => (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    focusNextField(fromKey);
  };

  const {
    patient,
    referredBy,
    doctor,
    useDoctorAsReferrer,
    selectedTests,
    selectedProducts,
    hasReferrerDiscount,
    referrerDiscount,
    hasLabAdjustment,
    labAdjustmentAmount,
    paidAmount,
    paymentMode,
    onlineFeeEnabled,
  } = formData;

  const effectiveReferrer = useDoctorAsReferrer ? doctor : referredBy;
  const due = Math.max(0, amount.final - amount.paid);

  useEffect(() => {
    const handler = (e) => {
      if (itemDropRef.current && !itemDropRef.current.contains(e.target)) setShowItemDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const q = normalize(itemQuery);
  const filteredTests = q ? availableTests.filter((t) => normalize(t.name).includes(q)) : availableTests;
  const filteredProducts = q ? availableProducts.filter((p) => normalize(p.name).includes(q)) : availableProducts;
  const hasResults = filteredTests.length > 0 || filteredProducts.length > 0;

  const itemFlatList = [
    ...filteredTests.map((t) => ({ kind: "test", data: t, selectable: true })),
    ...filteredProducts.map((p) => ({
      kind: "product",
      data: p,
      selectable: !(p.hasStock && p.stock === 0),
    })),
  ];

  const filteredReferrers = referrerQuery.trim()
    ? availableReferrers.filter((r) => normalize(r.name).includes(normalize(referrerQuery)))
    : availableReferrers;

  const filteredDoctors = doctorQuery.trim()
    ? availableDoctors.filter((d) => normalize(d.name).includes(normalize(doctorQuery)))
    : availableDoctors;

  useEffect(() => {
    setReferrerActiveIndex(-1);
  }, [referrerQuery, showReferrerDrop, useDoctorAsReferrer]);

  useEffect(() => {
    setDoctorActiveIndex(-1);
  }, [doctorQuery, showDoctorDrop]);

  useEffect(() => {
    setItemActiveIndex(-1);
  }, [itemQuery, showItemDrop]);

  const scrollActiveIntoView = (refsArr, index) => {
    const el = refsArr.current[index];
    if (el) el.scrollIntoView({ block: "nearest" });
  };

  const selectReferrer = (r) => {
    skipReferrerBlurRef.current = true;
    onChange("referredBy", r);
    setShowReferrerDrop(false);
    setReferrerQuery("");
    setReferrerActiveIndex(-1);
  };

  const selectDoctor = (d) => {
    skipDoctorBlurRef.current = true;
    onChange("doctor", d);
    setShowDoctorDrop(false);
    setDoctorQuery("");
    setDoctorActiveIndex(-1);
  };

  const selectItem = (entry) => {
    if (!entry || !entry.selectable) return;
    if (entry.kind === "test") onTestToggle(entry.data);
    else onProductToggle(entry.data);
    setItemQuery("");
    setShowItemDrop(false);
    setItemActiveIndex(-1);
  };

  // Enter always does one of two things: select the highlighted dropdown
  // item (and, if advanceOnSelect is true, move on to nextFieldKey), or —
  // when nothing is highlighted / the dropdown is closed — just move on to
  // nextFieldKey. Either way Enter never falls through to submit the form.
  const handleDropdownKeyDown = (
    e,
    { isOpen, list, activeIndex, setActiveIndex, onSelect, refsArr, closeDrop, advanceOnSelect = false, nextFieldKey },
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && list.length > 0 && activeIndex >= 0 && activeIndex < list.length) {
        onSelect(list[activeIndex]);
        if (advanceOnSelect && nextFieldKey) focusNextField(nextFieldKey);
        return;
      }
      closeDrop();
      if (nextFieldKey) focusNextField(nextFieldKey);
      return;
    }

    if (!isOpen || list.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = activeIndex < list.length - 1 ? activeIndex + 1 : 0;
      setActiveIndex(next);
      scrollActiveIntoView(refsArr, next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = activeIndex > 0 ? activeIndex - 1 : list.length - 1;
      setActiveIndex(next);
      scrollActiveIntoView(refsArr, next);
    } else if (e.key === "Escape") {
      setActiveIndex(-1);
      closeDrop();
    }
  };

  const referrerDisplayValue = referredBy && typeof referredBy === "object" ? referredBy.name : referrerQuery;
  const doctorDisplayValue = doctor && typeof doctor === "object" ? doctor.name : doctorQuery;

  const clearReferrer = (e) => {
    e.preventDefault();
    onChange("referredBy", null);
    setReferrerQuery("");
    if (pendingReferrerNameRef) pendingReferrerNameRef.current = "";
  };

  const clearDoctor = (e) => {
    e.preventDefault();
    onChange("doctor", null);
    setDoctorQuery("");
    if (pendingDoctorNameRef) pendingDoctorNameRef.current = "";
    if (useDoctorAsReferrer) onChange("useDoctorAsReferrer", false);
  };

  const handleReferrerDiscountToggle = (checked) => {
    onChange("hasReferrerDiscount", checked);
    onChange("referrerDiscount", checked ? effectiveReferrer?.commissionValue || 0 : 0);
  };

  const labAdjustmentCap = isAdmin
    ? amount.afterReferrerDiscount
    : Math.min(maxLabAdjustment, amount.afterReferrerDiscount);

  const handleLabAdjustToggle = (checked) => {
    if (checked && !canAdjustLab) return;
    onChange("hasLabAdjustment", checked);
    if (!checked) onChange("labAdjustmentAmount", 0);
  };

  const clampLabAdjustment = (val) => {
    if (val === "") return onChange("labAdjustmentAmount", "");
    const num = parseFloat(val) || 0;
    onChange("labAdjustmentAmount", Math.min(Math.max(0, num), labAdjustmentCap));
  };

  const clampDiscount = (val) => {
    if (val === "") return onChange("referrerDiscount", "");
    const max =
      effectiveReferrer?.commissionValue ?? (effectiveReferrer?.commissionType === "percentage" ? 100 : Infinity);
    onChange("referrerDiscount", Math.min(parseFloat(val) || 0, max));
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
      <SectionCard icon={UserCircle} title="Patient Information">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Patient Name" required>
            <IconInput
              icon={User}
              ref={registerField("patientName")}
              onKeyDown={handleEnterToNext("patientName")}
              value={patient.name}
              onChange={(e) => onPatientChange("name", e.target.value)}
              placeholder="Enter patient's full name"
              required
            />
          </Field>

          <Field label="Age" required>
            <AgeInputGroup
              age={patient.age}
              onAgeChange={onAgeChange}
              fieldRefs={{
                years: registerField("ageYears"),
                months: registerField("ageMonths"),
                days: registerField("ageDays"),
              }}
              onFieldKeyDown={{
                years: handleEnterToNext("ageYears"),
                months: handleEnterToNext("ageMonths"),
                days: handleEnterToNext("ageDays"),
              }}
            />
          </Field>

          <Field label="Contact Number" optional>
            <IconInput
              icon={Phone}
              ref={registerField("contactNumber")}
              onKeyDown={handleEnterToNext("contactNumber")}
              type="tel"
              value={patient.contactNumber}
              onChange={(e) => onPatientChange("contactNumber", e.target.value)}
              placeholder="01XXXXXXXXX"
              maxLength={11}
            />
          </Field>

          <Field label="Gender" required>
            {/* Native radios already support Left/Right/Up/Down to move
                between the group and select as they go. We only add: (1)
                auto-selecting "male" the first time focus lands here with
                nothing chosen yet, and (2) Enter moving on to the next
                field instead of submitting the form. */}
            <div className="flex gap-2">
              {GENDERS.map((g) => (
                <label
                  key={g}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 border rounded-lg cursor-pointer transition-all text-sm font-medium select-none ${
                    patient.gender === g
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
                  }`}
                >
                  <input
                    ref={g === "male" ? registerField("gender") : undefined}
                    type="radio"
                    name="gender"
                    value={g}
                    checked={patient.gender === g}
                    onChange={() => onPatientChange("gender", g)}
                    onFocus={
                      g === "male"
                        ? () => {
                            if (!patient.gender) onPatientChange("gender", "male");
                          }
                        : undefined
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        focusNextField("gender");
                      }
                    }}
                    className="sr-only"
                    required={!patient.gender}
                  />
                  <span className="capitalize">{g}</span>
                </label>
              ))}
            </div>
          </Field>

          <div className="md:col-span-2">
            <Field label="Doctor" optional>
              <div className="relative">
                <div className="relative">
                  <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                  <input
                    ref={registerField("doctorSearch")}
                    type="text"
                    value={doctorDisplayValue}
                    onChange={(e) => {
                      setDoctorQuery(e.target.value);
                      if (pendingDoctorNameRef) pendingDoctorNameRef.current = e.target.value;
                      if (typeof doctor === "object" && doctor !== null) {
                        onChange("doctor", null);
                        if (useDoctorAsReferrer) onChange("useDoctorAsReferrer", false);
                      }
                      setShowDoctorDrop(true);
                    }}
                    onFocus={() => setShowDoctorDrop(true)}
                    onKeyDown={(e) =>
                      handleDropdownKeyDown(e, {
                        isOpen: showDoctorDrop && !!doctorQuery,
                        list: filteredDoctors,
                        activeIndex: doctorActiveIndex,
                        setActiveIndex: setDoctorActiveIndex,
                        onSelect: selectDoctor,
                        refsArr: doctorOptionRefs,
                        closeDrop: () => setShowDoctorDrop(false),
                        advanceOnSelect: true,
                        nextFieldKey: "doctorSearch",
                      })
                    }
                    onBlur={() => {
                      if (skipDoctorBlurRef.current) {
                        // A keyboard (Enter) selection just happened and is
                        // about to move focus elsewhere. Don't let this
                        // blur's stale closure re-run the free-text
                        // fallback and clobber the object we just selected.
                        skipDoctorBlurRef.current = false;
                      } else if (doctorQuery.trim() && (doctor === null || typeof doctor === "string")) {
                        onChange("doctor", doctorQuery.trim());
                      }
                      setShowDoctorDrop(false);
                    }}
                    className="w-full pl-9 pr-9 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="Search doctor by name"
                  />
                  {doctor && (
                    <button
                      type="button"
                      onMouseDown={clearDoctor}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {showDoctorDrop && doctorQuery && (
                  <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-20">
                    {filteredDoctors.length > 0 ? (
                      filteredDoctors.map((d, idx) => (
                        <button
                          key={d._id}
                          type="button"
                          ref={(el) => (doctorOptionRefs.current[idx] = el)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectDoctor(d);
                          }}
                          onMouseEnter={() => setDoctorActiveIndex(idx)}
                          className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 ${
                            idx === doctorActiveIndex ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <p className="font-medium text-gray-900 text-sm">{d.name}</p>
                          {d.degree && <p className="text-xs text-gray-500 mt-0.5">{d.degree}</p>}
                          {d.commissionValue > 0 && (
                            <p className="text-xs text-blue-500 mt-0.5">
                              Commission:{" "}
                              {d.commissionType === "percentage"
                                ? `${d.commissionValue}%`
                                : `Fixed ${fmt(d.commissionValue)}`}
                            </p>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-center text-xs text-gray-400">No matching doctors</div>
                    )}
                  </div>
                )}
              </div>
              {doctor && typeof doctor === "object" && (doctor.degree || doctor.commissionValue > 0) && (
                <div className="mt-1 pl-1 space-y-0.5">
                  {doctor.degree && <p className="text-xs text-gray-500">{doctor.degree}</p>}
                  {doctor.commissionValue > 0 && (
                    <p className="text-xs text-blue-600">
                      Commission:{" "}
                      {doctor.commissionType === "percentage"
                        ? `${doctor.commissionValue}% of subtotal`
                        : `Fixed ${fmt(doctor.commissionValue)}`}
                      {!useDoctorAsReferrer && (
                        <span className="text-gray-400"> — applies only if used as referrer</span>
                      )}
                    </p>
                  )}
                </div>
              )}
            </Field>

            <div className="mt-2.5">
              <ToggleSwitch
                checked={useDoctorAsReferrer}
                onChange={(val) => onChange("useDoctorAsReferrer", val)}
                icon={UserCircle}
                label="ডাক্তারকে Media হিসাবে ব্যবহার করুন "
                disabled={!doctor}
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <Field label="Media - কমিশন ভোগকারী" optional>
              <div className="relative">
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                  <input
                    ref={registerField("referrerSearch")}
                    type="text"
                    value={referrerDisplayValue}
                    disabled={useDoctorAsReferrer}
                    onChange={(e) => {
                      setReferrerQuery(e.target.value);
                      if (pendingReferrerNameRef) pendingReferrerNameRef.current = e.target.value;
                      if (typeof referredBy === "object") onChange("referredBy", null);
                      setShowReferrerDrop(true);
                    }}
                    onFocus={() => setShowReferrerDrop(true)}
                    onKeyDown={(e) =>
                      handleDropdownKeyDown(e, {
                        isOpen: showReferrerDrop && !!referrerQuery && !useDoctorAsReferrer,
                        list: filteredReferrers,
                        activeIndex: referrerActiveIndex,
                        setActiveIndex: setReferrerActiveIndex,
                        onSelect: selectReferrer,
                        refsArr: referrerOptionRefs,
                        closeDrop: () => setShowReferrerDrop(false),
                        advanceOnSelect: true,
                        nextFieldKey: "referrerSearch",
                      })
                    }
                    onBlur={() => {
                      if (skipReferrerBlurRef.current) {
                        // Same stale-closure race as the doctor field —
                        // see the comment on skipDoctorBlurRef above.
                        skipReferrerBlurRef.current = false;
                      } else if (referrerQuery.trim() && (referredBy === null || typeof referredBy === "string")) {
                        onChange("referredBy", referrerQuery.trim());
                      }
                      setShowReferrerDrop(false);
                    }}
                    className={`w-full pl-9 pr-9 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${useDoctorAsReferrer ? "bg-gray-50 text-gray-400 cursor-not-allowed" : ""}`}
                    placeholder={useDoctorAsReferrer ? "Using doctor as referrer" : "Search by name"}
                  />
                  {referredBy && !useDoctorAsReferrer && (
                    <button
                      type="button"
                      onMouseDown={clearReferrer}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {showReferrerDrop && referrerQuery && !useDoctorAsReferrer && (
                  <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-20">
                    {filteredReferrers.length > 0 ? (
                      filteredReferrers.map((r, idx) => (
                        <button
                          key={r._id}
                          type="button"
                          ref={(el) => (referrerOptionRefs.current[idx] = el)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectReferrer(r);
                          }}
                          onMouseEnter={() => setReferrerActiveIndex(idx)}
                          className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 ${
                            idx === referrerActiveIndex ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                              {r.type === "doctor" && r.degree && (
                                <p className="text-xs text-gray-400 mt-0.5">{r.degree}</p>
                              )}
                              {r.commissionValue > 0 && (
                                <p className="text-xs text-blue-500 mt-0.5">
                                  Commission:{" "}
                                  {r.commissionType === "percentage"
                                    ? `${r.commissionValue}%`
                                    : `Fixed ${fmt(r.commissionValue)}`}
                                </p>
                              )}
                            </div>
                            {r.type && (
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded capitalize ${
                                  r.type === "doctor"
                                    ? "bg-blue-100 text-blue-700"
                                    : r.type === "agent"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-teal-100 text-teal-700"
                                }`}
                              >
                                {r.type}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-center text-xs text-gray-400">No matching referrers</div>
                    )}
                  </div>
                )}
              </div>
              {referredBy?.commissionValue > 0 && (
                <p className="mt-1 text-xs text-blue-600 pl-1">
                  Commission:{" "}
                  {referredBy.commissionType === "percentage"
                    ? `${referredBy.commissionValue}% of subtotal`
                    : `Fixed ${fmt(referredBy.commissionValue)}`}
                </p>
              )}
              {referredBy?.type === "doctor" && referredBy?.degree && (
                <p className="mt-0.5 text-xs text-gray-500 pl-1">{referredBy.degree}</p>
              )}
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={FileText} title="Tests & Products">
        <div className="relative mb-5" ref={itemDropRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={registerField("itemSearch")}
              type="text"
              value={itemQuery}
              onChange={(e) => {
                setItemQuery(e.target.value);
                setShowItemDrop(true);
              }}
              onFocus={() => setShowItemDrop(true)}
              onKeyDown={(e) =>
                handleDropdownKeyDown(e, {
                  isOpen: showItemDrop && !!itemQuery,
                  list: itemFlatList,
                  activeIndex: itemActiveIndex,
                  setActiveIndex: setItemActiveIndex,
                  onSelect: selectItem,
                  refsArr: itemOptionRefs,
                  closeDrop: () => setShowItemDrop(false),
                  // Stay in the search box after picking an item so the
                  // user can keep adding more tests/products. Enter only
                  // moves on once there's nothing left to select.
                  advanceOnSelect: false,
                  nextFieldKey: "itemSearch",
                })
              }
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder="Search tests or products..."
            />
          </div>

          {showItemDrop && itemQuery && (
            <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto z-20">
              {hasResults ? (
                <>
                  {filteredTests.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tests</span>
                      </div>
                      {filteredTests.map((test, idx) => {
                        const selected = selectedTests.some((t) => t.testId === test.testId);
                        const active = idx === itemActiveIndex;
                        return (
                          <button
                            key={test.testId}
                            type="button"
                            ref={(el) => (itemOptionRefs.current[idx] = el)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectItem(itemFlatList[idx]);
                            }}
                            onMouseEnter={() => setItemActiveIndex(idx)}
                            className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 transition-colors ${
                              active ? "bg-blue-100" : selected ? "bg-blue-50" : "hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{test.name}</p>
                                <p className="text-xs text-blue-600 font-medium">{fmt(test.price)}</p>
                              </div>
                              {selected && (
                                <div className="p-1 bg-blue-600 rounded-full">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {filteredProducts.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Products</span>
                      </div>
                      {filteredProducts.map((product, pIdx) => {
                        const idx = filteredTests.length + pIdx;
                        const selected = selectedProducts.some((p) => p._id === product._id);
                        const outOfStock = product.hasStock && product.stock === 0;
                        const active = idx === itemActiveIndex;
                        return (
                          <button
                            key={product._id}
                            type="button"
                            disabled={outOfStock}
                            ref={(el) => (itemOptionRefs.current[idx] = el)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!outOfStock) selectItem(itemFlatList[idx]);
                            }}
                            onMouseEnter={() => setItemActiveIndex(idx)}
                            className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-0 transition-colors
                              ${outOfStock ? "opacity-40 cursor-not-allowed" : ""}
                              ${active && !outOfStock ? "bg-blue-100" : selected ? "bg-blue-50" : !outOfStock ? "hover:bg-gray-50" : ""}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                                  {product.name}
                                  <ProductTypeBadge type={product.type} />
                                </p>
                                <p className="text-xs text-blue-600 font-medium">{fmt(product.price)}</p>
                                {product.hasStock && (
                                  <p
                                    className={`text-xs mt-0.5 ${product.stock === 0 ? "text-red-500 font-medium" : "text-gray-400"}`}
                                  >
                                    Stock: {product.stock ?? 0}
                                  </p>
                                )}
                              </div>
                              {selected && (
                                <div className="p-1 bg-blue-600 rounded-full shrink-0">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </>
              ) : (
                <div className="px-4 py-6 text-center text-gray-500 text-sm">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>No tests or products found</p>
                </div>
              )}
            </div>
          )}
        </div>

        {selectedTests.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-gray-500" />
                <h4 className="text-sm font-medium text-gray-700">Tests</h4>
              </div>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                {selectedTests.length} Selected
              </span>
            </div>
            <div className="space-y-2">
              {selectedTests.map((test) => (
                <div
                  key={test.testId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{test.name}</p>
                    <p className="text-xs text-blue-600 font-medium">{fmt(test.price)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTestToggle(test)}
                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedProducts.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-gray-500" />
                <h4 className="text-sm font-medium text-gray-700">Products</h4>
              </div>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                {selectedProducts.length} Selected
              </span>
            </div>
            <div className="space-y-2">
              {selectedProducts.map((product) => (
                <div
                  key={product._id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate flex items-center gap-1.5">
                      {product.name}
                      <ProductTypeBadge type={product.type} />
                    </p>
                    <p className="text-xs text-blue-600 font-medium">
                      {fmt(product.price)} × {product.quantity} = {fmt(product.price * product.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      value={product.quantity}
                      onChange={(e) => onProductQtyChange(product._id, e.target.value)}
                      onWheel={blurOnWheel}
                      min="1"
                      max={product.hasStock ? product.stock : undefined}
                      className="w-16 text-center py-1.5 px-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => onProductToggle(product)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTests.length === 0 && selectedProducts.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-full shadow-sm mb-3">
              <Plus className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-gray-900 font-medium mb-1">Nothing selected yet</p>
            <p className="text-sm text-gray-500">Search and add tests or products above</p>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={DollarSign} title="Pricing & Adjustments">
        <div className="space-y-5">
          <div className="p-4 bg-gray-50 rounded-lg flex items-center justify-between">
            <span className="text-sm text-gray-600">Subtotal Amount</span>
            <span className="text-xl font-semibold text-gray-900">{fmt(amount.initial)}</span>
          </div>

          {effectiveReferrer && typeof effectiveReferrer === "object" && (
            <div className="space-y-3">
              <ToggleSwitch
                checked={hasReferrerDiscount}
                onChange={handleReferrerDiscountToggle}
                icon={Percent}
                label={`Apply ${useDoctorAsReferrer ? "Doctor" : "Media"} Discount`}
              />
              {hasReferrerDiscount && (
                <div className="ml-6 p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-3">
                  <Field
                    label={
                      <>
                        {effectiveReferrer.commissionType === "percentage" ? "Discount Percentage" : "Discount Amount"}
                        <span className="ml-1.5 text-xs font-normal text-blue-600">
                          (max{" "}
                          {effectiveReferrer.commissionType === "percentage"
                            ? `${effectiveReferrer.commissionValue}%`
                            : fmt(effectiveReferrer.commissionValue)}
                          )
                        </span>
                      </>
                    }
                  >
                    <IconInput
                      icon={effectiveReferrer.commissionType === "percentage" ? Percent : DollarSign}
                      ref={registerField("referrerDiscountAmount")}
                      onKeyDown={handleEnterToNext("referrerDiscountAmount")}
                      type="number"
                      value={referrerDiscount}
                      onChange={(e) => clampDiscount(e.target.value)}
                      min="0"
                      max={effectiveReferrer.commissionValue}
                      step="0.01"
                    />
                  </Field>
                  <div className="p-3 bg-white rounded-lg border border-blue-200 flex items-center justify-between text-sm">
                    <span className="text-gray-600">After Media Discount</span>
                    <span className="font-medium text-blue-600">{fmt(amount.afterReferrerDiscount)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {canAdjustLab && (
            <div className="space-y-3">
              <ToggleSwitch
                checked={hasLabAdjustment}
                onChange={handleLabAdjustToggle}
                icon={DollarSign}
                label="Apply Lab Adjustment"
              />
              {hasLabAdjustment && (
                <div className="ml-6 p-4 bg-yellow-50 rounded-lg border border-yellow-100">
                  <Field
                    label={
                      <>
                        Lab Adjustment Amount
                        <span className="ml-1.5 text-xs font-normal text-yellow-700">
                          (max {fmt(labAdjustmentCap)})
                        </span>
                      </>
                    }
                  >
                    <IconInput
                      icon={DollarSign}
                      ref={registerField("labAdjustmentAmount")}
                      onKeyDown={handleEnterToNext("labAdjustmentAmount")}
                      type="number"
                      value={labAdjustmentAmount}
                      onChange={(e) => clampLabAdjustment(e.target.value)}
                      placeholder="Enter adjustment amount"
                      min="0"
                      max={labAdjustmentCap}
                      step="0.01"
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          {feePerInvoice > 0 && (
            <div className="space-y-2">
              {forceInvoiceFee ? (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-gray-500" />
                    Online Invoice Fee <span className="text-xs text-gray-400 font-normal">(Mandatory)</span>
                  </span>
                  <span className="text-sm font-medium text-gray-900">{fmt(feePerInvoice)}</span>
                </div>
              ) : (
                <ToggleSwitch
                  checked={onlineFeeEnabled}
                  onChange={(val) => onChange("onlineFeeEnabled", val)}
                  icon={Wallet}
                  label={`Apply Online Invoice Fee (${fmt(feePerInvoice)})`}
                />
              )}
              {(forceInvoiceFee || onlineFeeEnabled) && (
                <p className="text-xs text-gray-400 pl-1">This fee will be added to the patient's total amount.</p>
              )}
            </div>
          )}

          <div className="p-5 bg-blue-600 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white uppercase tracking-wide">Total Amount</span>
            </div>
            <span className="text-2xl font-bold text-white">{fmt(amount.final)}</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-green-50 rounded">
                <Wallet className="w-3.5 h-3.5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">Paid Amount</span>
            </div>
            <IconInput
              icon={Wallet}
              ref={registerField("paidAmount")}
              onKeyDown={handleEnterToNext("paidAmount")}
              type="number"
              value={paidAmount}
              onChange={(e) => onChange("paidAmount", e.target.value)}
              placeholder="Enter amount paid by patient"
              min="0"
              step="0.01"
              className="focus:ring-green-500/20 focus:border-green-500"
            />

            <PaymentModeSelector
              value={paymentMode}
              onChange={(val) => onChange("paymentMode", val)}
              firstButtonRef={registerField("paymentMode")}
              onEnterNext={() => focusNextField("paymentMode")}
            />

            {amount.final > 0 && (
              <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Paid
                  </span>
                  <span className="font-medium text-green-600">{fmt(amount.paid)}</span>
                </div>
                {due > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-gray-600 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Due
                    </span>
                    <span className="font-medium text-red-600">{fmt(due)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-green-600 font-medium">
                    <Check className="w-3.5 h-3.5" /> Fully Paid
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <button
          type="submit"
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <Receipt className="w-4 h-4" />
          <span>Preview Invoice</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────

const FormSkeleton = () => (
  <div className="space-y-5">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-100 px-6 py-4 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="p-6 space-y-4">
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

const CreateInvoice = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const lab = useAuthStore((s) => s.lab);

  const isAdmin = user?.role === "admin";
  const hasAccess = isAdmin || user?.permissions?.createInvoice === true;
  if (!hasAccess) {
    return <Popup type="denied" message="ইনভয়েস তৈরি করার অনুমতি আপনার নেই।" onClose={() => navigate("/")} />;
  }

  const maxLabAdjustment = user?.maxLabAdjustment ?? 0;
  const canAdjustLab = isAdmin || maxLabAdjustment > 0;

  const feePerInvoice = lab?.billing?.feePerInvoice ?? 0;
  const forceInvoiceFee = !!lab?.billing?.forceInvoiceFee;

  const [availableReferrers, setAvailableReferrers] = useState([]);
  const [availableTests, setAvailableTests] = useState([]);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [popup, setPopup] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const pendingReferrerNameRef = useRef("");
  const pendingDoctorNameRef = useRef("");

  const amount = computeAmount(formData, { feePerInvoice, forceInvoiceFee });

  useEffect(() => {
    Promise.all([invoiceService.getRequiredData(), invoiceService.getDoctors()])
      .then(([reqRes, docRes]) => {
        setAvailableReferrers(reqRes.data.referrers || []);
        setAvailableTests(reqRes.data.tests || []);
        setAvailableProducts(reqRes.data.products || []);
        setAvailableDoctors(docRes.data.doctors || []);
      })
      .catch((err) => {
        if (isNetworkError(err)) {
          setOfflinePopup(true);
        } else {
          setPopup({ type: "error", message: getErrorMessage(err, "Could not load required data") });
        }
      })
      .finally(() => setInitialLoading(false));
  }, []);

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "referredBy") {
        next.hasReferrerDiscount = false;
        next.referrerDiscount = 0;
      }
      if (field === "doctor" && prev.useDoctorAsReferrer) {
        next.hasReferrerDiscount = false;
        next.referrerDiscount = 0;
      }
      if (field === "useDoctorAsReferrer") {
        next.hasReferrerDiscount = false;
        next.referrerDiscount = 0;
      }
      return next;
    });
  };

  const handlePatientChange = (field, value) => {
    setFormData((prev) => ({ ...prev, patient: { ...prev.patient, [field]: value } }));
  };

  const handleAgeChange = (part, value) => {
    setFormData((prev) => ({
      ...prev,
      patient: { ...prev.patient, age: { ...prev.patient.age, [part]: value } },
    }));
  };

  const handleTestToggle = (test) => {
    setFormData((prev) => ({
      ...prev,
      selectedTests: prev.selectedTests.some((t) => t.testId === test.testId)
        ? prev.selectedTests.filter((t) => t.testId !== test.testId)
        : [...prev.selectedTests, test],
    }));
  };

  const handleProductToggle = (product) => {
    setFormData((prev) => {
      const exists = prev.selectedProducts.some((p) => p._id === product._id);
      return {
        ...prev,
        selectedProducts: exists
          ? prev.selectedProducts.filter((p) => p._id !== product._id)
          : [...prev.selectedProducts, { ...product, quantity: 1 }],
      };
    });
  };

  const handleProductQtyChange = (productId, qty) => {
    setFormData((prev) => ({
      ...prev,
      selectedProducts: prev.selectedProducts.map((p) =>
        p._id === productId ? { ...p, quantity: Math.max(1, parseInt(qty) || 1) } : p,
      ),
    }));
  };

  const handlePreview = (e) => {
    e.preventDefault();
    const { patient, selectedTests, selectedProducts } = formData;
    if (!patient.name?.trim()) return setPopup({ type: "error", message: "Patient name is required" });
    if (!patient.gender) return setPopup({ type: "error", message: "Gender is required" });
    if (!isAgeFilled(patient.age)) return setPopup({ type: "error", message: "Age is required" });
    if (!selectedTests.length && !selectedProducts.length)
      return setPopup({ type: "error", message: "Please select at least one test or product" });
    setShowSummary(true);
  };

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      const { patient, referredBy, doctor, useDoctorAsReferrer, selectedTests, selectedProducts, paymentMode } =
        formData;

      const effectiveReferrer = useDoctorAsReferrer ? doctor : referredBy;

      const referrer = {
        id:
          typeof effectiveReferrer === "object" && effectiveReferrer !== null ? (effectiveReferrer._id ?? null) : null,
        name:
          typeof effectiveReferrer === "object" && effectiveReferrer !== null
            ? effectiveReferrer.name
            : typeof effectiveReferrer === "string" && effectiveReferrer.trim()
              ? effectiveReferrer.trim()
              : (useDoctorAsReferrer ? pendingDoctorNameRef.current.trim() : pendingReferrerNameRef.current.trim()) ||
                null,
        type: useDoctorAsReferrer
          ? "doctor"
          : typeof effectiveReferrer === "object" && effectiveReferrer !== null
            ? (effectiveReferrer.type ?? null)
            : null,
      };

      const doctorPayload = doctor
        ? {
            id: typeof doctor === "object" ? (doctor._id ?? null) : null,
            name: typeof doctor === "object" ? doctor.name : doctor,
            degree: typeof doctor === "object" ? (doctor.degree ?? null) : null,
          }
        : { id: null, name: null, degree: null };

      const invoiceData = {
        patient: {
          ...patient,
          age: normalizeAge(patient.age),
          contactNumber: patient.contactNumber?.trim() || "",
        },
        referrer,
        doctor: doctorPayload,
        tests: selectedTests.map(({ testId, name, price, schemaId, commission }) => ({
          testId,
          name,
          price,
          schemaId: schemaId || null,
          commission: commission || 0,
        })),
        products: selectedProducts.map(({ _id, name, price, quantity, type }) => ({
          productId: _id,
          name,
          price,
          quantity,
          type,
        })),
        amount: {
          initial: amount.initial,
          referrerDiscount: amount.referrerDiscount,
          referrerCommission: amount.referrerCommission,
          labAdjustment: amount.labAdjustment,
          final: amount.final,
          net: amount.net,
          paid: amount.paid,
          invoiceFee: amount.invoiceFee,
        },
        paymentMode,
        isOnlineFeePaid: amount.feeApplied,
        onlineFeePaidBy: formData.onlineFeePaidBy,
      };

      const { data } = await invoiceService.createInvoice(invoiceData);

      navigate(`/outdoor/invoice/print/${data.invoiceId}`, {
        state: {
          invoiceData: {
            ...invoiceData,
            invoiceId: data.invoiceId,
            tests: selectedTests,
            selectedProducts,
            referredBy,
            doctor,
            link: data.link,
          },
        },
      });

      setFormData(INITIAL_FORM);
      setShowSummary(false);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        setPopup({ type: "error", message: getErrorMessage(err, "Could not create invoice") });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {submitting && <LoadingScreen message="Creating invoice" />}
      {popup && <Popup type={popup.type} message={popup.message} onClose={() => setPopup(null)} />}
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6 flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-sm">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Create New Invoice</h1>
              <p className="text-sm text-gray-500">Generate patient invoice with diagnostic tests</p>
            </div>
          </div>

          {initialLoading ? (
            <FormSkeleton />
          ) : (
            <InvoiceForm
              formData={formData}
              amount={amount}
              isAdmin={isAdmin}
              canAdjustLab={canAdjustLab}
              maxLabAdjustment={maxLabAdjustment}
              feePerInvoice={feePerInvoice}
              forceInvoiceFee={forceInvoiceFee}
              availableReferrers={availableReferrers}
              availableTests={availableTests}
              availableProducts={availableProducts}
              availableDoctors={availableDoctors}
              onChange={handleChange}
              onPatientChange={handlePatientChange}
              onAgeChange={handleAgeChange}
              onTestToggle={handleTestToggle}
              onProductToggle={handleProductToggle}
              onProductQtyChange={handleProductQtyChange}
              onSubmit={handlePreview}
              pendingReferrerNameRef={pendingReferrerNameRef}
              pendingDoctorNameRef={pendingDoctorNameRef}
            />
          )}
        </div>
      </div>

      <Modal isOpen={showSummary} onClose={() => setShowSummary(false)} maxWidth="max-w-2xl">
        <InvoiceSummary
          formData={formData}
          amount={amount}
          onConfirm={handleConfirm}
          onClose={() => setShowSummary(false)}
        />
      </Modal>
    </>
  );
};

export default CreateInvoice;
