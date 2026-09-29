/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  UserPlus,
  Search,
  ArrowLeft,
  X,
  Pencil,
  Trash2,
  ChevronDown,
  BadgePercent,
  Banknote,
  Phone,
  Layers,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  RotateCcw,
  Stethoscope,
  Briefcase,
  Lock,
} from "lucide-react";
import Modal from "../../../components/modal";
import doctorService from "../../../api/doctor";
import staticDataAPI from "../../../api/staticData";
import Popup from "../../../components/popup";
import { useAuthStore } from "../../../store/authStore";

// ── Palette ────────────────────────────────────────────────────────────────────

const C = {
  ink: "#0F172A",
  muted: "#94A3B8",
  sub: "#64748B",
  border: "#E2E8F0",
  dashed: "#CBD5E1",
  paper: "#F8FAFC",
  hover: "#F1F5F9",
  divider: "#EEF2FF",
  teal: "#0D9488",
  blue: "#3B82F6",
  indigo: "#6366F1",
  red: "#EF4444",
  amber: "#F59E0B",
  purple: "#8B5CF6",
  green: "#10B981",
};

// Page background — matches Setup.jsx / ManageReferrer.jsx / ManageStaff.jsx
const pageGradientBg = "bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,#eef2ff_0%,#f8fafc_45%,#f8fafc_100%)]";

// ── Error helpers ──────────────────────────────────────────────────────────────

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";

const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return err?.response?.data?.error ?? PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};

const getErrorStatus = (error) => error?.response?.status ?? error?.status ?? null;

// ── Axios‑native network error detection (same as all other pages) ──────────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n, type) =>
  type === "percentage" ? `${n}%` : `৳${typeof n === "number" ? n.toLocaleString("en-IN") : n}`;

// On CREATE, commission is required up front (the backend needs it to insert
// the doctor). On EDIT, commission is hidden from this form entirely — it
// has its own dedicated CommissionModal (below), same split as
// ManageReferrer.jsx / ManageStaff.jsx.
const EMPTY_FORM = {
  name: "",
  degree: "",
  contactNumber: "",
  designation: "",
  departments: [],
  commissionType: "percentage",
  commissionValue: "",
};

// ── Shared input style ─────────────────────────────────────────────────────────

const inputBase =
  "w-full outline-none transition-all rounded-xl border-[1.5px] border-[#E2E8F0] bg-white text-[#0F172A] font-['IBM_Plex_Mono',monospace]";

const focusInput = (e) => {
  e.target.style.borderColor = "#6366F1";
  e.target.style.boxShadow = "0 0 0 3px #6366F120";
};
const blurInput = (e) => {
  e.target.style.borderColor = "#E2E8F0";
  e.target.style.boxShadow = "";
};

// ── Form Field ─────────────────────────────────────────────────────────────────

const FormField = ({ label, required, children }) => (
  <div className="min-w-0">
    <label className="block mb-1.5 font-['IBM_Plex_Mono',monospace] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
      {label}
      {required && <span className="text-[#EF4444] ml-[3px]">*</span>}
    </label>
    {children}
  </div>
);

// ── Multi-Department Select ────────────────────────────────────────────────────

const DepartmentMultiSelect = ({ departments, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  const filtered = departments.filter((d) => d.label.toLowerCase().includes(search.toLowerCase()));
  const selectedDepts = departments.filter((d) => selected.includes(d.value));

  return (
    <div ref={ref} className="relative min-w-0">
      <div
        onClick={() => setOpen((o) => !o)}
        className={`min-h-[42px] w-full px-3 py-2 cursor-pointer flex flex-wrap items-center gap-1.5 transition-all rounded-xl border-[1.5px] bg-white font-['IBM_Plex_Mono',monospace] ${open ? "border-[#6366F1] shadow-[0_0_0_3px_#6366F120]" : "border-[#E2E8F0]"}`}
      >
        {selected.length === 0 ? (
          <span className="text-[13px] text-[#94A3B8]">বিভাগ নির্বাচন করুন</span>
        ) : (
          selectedDepts.map((d) => (
            <span
              key={d.value}
              className="inline-flex items-center gap-1 max-w-full min-w-0 px-2 py-0.5 bg-[#6366F115] border-[1.5px] border-[#6366F130] rounded-lg text-[#6366F1] text-[11px] font-['IBM_Plex_Mono',monospace] font-semibold"
            >
              <span className="truncate min-w-0">{d.label}</span>
              <button
                type="button"
                className="shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(selected.filter((v) => v !== d.value));
                }}
              >
                <X className="w-[9px] h-[9px]" />
              </button>
            </span>
          ))
        )}
        <ChevronDown
          className={`w-[14px] h-[14px] text-[#94A3B8] ml-auto shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-2 w-full bg-white overflow-hidden rounded-2xl border-[1.5px] border-[#E2E8F0] shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
          <div className="p-2.5 border-b border-[#E2E8F0]">
            <div className="relative">
              <Search className="w-3 h-3 text-[#94A3B8] absolute left-[10px] top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="অনুসন্ধান…"
                className={`${inputBase} pl-7 pr-2.5 py-[7px] text-xs`}
              />
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center p-4 text-xs text-[#94A3B8] font-['IBM_Plex_Mono',monospace]">কোনো ফলাফল নেই</p>
            ) : (
              filtered.map((d) => {
                const checked = selected.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggle(d.value)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors text-[13px] font-['IBM_Plex_Mono',monospace] ${checked ? "bg-[#6366F108] text-[#6366F1]" : "text-[#0F172A] hover:bg-[#F1F5F9]"}`}
                  >
                    <span
                      className={`flex items-center justify-center shrink-0 w-4 h-4 mt-[1px] rounded-[5px] border-[1.5px] ${checked ? "border-[#6366F1] bg-[#6366F1]" : "border-[#CBD5E1]"}`}
                    >
                      {checked && <Check className="w-[9px] h-[9px] text-white" />}
                    </span>
                    <span className="min-w-0 break-words">{d.label}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex justify-between items-center px-3 py-2 border-t border-[#E2E8F0]">
              <span className="text-[11px] text-[#94A3B8] font-['IBM_Plex_Mono',monospace]">
                {selected.length}টি নির্বাচিত
              </span>
              <button
                onClick={() => onChange([])}
                className="text-[11px] text-[#EF4444] font-['IBM_Plex_Mono',monospace] font-bold"
              >
                সব বাদ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Doctor Form Modal (create / edit basic info) ────────────────────────────
// Handles name/degree/contactNumber/designation/departments only on edit.
// Commission lives in its own CommissionModal (below), and is only present
// in this form during create — same split as ReferrerFormModal /
// CommissionModal in ManageReferrer.jsx.
//
// On a failed save, this modal stays OPEN and shows the error inline via
// `apiError` in the sticky footer, directly above the action buttons — same
// pattern as ItemModal/StockModal in Products.jsx, ReferrerFormModal in
// ManageReferrer.jsx, and StaffFormModal in ManageStaff.jsx. A network
// hiccup or permission error shouldn't silently discard what the user typed.

const DoctorFormModal = ({ initial, onClose, onSaved, departments, designations }) => {
  const isEdit = !!initial?._id;
  const [form, setForm] = useState(() =>
    initial
      ? {
          name: initial.name ?? "",
          degree: initial.degree ?? "",
          contactNumber: initial.contactNumber ?? "",
          designation: initial.designation ?? "",
          departments: initial.departments ?? (initial.department ? [initial.department] : []),
          commissionType: "percentage",
          commissionValue: "",
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");

  const set = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (apiError) setApiError("");
  };
  const handle = (e) => set(e.target.name, e.target.value);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.departments.length) return setApiError("অন্তত একটি বিভাগ নির্বাচন করুন।");

    if (isEdit) {
      try {
        setSaving(true);
        setApiError("");
        const { name, degree, contactNumber, designation, departments: depts } = form;
        await doctorService.update(initial._id, { name, degree, contactNumber, designation, departments: depts });
        onSaved(true);
      } catch (err) {
        setApiError(getErrorMessage(err, "সমস্যা হয়েছে। আবার চেষ্টা করুন।"));
      } finally {
        setSaving(false);
      }
      return;
    }

    const val = Number(form.commissionValue);
    if (isNaN(val) || val < 0) return setApiError("কমিশন মান অবশ্যই ধনাত্মক সংখ্যা হতে হবে।");
    if (form.commissionType === "percentage" && val > 100) return setApiError("শতাংশ ০–১০০ এর মধ্যে হতে হবে।");
    try {
      setSaving(true);
      setApiError("");
      // Explicitly picked fields rather than spreading `form` directly — the
      // backend's createDoctorSchema is additionalProperties:false, so this
      // stays safe even if `form`'s local state shape changes later. Mirrors
      // the fix applied to the equivalent create flows in ManageStaff.jsx /
      // ManageReferrer.jsx, where spreading local component state (which
      // carried extra UI-only fields) broke create requests against the
      // same kind of strict schema.
      const { name, degree, contactNumber, designation, departments, commissionType } = form;
      await doctorService.create({
        name,
        degree,
        contactNumber,
        designation,
        departments,
        commissionType,
        commissionValue: val,
      });
      onSaved(false);
    } catch (err) {
      setApiError(getErrorMessage(err, "সমস্যা হয়েছে। আবার চেষ্টা করুন।"));
    } finally {
      setSaving(false);
    }
  };

  const accent = isEdit ? C.purple : C.teal;
  const gradFrom = isEdit ? "#7C3AED" : "#0D9488";
  const gradTo = isEdit ? "#6D28D9" : "#0F766E";
  const accentText = isEdit ? "text-[#8B5CF6]" : "text-[#0D9488]";
  const accentBorder = isEdit ? "border-[#8B5CF620]" : "border-[#0D948820]";

  return (
    <Modal isOpen size="md" onClose={onClose}>
      <div className="flex flex-col max-h-[calc(100svh-96px)] overflow-hidden">
        {/* Header — fixed, never scrolls */}
        <div
          className={`shrink-0 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 border-b ${accentBorder}`}
          style={{ background: `linear-gradient(135deg,${gradFrom}15 0%,${gradTo}08 100%)` }}
        >
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div
              className="flex items-center justify-center shrink-0 w-11 h-11 rounded-[14px]"
              style={{
                background: `linear-gradient(135deg,${gradFrom},${gradTo})`,
                boxShadow: `0 8px 20px ${accent}40`,
              }}
            >
              {isEdit ? (
                <Pencil className="w-[18px] h-[18px] text-white" />
              ) : (
                <UserPlus className="w-[18px] h-[18px] text-white" />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={`font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.1em] mb-[2px] ${accentText}`}
              >
                {isEdit ? "তথ্য সম্পাদনা" : "নতুন নিবন্ধন"}
              </p>
              <p className="font-['IBM_Plex_Sans',sans-serif] text-base font-bold text-[#0F172A] truncate">
                {isEdit ? "ডাক্তার সম্পাদনা" : "ডাক্তার নিবন্ধন"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center shrink-0 w-8 h-8 rounded-[10px] text-[#94A3B8] border-[1.5px] border-[#E2E8F0] transition-all hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="w-[15px] h-[15px]" />
          </button>
        </div>

        {/* Body — the ONLY scrollable region, fills remaining space */}
        <div className="px-4 sm:px-6 py-5 space-y-4 bg-[#F8FAFC] flex-1 min-h-0 overflow-y-auto">
          <FormField label="পূর্ণ নাম" required>
            <input
              name="name"
              value={form.name}
              onChange={handle}
              required
              placeholder="ডা. আমিনুর রহমান"
              className={`${inputBase} px-3 py-2.5 text-sm`}
              onFocus={focusInput}
              onBlur={blurInput}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="ডিগ্রি">
              <input
                name="degree"
                value={form.degree}
                onChange={handle}
                placeholder="MBBS, MD…"
                className={`${inputBase} px-3 py-2.5 text-sm`}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </FormField>
            <FormField label="যোগাযোগ নম্বর" required>
              <input
                name="contactNumber"
                value={form.contactNumber}
                onChange={handle}
                required
                placeholder="01XXXXXXXXX"
                className={`${inputBase} px-3 py-2.5 text-sm`}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </FormField>
          </div>
          <FormField label="পদবি">
            <div className="relative">
              <select
                name="designation"
                value={form.designation}
                onChange={handle}
                className={`w-full appearance-none outline-none transition-all rounded-xl border-[1.5px] border-[#E2E8F0] bg-white font-['IBM_Plex_Mono',monospace] text-[13px] py-[10px] pl-3 pr-9 truncate ${form.designation ? "text-[#0F172A]" : "text-[#94A3B8]"}`}
                onFocus={focusInput}
                onBlur={blurInput}
              >
                <option value="">পদবি নির্বাচন করুন</option>
                {designations.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-[14px] h-[14px] text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </FormField>
          <FormField label="বিভাগ" required>
            {departments.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 border-[1.5px] border-[#FCD34D60] rounded-xl bg-[#FFFBEB]">
                <AlertTriangle className="w-[14px] h-[14px] text-[#F59E0B] shrink-0" />
                <span className="text-xs font-['IBM_Plex_Mono',monospace] text-[#F59E0B]">
                  কোনো বিভাগ পাওয়া যায়নি।
                </span>
              </div>
            ) : (
              <DepartmentMultiSelect
                departments={departments}
                selected={form.departments}
                onChange={(v) => set("departments", v)}
              />
            )}
          </FormField>

          {/* Commission — create only. On edit, commission has its own
              dedicated CommissionModal (see below). */}
          {!isEdit && (
            <div className="border-[1.5px] border-[#E2E8F0] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2 bg-white border-b border-[#E2E8F0]">
                <BadgePercent className="w-[13px] h-[13px] text-[#6366F1]" />
                <span className="font-['IBM_Plex_Mono',monospace] text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748B]">
                  কমিশন
                </span>
              </div>
              <div className="p-4 space-y-3 bg-[#F8FAFC]">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      type: "percentage",
                      label: "শতাংশ (%)",
                      Icon: BadgePercent,
                      bg: "bg-[#F59E0B12]",
                      border: "border-[#F59E0B60]",
                      text: "text-[#F59E0B]",
                    },
                    {
                      type: "fixed",
                      label: "নির্দিষ্ট (৳)",
                      Icon: Banknote,
                      bg: "bg-[#0D948812]",
                      border: "border-[#0D948860]",
                      text: "text-[#0D9488]",
                    },
                  ].map(({ type, label, Icon, bg, border, text }) => {
                    const active = form.commissionType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          set("commissionType", type);
                          set("commissionValue", "");
                        }}
                        className={`flex items-center justify-center sm:justify-start gap-2 px-2 sm:px-3 py-3 min-w-0 transition-all font-semibold rounded-xl border-[1.5px] font-['IBM_Plex_Mono',monospace] text-xs
                          ${active ? `${bg} ${border} ${text}` : "bg-white border-[#E2E8F0] text-[#64748B]"}`}
                      >
                        <Icon className="w-[14px] h-[14px] shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="relative">
                  <input
                    name="commissionValue"
                    type="number"
                    min="0"
                    step="0.01"
                    max={form.commissionType === "percentage" ? 100 : undefined}
                    value={form.commissionValue}
                    onChange={handle}
                    required
                    placeholder={form.commissionType === "percentage" ? "০ – ১০০" : "পরিমাণ লিখুন"}
                    className={`${inputBase} text-sm ${form.commissionType === "percentage" ? "pl-3.5 pr-9" : "pl-8 pr-3.5"} py-2.5`}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  {form.commissionType === "percentage" ? (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-sm font-bold text-[#F59E0B]">
                      %
                    </span>
                  ) : (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-sm font-bold text-[#0D9488]">
                      ৳
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — fixed, never scrolls. apiError banner sits directly
            above the action buttons so it's the last thing seen before
            retrying, right where the eye lands after Save fails — not
            buried at the top of a long form. */}
        <div className="shrink-0 bg-white border-t border-[#E2E8F0]">
          {apiError && (
            <div className="mx-4 sm:mx-6 mt-4 flex items-start gap-2.5 px-4 py-3 bg-[#EF444408] border-[1.5px] border-[#EF444430] rounded-xl">
              <AlertTriangle className="w-[14px] h-[14px] text-[#EF4444] shrink-0 mt-[1px]" />
              <span className="text-xs font-['IBM_Plex_Mono',monospace] text-[#EF4444] min-w-0 break-words">
                {apiError}
              </span>
            </div>
          )}
          <div className="px-4 sm:px-6 py-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 font-semibold transition-all rounded-xl border-[1.5px] border-[#E2E8F0] text-[#64748B] font-['IBM_Plex_Mono',monospace] text-xs hover:bg-[#F1F5F9]"
            >
              বাতিল
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !departments.length}
              className="flex-1 py-3 flex items-center justify-center gap-2 font-semibold transition-all rounded-xl border-none text-white font-['IBM_Plex_Mono',monospace] text-xs"
              style={{
                background:
                  saving || !departments.length
                    ? C.muted
                    : `linear-gradient(135deg,${accent === C.purple ? "#8B5CF6,#7C3AED" : "#0D9488,#0F766E"})`,
                boxShadow: saving || !departments.length ? "none" : `0 4px 14px ${accent}40`,
                cursor: saving || !departments.length ? "not-allowed" : "pointer",
              }}
            >
              {saving ? (
                <span className="animate-spin inline-block w-[14px] h-[14px] rounded-full border-2 border-white/40 border-t-white" />
              ) : isEdit ? (
                <Pencil className="w-[13px] h-[13px]" />
              ) : (
                <UserPlus className="w-[13px] h-[13px]" />
              )}
              {isEdit ? "পরিবর্তন সংরক্ষণ" : "নিবন্ধন করুন"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ── Commission Modal ─────────────────────────────────────────────────────────
// Standalone modal, separate from DoctorFormModal, dedicated to setting one
// doctor's commission type/value. Mirrors CommissionModal in
// ManageReferrer.jsx / AdjustmentModal in ManageStaff.jsx — PUTs only
// commissionType/commissionValue to its own dedicated route.

const CommissionModal = ({ doctor, onClose, onSaved }) => {
  const [commissionType, setCommissionType] = useState(doctor.commissionType ?? "percentage");
  const [commissionValue, setCommissionValue] = useState(doctor.commissionValue ?? 0);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");

  const handleValueChange = (e) => {
    let val = e.target.value === "" ? "" : parseFloat(e.target.value) || 0;
    if (commissionType === "percentage" && val > 100) val = 100;
    setCommissionValue(val);
    if (apiError) setApiError("");
  };

  const selectType = (type) => {
    setCommissionType(type);
    setCommissionValue(0);
    if (apiError) setApiError("");
  };

  const handleSubmit = async () => {
    if (commissionValue === "" || commissionValue === null || Number(commissionValue) < 0) {
      return setApiError("কমিশনের পরিমাণ প্রয়োজন।");
    }
    try {
      setSaving(true);
      setApiError("");
      await doctorService.updateCommission(doctor._id, {
        commissionType,
        commissionValue: Number(commissionValue),
      });
      onSaved();
    } catch (err) {
      setApiError(getErrorMessage(err, "সমস্যা হয়েছে। আবার চেষ্টা করুন।"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="sm" onClose={onClose}>
      <div className="flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="shrink-0 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 border-b border-[#6366F120]"
          style={{ background: "linear-gradient(135deg,#6366F115 0%,#4F46E508 100%)" }}
        >
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            <div
              className="flex items-center justify-center shrink-0 w-11 h-11 rounded-[14px]"
              style={{ background: "linear-gradient(135deg,#6366F1,#4F46E5)", boxShadow: "0 8px 20px #6366F140" }}
            >
              <BadgePercent className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.1em] mb-[2px] text-[#6366F1]">
                কমিশন সম্পাদনা
              </p>
              <p className="font-['IBM_Plex_Sans',sans-serif] text-base font-bold text-[#0F172A] truncate">
                {doctor.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center shrink-0 w-8 h-8 rounded-[10px] text-[#94A3B8] border-[1.5px] border-[#E2E8F0] transition-all hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="w-[15px] h-[15px]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-5 space-y-4 bg-[#F8FAFC]">
          <div className="border-[1.5px] border-[#E2E8F0] rounded-2xl overflow-hidden bg-white">
            <div className="px-4 py-3 flex items-center gap-2 border-b border-[#E2E8F0]">
              <BadgePercent className="w-[13px] h-[13px] text-[#6366F1]" />
              <span className="font-['IBM_Plex_Mono',monospace] text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748B]">
                কমিশন
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    type: "percentage",
                    label: "শতাংশ (%)",
                    Icon: BadgePercent,
                    bg: "bg-[#F59E0B12]",
                    border: "border-[#F59E0B60]",
                    text: "text-[#F59E0B]",
                  },
                  {
                    type: "fixed",
                    label: "নির্দিষ্ট (৳)",
                    Icon: Banknote,
                    bg: "bg-[#0D948812]",
                    border: "border-[#0D948860]",
                    text: "text-[#0D9488]",
                  },
                ].map(({ type, label, Icon, bg, border, text }) => {
                  const active = commissionType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => selectType(type)}
                      className={`flex items-center justify-center sm:justify-start gap-2 px-2 sm:px-3 py-3 min-w-0 transition-all font-semibold rounded-xl border-[1.5px] font-['IBM_Plex_Mono',monospace] text-xs
                        ${active ? `${bg} ${border} ${text}` : "bg-white border-[#E2E8F0] text-[#64748B]"}`}
                    >
                      <Icon className="w-[14px] h-[14px] shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step={commissionType === "percentage" ? "0.1" : "1"}
                  max={commissionType === "percentage" ? 100 : undefined}
                  value={commissionValue}
                  onChange={handleValueChange}
                  placeholder={commissionType === "percentage" ? "০ – ১০০" : "পরিমাণ লিখুন"}
                  className={`${inputBase} text-sm ${commissionType === "percentage" ? "pl-3.5 pr-9" : "pl-8 pr-3.5"} py-2.5`}
                  onFocus={focusInput}
                  onBlur={blurInput}
                  autoFocus
                />
                {commissionType === "percentage" ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-sm font-bold text-[#F59E0B]">
                    %
                  </span>
                ) : (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-sm font-bold text-[#0D9488]">
                    ৳
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-white border-t border-[#E2E8F0]">
          {apiError && (
            <div className="mx-4 sm:mx-6 mt-4 flex items-start gap-2.5 px-4 py-3 bg-[#EF444408] border-[1.5px] border-[#EF444430] rounded-xl">
              <AlertTriangle className="w-[14px] h-[14px] text-[#EF4444] shrink-0 mt-[1px]" />
              <span className="text-xs font-['IBM_Plex_Mono',monospace] text-[#EF4444] min-w-0 break-words">
                {apiError}
              </span>
            </div>
          )}
          <div className="px-4 sm:px-6 py-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 font-semibold transition-all rounded-xl border-[1.5px] border-[#E2E8F0] text-[#64748B] font-['IBM_Plex_Mono',monospace] text-xs hover:bg-[#F1F5F9]"
            >
              বাতিল
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 flex items-center justify-center gap-2 font-semibold transition-all rounded-xl border-none text-white font-['IBM_Plex_Mono',monospace] text-xs"
              style={{
                background: saving ? "#94A3B8" : "linear-gradient(135deg,#6366F1,#4F46E5)",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? (
                <span className="animate-spin inline-block w-[14px] h-[14px] rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <BadgePercent className="w-[13px] h-[13px]" />
              )}
              সংরক্ষণ করুন
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ── Action Chip (icon + English label, mirrors ActionChip in ManageReferrer) ───

const ActionChip = ({ onClick, icon: Icon, label, color }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 transition-all font-semibold px-3 py-[5px] rounded-lg font-['IBM_Plex_Mono',monospace] text-[11px]"
    style={{
      border: `1.5px solid ${color}25`,
      color,
      background: `${color}08`,
    }}
    onMouseEnter={(e) => {
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

// ── Avatar initial chip — mirrors Avatar in ManageReferrer / ManageStaff ────────

const Avatar = ({ name }) => {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div className="w-10 h-10 flex items-center justify-center shrink-0 text-[14px] font-bold rounded-[9px] font-['IBM_Plex_Mono',monospace] bg-[#0D948815] text-[#0D9488]">
      {initial}
    </div>
  );
};

// ── Doctor Row — card style, mirrors ReferrerRow / StaffRow ────────────────────
//
// Overflow strategy: the collapsed header is a single-line summary, so every
// text node in it is `truncate` inside a `min-w-0` flex child (min-w-0 is what
// lets a flex item shrink below its content width — without it `truncate`
// does nothing and long names push past the card). The full, untruncated name,
// degree, designation and departments are shown wrapped in the expanded
// section, so nothing is lost on small screens.

const DoctorRow = ({ doctor, deptLabelMap, desigLabelMap, onEdit, onCommission, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const isPercent = doctor.commissionType === "percentage";
  const commGrad = isPercent ? "linear-gradient(135deg,#F59E0B,#D97706)" : "linear-gradient(135deg,#0D9488,#0F766E)";
  const commShadow = isPercent ? "shadow-[0_3px_8px_#F59E0B30]" : "shadow-[0_3px_8px_#0D948830]";
  const designationLabel = doctor.designation ? (desigLabelMap[doctor.designation] ?? doctor.designation) : "";

  return (
    <div
      className="bg-white border border-[#E2E8F0] rounded-[14px] transition-shadow min-w-0"
      style={{ boxShadow: expanded ? "0 4px 14px rgba(15,23,42,0.08)" : "0 1px 2px rgba(15,23,42,0.03)" }}
    >
      <button onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        <div className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3.5">
          <Avatar name={doctor.name} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="min-w-0 truncate font-['IBM_Plex_Sans',sans-serif] text-sm font-semibold text-[#0F172A]">
                {doctor.name}
              </span>
              {/* Degree badge: desktop only in the collapsed row (on mobile it
                  lives in the expanded section, where it can wrap). */}
              {doctor.degree && (
                <span className="hidden sm:inline-flex items-center gap-1 shrink-0 max-w-[40%] px-1.5 py-[2px] rounded-md border-[1.5px] font-['IBM_Plex_Mono',monospace] text-[9.5px] font-bold bg-[#0D948815] border-[#0D948830] text-[#0D9488]">
                  <Stethoscope className="w-[9px] h-[9px] shrink-0" />
                  <span className="truncate">{doctor.degree}</span>
                </span>
              )}
            </div>
            <p className="font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#94A3B8] mt-0.5 truncate">
              {designationLabel || doctor.degree || doctor.contactNumber || "—"}
            </p>
          </div>

          <span
            className={`shrink-0 flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-[20px] text-white font-['IBM_Plex_Mono',monospace] text-xs font-bold ${commShadow}`}
            style={{ background: commGrad }}
          >
            {isPercent ? <BadgePercent className="w-[11px] h-[11px]" /> : <Banknote className="w-[11px] h-[11px]" />}
            {fmt(doctor.commissionValue, doctor.commissionType)}
          </span>

          <ChevronDown
            className={`w-[15px] h-[15px] text-[#94A3B8] transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-3 sm:px-4 pb-4 border-t border-[#E2E8F0]">
          <div className="pt-3.5 space-y-3.5 min-w-0">
            <div className="space-y-2 font-['IBM_Plex_Mono',monospace] text-xs text-[#64748B] leading-relaxed min-w-0">
              {/* Full name — wraps, never truncated */}
              <p className="font-['IBM_Plex_Sans',sans-serif] text-sm font-semibold text-[#0F172A] break-words [overflow-wrap:anywhere]">
                {doctor.name}
              </p>
              {doctor.degree && (
                <p className="flex items-start gap-1.5">
                  <Stethoscope className="w-3 h-3 text-[#0D9488] shrink-0 mt-[3px]" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{doctor.degree}</span>
                </p>
              )}
              {designationLabel && (
                <p className="flex items-start gap-1.5">
                  <Briefcase className="w-3 h-3 text-[#6366F1] shrink-0 mt-[3px]" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{designationLabel}</span>
                </p>
              )}
              {doctor.contactNumber && (
                <p className="flex items-start gap-1.5">
                  <Phone className="w-3 h-3 text-[#6366F1] shrink-0 mt-[3px]" />
                  <span className="min-w-0 break-words">{doctor.contactNumber}</span>
                </p>
              )}
              {doctor.departments?.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <Layers className="w-3 h-3 text-[#6366F1] shrink-0 mt-[6px]" />
                  <div className="flex flex-wrap gap-1.5 min-w-0">
                    {doctor.departments.map((d) => (
                      <span
                        key={d}
                        className="max-w-full px-2 py-[2px] rounded-md border-[1.5px] border-[#6366F125] bg-[#6366F108] text-[11px] font-semibold text-[#4F46E5] break-words [overflow-wrap:anywhere]"
                      >
                        {deptLabelMap[d] ?? d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ActionChip onClick={onEdit} icon={Pencil} label="Edit" color={C.indigo} />
              <ActionChip onClick={onCommission} icon={BadgePercent} label="Commission" color={C.purple} />
              <ActionChip onClick={onDelete} icon={Trash2} label="Delete" color={C.red} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Pagination ─────────────────────────────────────────────────────────────────

const Pagination = ({ page, totalPages, onPage }) => {
  if (totalPages <= 1) return null;
  const delta = 1;
  const start = Math.max(1, page - delta);
  const end = Math.min(totalPages, page + delta);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const Btn = ({ onClick, disabled, active, children }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center transition-all w-8 h-8 rounded-[10px] font-['IBM_Plex_Mono',monospace] text-xs font-bold"
      style={{
        background: active ? "linear-gradient(135deg,#6366F1,#4F46E5)" : "white",
        border: `1.5px solid ${active ? "transparent" : C.border}`,
        color: active ? "white" : disabled ? C.muted : C.sub,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: active ? "0 4px 10px rgba(99,102,241,0.35)" : undefined,
      }}
    >
      {children}
    </button>
  );

  return (
    <div className="flex items-center justify-center flex-wrap gap-1.5">
      <Btn onClick={() => onPage(page - 1)} disabled={page === 1}>
        <ChevronLeft className="w-[14px] h-[14px]" />
      </Btn>
      {start > 1 && (
        <>
          <Btn onClick={() => onPage(1)}>1</Btn>
          {start > 2 && <span className="text-[#94A3B8] text-xs">…</span>}
        </>
      )}
      {pages.map((p) => (
        <Btn key={p} onClick={() => onPage(p)} active={p === page}>
          {p}
        </Btn>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-[#94A3B8] text-xs">…</span>}
          <Btn onClick={() => onPage(totalPages)}>{totalPages}</Btn>
        </>
      )}
      <Btn onClick={() => onPage(page + 1)} disabled={page === totalPages}>
        <ChevronRight className="w-[14px] h-[14px]" />
      </Btn>
    </div>
  );
};

// ── Filter Dropdown ────────────────────────────────────────────────────────────
// On mobile the two filters share a row (flex-1, each ~half width) and long
// option labels truncate inside the select; on ≥sm they size to content with
// a max width so a long department name can't blow the toolbar out.

const FilterDropdown = ({ value, onChange, options, placeholder }) => (
  <div className="relative min-w-0 flex-1 sm:flex-none">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full sm:w-auto sm:max-w-[200px] truncate appearance-none outline-none cursor-pointer transition-all font-['IBM_Plex_Mono',monospace] text-xs rounded-[10px] py-[7px] pl-3 pr-[30px] border-[1.5px]
        ${value !== "all" ? "border-[#6366F160] bg-[#6366F108] text-[#0F172A] shadow-[0_2px_8px_#6366F115]" : "border-[#E2E8F0] bg-white text-[#64748B]"}`}
    >
      <option value="all">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="w-3 h-3 text-[#94A3B8] absolute right-[9px] top-1/2 -translate-y-1/2 pointer-events-none" />
  </div>
);

// ── Skeleton — mirrors ManageReferrer.jsx card-list skeleton ───────────────────

const Skeleton = () => (
  <div className="space-y-2">
    {[1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className="flex items-center gap-3 px-3 sm:px-4 py-3.5 bg-white border border-[#E2E8F0] rounded-[14px] animate-pulse"
      >
        <div className="w-10 h-10 bg-[#E2E8F0] rounded-[9px] shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-3 w-2/5 bg-[#E2E8F0] rounded-md" />
          <div className="h-2.5 w-3/5 bg-[#EEF2FF] rounded-md" />
        </div>
        <div className="w-[65px] h-[26px] bg-[#E2E8F0] rounded-[20px] shrink-0" />
      </div>
    ))}
  </div>
);

// ── Stats Card ─────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, color, grad, icon: Icon, className = "" }) => (
  <div
    className={`bg-white relative overflow-hidden min-w-0 border border-[#E2E8F0] rounded-2xl p-[12px_14px] sm:p-[14px_16px] shadow-[0_2px_8px_rgba(15,23,42,0.05)] ${className}`}
  >
    <div className="absolute top-0 right-0 w-16 h-16 opacity-5 rounded-[0_16px_0_100%]" style={{ background: grad }} />
    <div className="flex items-center gap-2 mb-2 min-w-0">
      <div
        className="flex items-center justify-center shrink-0 w-[26px] h-[26px] rounded-lg"
        style={{ background: grad, boxShadow: `0 3px 8px ${color}30` }}
      >
        <Icon className="w-[13px] h-[13px] text-white" />
      </div>
      <p className="min-w-0 truncate font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.06em] text-[#94A3B8]">
        {label}
      </p>
    </div>
    <p
      className="truncate font-['IBM_Plex_Mono',monospace] text-[22px] sm:text-[26px] font-extrabold leading-none"
      style={{ color }}
    >
      {value}
    </p>
  </div>
);

// ── Main Page ──────────────────────────────────────────────────────────────────

const COMM_OPTIONS = [
  { value: "percentage", label: "শতাংশ (%)" },
  { value: "fixed", label: "নির্দিষ্ট (৳)" },
];

const ManageDoctors = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  // ═══════════ Frontend permission check ═══════════
  const hasAccess = isAdmin || user?.permissions?.manageDoctors === true;
  if (!hasAccess) {
    return <Popup type="denied" message="ডাক্তার ম্যানেজমেন্ট দেখার অনুমতি আপনার নেই।" onClose={() => navigate("/")} />;
  }

  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [maxDoctor, setMaxDoctor] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [commFilter, setCommFilter] = useState("all");
  const [popup, setPopup] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false); // ← new
  const [formModal, setFormModal] = useState(null);
  const [commissionModal, setCommissionModal] = useState(null); // null | doctor object
  const [deleteTarget, setDeleteTarget] = useState(null);
  const debounceRef = useRef(null);

  const deptLabelMap = Object.fromEntries(departments.map((d) => [d.value, d.label]));
  const desigLabelMap = Object.fromEntries(designations.map((d) => [d.value, d.label]));

  useEffect(() => {
    Promise.all([staticDataAPI.getDepartments(), staticDataAPI.getDesignations()])
      .then(([dR, dsR]) => {
        setDepartments(dR.data.departments ?? []);
        setDesignations(dsR.data.designations ?? []);
      })
      .catch((err) => {
        if (isNetworkError(err)) {
          setOfflinePopup(true);
        } else {
          setPopup({ type: "error", message: getErrorMessage(err, "বিভাগ লোড করতে ব্যর্থ।") });
        }
      });
  }, []);

  const fetchDoctors = async ({ search: s = "", department: d = "", page = 1 } = {}) => {
    try {
      const res = await doctorService.getAll({ search: s, department: d, page });
      const { doctors: data, total, totalPages, page: cur, maxDoctor: maxD } = res.data;
      setDoctors(data);
      setPagination({ page: cur, totalPages, total });
      setMaxDoctor(typeof maxD === "number" ? maxD : null);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        setPopup({ type: "error", message: getErrorMessage(err, "ডাক্তার লোড করতে ব্যর্থ।") });
      }
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchDoctors({ search, department: deptFilter !== "all" ? deptFilter : "", page: 1 }),
      400,
    );
    return () => clearTimeout(debounceRef.current);
  }, [search, deptFilter]);

  const handlePage = (page) => fetchDoctors({ search, department: deptFilter !== "all" ? deptFilter : "", page });

  const handleSaved = (isEdit) => {
    setFormModal(null);
    fetchDoctors({ search, department: deptFilter !== "all" ? deptFilter : "", page: pagination.page });
    setPopup({ type: "success", message: isEdit ? "ডাক্তারের তথ্য আপডেট হয়েছে।" : "ডাক্তার নিবন্ধিত হয়েছে।" });
  };

  const handleCommissionSaved = () => {
    setCommissionModal(null);
    fetchDoctors({ search, department: deptFilter !== "all" ? deptFilter : "", page: pagination.page });
    setPopup({ type: "success", message: "কমিশন আপডেট হয়েছে।" });
  };

  const handleDelete = async (doctor) => {
    try {
      await doctorService.delete(doctor._id);
      const page = doctors.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      fetchDoctors({ search, department: deptFilter !== "all" ? deptFilter : "", page });
      setPopup({ type: "success", message: "ডাক্তার মুছে ফেলা হয়েছে।" });
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        if (getErrorStatus(err) === 404) {
          const page = doctors.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
          fetchDoctors({ search, department: deptFilter !== "all" ? deptFilter : "", page });
        }
        setPopup({ type: "error", message: getErrorMessage(err, "ডাক্তার মুছতে ব্যর্থ।") });
      }
    }
  };

  const visibleDoctors = useMemo(
    () => (commFilter !== "all" ? doctors.filter((d) => d.commissionType === commFilter) : doctors),
    [doctors, commFilter],
  );

  const stats = useMemo(
    () => ({
      total: pagination.total,
      percentage: doctors.filter((d) => d.commissionType === "percentage").length,
      fixed: doctors.filter((d) => d.commissionType === "fixed").length,
      multiDept: doctors.filter((d) => (d.departments?.length ?? 0) > 1).length,
    }),
    [doctors, pagination.total],
  );

  // ─── Doctor limit ─────────────────────────────────────────────────────────
  // maxDoctor comes straight from GET /doctors (backend reads it off the lab
  // record). null means "no limit set on this lab" — mirrors maxReferrer in
  // ManageReferrer.jsx / maxByType in Products.jsx.
  const atDoctorLimit = maxDoctor !== null && pagination.total >= maxDoctor;

  // Guarded entry point for opening the "add doctor" form — mirrors
  // handleAddReferrerClick in ManageReferrer.jsx, keeping the limit check in
  // one place rather than scattered across every trigger of setFormModal.
  const handleAddDoctorClick = () => {
    if (atDoctorLimit) {
      setPopup({
        type: "error",
        message: `আপনার ল্যাবে সর্বোচ্চ ${maxDoctor} জন ডাক্তার যোগ করা যাবে। সীমা পূর্ণ হয়েছে। সীমা বাড়াতে আমাদের সাথে যোগাযোগ করুন।`,
      });
      return;
    }
    setFormModal({});
  };

  const hasFilters = deptFilter !== "all" || commFilter !== "all";
  const deptOptions = departments.map((d) => ({ value: d.value, label: d.label }));

  return (
    <section className={`min-h-screen px-3 sm:px-4 py-5 sm:py-6 ${pageGradientBg} font-[Noto_Sans_Bengali,sans-serif]`}>
      {popup && <Popup type={popup.type} message={popup.message} onClose={() => setPopup(null)} />}
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      {formModal !== null && (
        <DoctorFormModal
          initial={formModal._id ? formModal : null}
          onClose={() => setFormModal(null)}
          onSaved={handleSaved}
          departments={departments}
          designations={designations}
        />
      )}

      {commissionModal && (
        <CommissionModal
          doctor={commissionModal}
          onClose={() => setCommissionModal(null)}
          onSaved={handleCommissionSaved}
        />
      )}

      {deleteTarget && (
        <Popup
          type="warning"
          message={`"${deleteTarget.name}"-এর সমস্ত তথ্য স্থায়ীভাবে মুছে যাবে। এই কাজ পূর্বাবস্থায় ফেরানো যাবে না।`}
          confirmText="হ্যাঁ, মুছুন"
          cancelText="রাখুন"
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <div className="w-full min-w-0 max-w-2xl mx-auto">
        {/* Page header — gradient icon badge, matching ManageReferrer/ManageStaff */}
        <div className="flex items-start justify-between gap-3 mb-5 sm:mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl shadow-md"
              style={{
                background: "linear-gradient(135deg,#0D9488,#0F766E)",
                boxShadow: "0 4px 10px #0D948835",
              }}
            >
              <Stethoscope className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-['IBM_Plex_Sans',sans-serif] text-xl sm:text-[22px] font-bold text-[#0F172A] leading-tight truncate">
                ডাক্তার তালিকা
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/setup"
              className="flex items-center gap-1.5 transition-all font-semibold px-3 sm:px-[14px] py-2 border-[1.5px] border-[#E2E8F0] rounded-xl text-[#64748B] font-['IBM_Plex_Mono',monospace] text-xs bg-white hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <ArrowLeft className="w-[13px] h-[13px]" />
            </Link>
            <button
              onClick={handleAddDoctorClick}
              disabled={atDoctorLimit}
              title={atDoctorLimit ? `ডাক্তার সীমা (${maxDoctor}) পূর্ণ হয়েছে` : undefined}
              className="flex items-center gap-1.5 transition-all font-semibold px-3 sm:px-4 py-2 rounded-xl text-white font-['IBM_Plex_Mono',monospace] text-xs border-none shadow-[0_4px_14px_rgba(13,148,136,0.4)] hover:shadow-[0_6px_20px_rgba(13,148,136,0.5)] disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed"
              style={{ background: atDoctorLimit ? "#94A3B8" : "linear-gradient(135deg,#0D9488,#0F766E)" }}
            >
              {atDoctorLimit ? <Lock className="w-[13px] h-[13px]" /> : <UserPlus className="w-[13px] h-[13px]" />}
              <span className="whitespace-nowrap">নতুন ডাক্তার</span>
            </button>
          </div>
        </div>

        {/* Stats — 2 columns on mobile, 4/5 from sm. With a limit card the 5th
            item spans the full mobile row so the grid never leaves a lone
            half-width orphan. */}
        {!initialLoading && (
          <div
            className={`grid grid-cols-2 ${maxDoctor !== null ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-2.5 sm:gap-3 mb-5`}
          >
            <StatCard
              label="মোট ডাক্তার"
              value={stats.total}
              color={C.indigo}
              grad="linear-gradient(135deg,#6366F1,#4F46E5)"
              icon={UserPlus}
            />
            <StatCard
              label="শতাংশ কমিশন"
              value={stats.percentage}
              color={C.amber}
              grad="linear-gradient(135deg,#F59E0B,#D97706)"
              icon={BadgePercent}
            />
            <StatCard
              label="নির্দিষ্ট কমিশন"
              value={stats.fixed}
              color={C.teal}
              grad="linear-gradient(135deg,#0D9488,#0F766E)"
              icon={Banknote}
            />
            <StatCard
              label="বহু-বিভাগ"
              value={stats.multiDept}
              color={C.purple}
              grad="linear-gradient(135deg,#8B5CF6,#7C3AED)"
              icon={Layers}
            />
            {maxDoctor !== null && (
              <StatCard
                className="col-span-2 sm:col-span-1"
                label="সীমা"
                value={`${stats.total}/${maxDoctor}`}
                color={atDoctorLimit ? "#EF4444" : "#64748B"}
                grad={
                  atDoctorLimit ? "linear-gradient(135deg,#EF4444,#DC2626)" : "linear-gradient(135deg,#64748B,#475569)"
                }
                icon={Lock}
              />
            )}
          </div>
        )}

        {atDoctorLimit && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 mb-4 bg-[#FEF2F2] border-[1.5px] border-[#EF444430] rounded-xl">
            <Lock className="w-[13px] h-[13px] text-[#EF4444] mt-[1px] shrink-0" />
            <p className="min-w-0 text-[11px] leading-[1.5] text-[#991B1B] font-[Noto_Sans_Bengali,sans-serif]">
              আপনার ল্যাবে সর্বোচ্চ {maxDoctor} জন ডাক্তার যোগ করা যাবে এবং আপনি সীমায় পৌঁছেছেন। নতুন ডাক্তার যোগ করতে
              সীমা বাড়াতে আমাদের সাথে যোগাযোগ করুন।
            </p>
          </div>
        )}

        {/* Toolbar card — search takes its own full row on mobile, the two
            filters then share the next row; on ≥sm everything sits inline. */}
        <div className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-2 mb-4 bg-white border border-[#E2E8F0] rounded-2xl">
          <div className="relative basis-full sm:basis-[160px] sm:flex-1 min-w-0">
            <Search className="w-[13px] h-[13px] text-[#94A3B8] absolute left-[11px] top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="নাম, ডিগ্রি বা নম্বর…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputBase} pl-8 ${search ? "pr-8" : "pr-3"} py-2 text-xs`}
              onFocus={focusInput}
              onBlur={blurInput}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[#94A3B8]"
              >
                <X className="w-[13px] h-[13px]" />
              </button>
            )}
          </div>
          <FilterDropdown value={deptFilter} onChange={setDeptFilter} options={deptOptions} placeholder="সব বিভাগ" />
          <FilterDropdown value={commFilter} onChange={setCommFilter} options={COMM_OPTIONS} placeholder="সব কমিশন" />
          {hasFilters && (
            <button
              onClick={() => {
                setDeptFilter("all");
                setCommFilter("all");
              }}
              className="flex items-center justify-center gap-1.5 transition-all font-semibold py-[7px] px-3 border-[1.5px] border-[#EF444430] rounded-[10px] text-[#EF4444] font-['IBM_Plex_Mono',monospace] text-[11px] bg-[#EF444406] hover:bg-[#EF444412] basis-full sm:basis-auto"
            >
              <RotateCcw className="w-3 h-3" /> রিসেট
            </button>
          )}
        </div>

        {/* Doctor cards */}
        {initialLoading ? (
          <Skeleton />
        ) : visibleDoctors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#94A3B8] bg-white border border-[#E2E8F0] rounded-2xl">
            <AlertCircle className="w-7 h-7 opacity-40" />
            <p className="font-['IBM_Plex_Mono',monospace] text-xs text-center px-4">
              {hasFilters || search ? "কোনো ডাক্তার পাওয়া যায়নি" : "এখনো কোনো ডাক্তার নিবন্ধিত হয়নি"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleDoctors.map((doctor) => (
              <DoctorRow
                key={doctor._id}
                doctor={doctor}
                deptLabelMap={deptLabelMap}
                desigLabelMap={desigLabelMap}
                onEdit={() => setFormModal(doctor)}
                onCommission={() => setCommissionModal(doctor)}
                onDelete={() => setDeleteTarget(doctor)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!initialLoading && pagination.totalPages > 1 && (
          <div className="mt-4 px-3 sm:px-4 py-3 bg-white border border-[#E2E8F0] rounded-2xl">
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onPage={handlePage} />
          </div>
        )}

        {/* Footer note */}
        <p className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#94A3B8] mt-4 text-center">
          * শুধুমাত্র সক্রিয় ডাক্তারের তথ্য অন্তর্ভুক্ত
        </p>
      </div>
    </section>
  );
};

export default ManageDoctors;
