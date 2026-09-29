/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 */
import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  ArrowLeft,
  Search,
  X,
  RotateCcw,
  UserPlus,
  Stethoscope,
  Briefcase,
  Building2,
  AlertCircle,
  AlertTriangle,
  Pencil,
  Trash2,
  ChevronDown,
  Phone,
  BadgePercent,
  Banknote,
  Check,
  Lock,
} from "lucide-react";
import Modal from "../../../components/modal";
import Popup from "../../../components/popup";
import referrerService from "../../../api/referrer";
import { useAuthStore } from "../../../store/authStore";

// ── Type config ────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  doctor: {
    label: "ডাক্তার",
    icon: Stethoscope,
    color: "#3B82F6",
    bg: "bg-[#3B82F615]",
    border: "border-[#3B82F630]",
    text: "text-[#3B82F6]",
    grad: "from-[#3B82F6] to-[#2563EB]",
  },
  agent: {
    label: "এজেন্ট",
    icon: Briefcase,
    color: "#F59E0B",
    bg: "bg-[#F59E0B15]",
    border: "border-[#F59E0B30]",
    text: "text-[#F59E0B]",
    grad: "from-[#F59E0B] to-[#D97706]",
  },
  institute: {
    label: "প্রতিষ্ঠান",
    icon: Building2,
    color: "#0D9488",
    bg: "bg-[#0D948815]",
    border: "border-[#0D948830]",
    text: "text-[#0D9488]",
    grad: "from-[#0D9488] to-[#0F766E]",
  },
};

// ── Page background — matches Setup.jsx / DailyReport.jsx / ManageStaff.jsx ────
const pageGradientBg = "bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,#eef2ff_0%,#f8fafc_45%,#f8fafc_100%)]";

// ── Initial form data ──────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: "",
  contactNumber: "",
  degree: "",
  details: "",
  type: "doctor",
  commissionType: "percentage",
  commissionValue: 0,
};

// ── Error helpers ──────────────────────────────────────────────────────────────
const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";

const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return err?.response?.data?.error ?? PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};

// ── Axios‑native network error detection (same as all other pages) ──────────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// ── Shared input helpers ───────────────────────────────────────────────────────
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

// ── FormField ──────────────────────────────────────────────────────────────────
const FormField = ({ label, required, children }) => (
  <div className="min-w-0">
    <label className="block mb-1.5 font-['IBM_Plex_Mono',monospace] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
      {label}
      {required && <span className="text-[#EF4444] ml-[3px]">*</span>}
    </label>
    {children}
  </div>
);

// ── Referrer Form Modal (create / edit basic info) ──────────────────────────────
const ReferrerFormModal = ({ formData, onChange, onSubmit, onClose, saving, apiError }) => {
  const isEdit = formData.formType === "editReferrer";
  const gradFrom = isEdit ? "#8B5CF6" : "#0D9488";
  const gradTo = isEdit ? "#7C3AED" : "#0F766E";
  const accentText = isEdit ? "text-[#8B5CF6]" : "text-[#0D9488]";
  const accentBorder = isEdit ? "border-[#8B5CF620]" : "border-[#0D948820]";
  const accentShadow = isEdit ? "shadow-[0_8px_20px_#8B5CF640]" : "shadow-[0_8px_20px_#0D948840]";

  const handleCommissionChange = (e) => {
    let val = parseFloat(e.target.value) || 0;
    if (formData.commissionType === "percentage" && val > 100) val = 100;
    onChange("commissionValue", val);
  };

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
              className={`flex items-center justify-center shrink-0 w-11 h-11 rounded-[14px] ${accentShadow}`}
              style={{ background: `linear-gradient(135deg,${gradFrom},${gradTo})` }}
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
                {isEdit ? "মিডিয়া সম্পাদনা" : "মিডিয়া নিবন্ধন"}
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
          {/* Type selector */}
          <FormField label="ধরন" required>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TYPE_CONFIG).map(([value, { label, icon: Icon, bg, border, text }]) => {
                const active = formData.type === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onChange("type", value)}
                    className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 min-w-0 px-2 sm:px-3 py-3 transition-all font-semibold rounded-xl border-[1.5px] font-['IBM_Plex_Mono',monospace] text-xs
                      ${active ? `${bg} ${border} ${text}` : "bg-white border-[#E2E8F0] text-[#64748B]"}`}
                  >
                    <Icon className="w-[14px] h-[14px] shrink-0" />
                    <span className="truncate">{label}</span>
                    {active && <Check className="w-[11px] h-[11px] shrink-0 sm:ml-auto" />}
                  </button>
                );
              })}
            </div>
          </FormField>

          {/* Name + Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="পূর্ণ নাম" required>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="মিডিয়ার নাম"
                className={`${inputBase} px-3 py-2.5 text-sm`}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </FormField>
            <FormField label="যোগাযোগ নম্বর" required>
              <input
                type="tel"
                value={formData.contactNumber || ""}
                onChange={(e) => onChange("contactNumber", e.target.value)}
                placeholder="01XXXXXXXXX"
                maxLength={11}
                className={`${inputBase} px-3 py-2.5 text-sm`}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </FormField>
          </div>

          {/* Degree */}
          {formData.type === "doctor" && (
            <FormField label="ডিগ্রি">
              <input
                type="text"
                value={formData.degree || ""}
                onChange={(e) => onChange("degree", e.target.value)}
                placeholder="MBBS, MD, FCPS…"
                className={`${inputBase} px-3 py-2.5 text-sm`}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </FormField>
          )}

          {/* Details */}
          <FormField label="বিবরণ">
            <textarea
              value={formData.details || ""}
              onChange={(e) => onChange("details", e.target.value)}
              placeholder="অতিরিক্ত তথ্য…"
              rows={2}
              className={`${inputBase} px-3 py-2 text-sm resize-none`}
              onFocus={focusInput}
              onBlur={blurInput}
            />
          </FormField>

          {/* Commission — create only. On edit, commission has its own dedicated CommissionModal */}
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
                      label: "পারসেন্টেজ (%)",
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
                    const active = formData.commissionType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          onChange("commissionType", type);
                          onChange("commissionValue", 0);
                        }}
                        className={`flex items-center justify-center sm:justify-start gap-2 min-w-0 px-2 sm:px-3 py-3 transition-all font-semibold rounded-xl border-[1.5px] font-['IBM_Plex_Mono',monospace] text-xs
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
                    step={formData.commissionType === "percentage" ? "0.1" : "1"}
                    max={formData.commissionType === "percentage" ? 100 : undefined}
                    value={formData.commissionValue}
                    onChange={handleCommissionChange}
                    placeholder={formData.commissionType === "percentage" ? "০ – ১০০" : "পরিমাণ লিখুন"}
                    className={`${inputBase} text-sm ${formData.commissionType === "percentage" ? "pl-3.5 pr-9" : "pl-8 pr-3.5"} py-2.5`}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  {formData.commissionType === "percentage" ? (
                    <span className="absolute right-3 top-[20px] -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-sm font-bold text-[#F59E0B]">
                      %
                    </span>
                  ) : (
                    <span className="absolute left-3 top-[20px] -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-sm font-bold text-[#0D9488]">
                      ৳
                    </span>
                  )}
                  {formData.commissionType === "percentage" && (
                    <p className="mt-1 text-[10px] text-[#94A3B8] font-['IBM_Plex_Mono',monospace]">
                      সর্বোচ্চ ১০০% পর্যন্ত
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer — fixed, never scrolls */}
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
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={saving}
              className="flex-1 py-3 flex items-center justify-center gap-2 font-semibold transition-all rounded-xl border-none text-white font-['IBM_Plex_Mono',monospace] text-xs"
              style={{
                background: saving ? "#94A3B8" : `linear-gradient(135deg,${gradFrom},${gradTo})`,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? (
                <span className="animate-spin inline-block w-[14px] h-[14px] rounded-full border-2 border-white/40 border-t-white" />
              ) : isEdit ? (
                <Pencil className="w-[13px] h-[13px]" />
              ) : (
                <UserPlus className="w-[13px] h-[13px]" />
              )}
              {isEdit ? "Save Changes" : "Register"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ── Commission Modal ─────────────────────────────────────────────────────────
const CommissionModal = ({ referrer, onClose, onSaved }) => {
  const [commissionType, setCommissionType] = useState(referrer.commissionType ?? "percentage");
  const [commissionValue, setCommissionValue] = useState(referrer.commissionValue ?? 0);
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
      await referrerService.updateCommission({
        _id: referrer._id,
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
                {referrer.name}
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
                    label: "পারসেন্টেজ (%)",
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
                      className={`flex items-center justify-center sm:justify-start gap-2 min-w-0 px-2 sm:px-3 py-3 transition-all font-semibold rounded-xl border-[1.5px] font-['IBM_Plex_Mono',monospace] text-xs
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
                  <span className="absolute right-3 top-[20px] -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-sm font-bold text-[#F59E0B]">
                    %
                  </span>
                ) : (
                  <span className="absolute left-3 top-[20px] -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-sm font-bold text-[#0D9488]">
                    ৳
                  </span>
                )}
                {commissionType === "percentage" && (
                  <p className="mt-1 text-[10px] text-[#94A3B8] font-['IBM_Plex_Mono',monospace]">
                    সর্বোচ্চ ১০০% পর্যন্ত
                  </p>
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
              Cancel
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
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ── Action Chip ───────────────────────────────────────────────────────────────
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

// ── Avatar initial chip ─────────────────────────────────────────────────────────
const Avatar = ({ name, color, bg }) => {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className={`w-10 h-10 flex items-center justify-center shrink-0 text-[14px] font-bold rounded-[9px] font-['IBM_Plex_Mono',monospace] ${bg}`}
      style={{ color }}
    >
      {initial}
    </div>
  );
};

// ── Referrer Row — card style, mirrors StaffRow in ManageStaff ─────────────────
//
// Overflow strategy: the collapsed header is a single-line summary, so every
// text node in it is `truncate` inside a `min-w-0` flex child (min-w-0 is what
// lets a flex item shrink below its content width — without it `truncate`
// does nothing and long names push past the card). The type badge stays
// visible at all sizes (short label, shrink-0); the full name, degree and
// details are shown wrapped in the expanded section.
const ReferrerRow = ({ input, index, onEdit, onCommission, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[input.type] ?? TYPE_CONFIG.doctor;
  const TypeIcon = cfg.icon;
  const isPercent = input.commissionType === "percentage";
  const commGrad = isPercent ? "linear-gradient(135deg,#F59E0B,#D97706)" : "linear-gradient(135deg,#0D9488,#0F766E)";
  const commShadow = isPercent ? "shadow-[0_3px_8px_#F59E0B30]" : "shadow-[0_3px_8px_#0D948830]";

  return (
    <div
      className="bg-white border border-[#E2E8F0] rounded-[14px] transition-shadow min-w-0"
      style={{ boxShadow: expanded ? "0 4px 14px rgba(15,23,42,0.08)" : "0 1px 2px rgba(15,23,42,0.03)" }}
    >
      <button onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        <div className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-3.5">
          <Avatar name={input.name} color={cfg.color} bg={cfg.bg} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="min-w-0 truncate font-['IBM_Plex_Sans',sans-serif] text-sm font-semibold text-[#0F172A]">
                {input.name}
              </span>
              <span
                className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md border-[1.5px] font-['IBM_Plex_Mono',monospace] text-[9.5px] font-bold ${cfg.bg} ${cfg.border} ${cfg.text}`}
              >
                <TypeIcon className="w-[9px] h-[9px]" />
                {cfg.label}
              </span>
            </div>
            <p className="font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#94A3B8] mt-0.5 truncate">
              {input.degree || input.contactNumber || "—"}
            </p>
          </div>

          <span
            className={`shrink-0 flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-[20px] text-white font-['IBM_Plex_Mono',monospace] text-xs font-bold ${commShadow}`}
            style={{ background: commGrad }}
          >
            {isPercent ? <BadgePercent className="w-[11px] h-[11px]" /> : <Banknote className="w-[11px] h-[11px]" />}
            {isPercent ? `${input.commissionValue}%` : `৳${input.commissionValue?.toLocaleString("en-IN")}`}
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
                {input.name}
              </p>
              {input.degree && (
                <p className="flex items-start gap-1.5">
                  <Stethoscope className="w-3 h-3 text-[#3B82F6] shrink-0 mt-[3px]" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{input.degree}</span>
                </p>
              )}
              {input.contactNumber && (
                <p className="flex items-start gap-1.5">
                  <Phone className="w-3 h-3 text-[#6366F1] shrink-0 mt-[3px]" />
                  <span className="min-w-0 break-words">{input.contactNumber}</span>
                </p>
              )}
              {input.details && (
                <p className="min-w-0 whitespace-pre-line break-words [overflow-wrap:anywhere]">{input.details}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ActionChip onClick={onEdit} icon={Pencil} label="Edit" color="#6366F1" />
              <ActionChip onClick={onCommission} icon={BadgePercent} label="Commission" color="#8B5CF6" />
              <ActionChip onClick={onDelete} icon={Trash2} label="Delete" color="#EF4444" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Stat Card ──────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color, grad, icon: Icon, className = "" }) => (
  <div
    className={`bg-white relative overflow-hidden min-w-0 border border-[#E2E8F0] rounded-2xl p-[12px_14px] sm:p-[14px_16px] shadow-[0_2px_8px_rgba(15,23,42,0.05)] ${className}`}
  >
    <div className="absolute top-0 right-0 w-16 h-16 opacity-5 rounded-[0_16px_0_100%]" style={{ background: grad }} />
    <div className="flex items-center gap-2 mb-2 min-w-0">
      <div
        className="flex items-center justify-center shrink-0 w-[26px] h-[26px] rounded-lg"
        style={{ background: grad }}
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

// ── Filter Dropdown ────────────────────────────────────────────────────────────
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

// ── Skeleton ───────────────────────────────────────────────────────────────────
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

// ── Filter options ─────────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: "doctor", label: "ডাক্তার" },
  { value: "agent", label: "এজেন্ট" },
  { value: "institute", label: "প্রতিষ্ঠান" },
];

// ── Main Page ──────────────────────────────────────────────────────────────────
const ManageReferrer = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  // ═══════ Front-end permission check ═══════
  const hasAccess = isAdmin || user?.permissions?.manageReferrers === true;
  if (!hasAccess) {
    return <Popup type="denied" message="মিডিয়া ম্যানেজমেন্ট দেখার অনুমতি আপনার নেই।" onClose={() => navigate("/")} />;
  }

  const [referrers, setReferrers] = useState([]);
  const [maxReferrer, setMaxReferrer] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [popup, setPopup] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false); // ← new
  const [formModal, setFormModal] = useState(null);
  const [formApiError, setFormApiError] = useState("");
  const [commissionModal, setCommissionModal] = useState(null);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadReferrers = async () => {
    try {
      const res = await referrerService.getAll();
      setReferrers(res.data.referrers);
      setMaxReferrer(res.data.maxReferrer);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        setPopup({ type: "error", message: getErrorMessage(err, "মিডিয়া লোড করতে ব্যর্থ।") });
      }
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadReferrers();
  }, []);

  const stats = useMemo(
    () => ({
      total: referrers.length,
      doctors: referrers.filter((r) => r.type === "doctor").length,
      agents: referrers.filter((r) => r.type === "agent").length,
      institutes: referrers.filter((r) => r.type === "institute").length,
    }),
    [referrers],
  );

  // ─── Referrer limit ─────────────────────────────────────────────────────
  // maxReferrer comes straight from GET /referrers (backend reads it off
  // the lab record). null means "no limit set on this lab". No per-type
  // split here — the limit applies to the full referrer list, mirroring
  // how the backend counts it.
  const atReferrerLimit = maxReferrer !== null && stats.total >= maxReferrer;

  const filtered = useMemo(
    () =>
      referrers.filter((r) => {
        if (typeFilter !== "all" && r.type !== typeFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          return r.name.toLowerCase().includes(q) || r.contactNumber.includes(q) || r.degree?.toLowerCase().includes(q);
        }
        return true;
      }),
    [referrers, typeFilter, search],
  );

  const handleFormChange = (field, value) => {
    setFormModal((p) => ({ ...p, [field]: value }));
    if (formApiError) setFormApiError("");
  };

  const openFormModal = (data) => {
    setFormApiError("");
    setFormModal(data);
  };

  // Guarded entry point for opening the "add referrer" form — used by both
  // the header button and (if needed elsewhere) any other add entry point,
  // so the limit check lives in one place.
  const handleAddReferrerClick = () => {
    if (atReferrerLimit) {
      setPopup({
        type: "error",
        message: `আপনার ল্যাবে সর্বোচ্চ ${maxReferrer} জন মিডিয়া যোগ করা যাবে। সীমা পূর্ণ হয়েছে। সীমা বাড়াতে আমাদের সাথে যোগাযোগ করুন।`,
      });
      return;
    }
    openFormModal({ ...EMPTY_FORM, formType: "addReferrer" });
  };

  const closeFormModal = () => {
    setFormModal(null);
    setFormApiError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isEdit = formModal.formType === "editReferrer";

    // Re-check the limit right before submit (not just at the point the
    // form was opened) — covers a form left open while the last slot gets
    // filled elsewhere. No API call is made when this fires; the backend
    // check remains the authoritative guard for direct API access.
    if (!isEdit && atReferrerLimit) {
      return setFormApiError(
        `আপনার ল্যাবে সর্বোচ্চ ${maxReferrer} জন মিডিয়া যোগ করা যাবে। সীমা পূর্ণ হয়েছে। সীমা বাড়াতে আমাদের সাথে যোগাযোগ করুন।`,
      );
    }

    if (!formModal.name?.trim()) return setFormApiError("নাম প্রয়োজন।");
    if (!formModal.contactNumber?.trim()) return setFormApiError("যোগাযোগ নম্বর প্রয়োজন।");
    try {
      setSaving(true);
      setFormApiError("");
      if (isEdit) {
        const { name, contactNumber, degree, details, type, _id } = formModal;
        await referrerService.editReferrer({ name, contactNumber, degree, details, type, _id });
      } else {
        const { name, contactNumber, degree, details, type, commissionType, commissionValue } = formModal;
        await referrerService.addReferrer({
          name,
          contactNumber,
          degree,
          details,
          type,
          commissionType,
          commissionValue,
        });
      }
      await loadReferrers();
      setPopup({ type: "success", message: isEdit ? "মিডিয়া আপডেট হয়েছে।" : "মিডিয়া নিবন্ধিত হয়েছে।" });
      setFormModal(null);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        setFormApiError(getErrorMessage(err, "সমস্যা হয়েছে। আবার চেষ্টা করুন।"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCommissionSaved = async () => {
    try {
      setCommissionModal(null);
      await loadReferrers();
      setPopup({ type: "success", message: "কমিশন আপডেট হয়েছে।" });
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        setPopup({ type: "error", message: getErrorMessage(err, "রিফ্রেশ ব্যর্থ হয়েছে।") });
      }
    }
  };

  const handleDelete = async (_id) => {
    try {
      await referrerService.deleteReferrer(_id);
      setReferrers((prev) => prev.filter((r) => r._id !== _id));
      setPopup({ type: "success", message: "মিডিয়া ডিলিট করে ফেলা হয়েছে।" });
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        setPopup({ type: "error", message: getErrorMessage(err, "মুছতে ব্যর্থ।") });
      }
    }
  };

  const hasFilters = typeFilter !== "all";

  return (
    <section className={`min-h-screen px-3 sm:px-4 py-5 sm:py-6 ${pageGradientBg} font-[Noto_Sans_Bengali,sans-serif]`}>
      {popup && <Popup type={popup.type} message={popup.message} onClose={() => setPopup(null)} />}
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      {formModal && (
        <ReferrerFormModal
          formData={formModal}
          onChange={handleFormChange}
          onSubmit={handleSubmit}
          onClose={closeFormModal}
          saving={saving}
          apiError={formApiError}
        />
      )}

      {commissionModal && (
        <CommissionModal
          referrer={commissionModal}
          onClose={() => setCommissionModal(null)}
          onSaved={handleCommissionSaved}
        />
      )}

      {modal?.type === "delete" && (
        <Popup
          type="warning"
          message={`"${modal.item.name}" স্থায়ীভাবে ডিলিট হয়ে যাবে। এই কাজ পূর্বাবস্থায় ফেরানো যাবে না।`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => handleDelete(modal.item._id)}
          onClose={() => setModal(null)}
        />
      )}

      <div className="w-full min-w-0 max-w-2xl mx-auto">
        {/* Page header */}
        <div className="flex items-start justify-between gap-3 mb-5 sm:mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl shadow-md"
              style={{
                background: "linear-gradient(135deg,#6366F1,#4F46E5)",
                boxShadow: "0 4px 10px #6366F135",
              }}
            >
              <Users className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-['IBM_Plex_Sans',sans-serif] text-xl sm:text-[22px] font-bold text-[#0F172A] leading-tight truncate">
                মিডিয়া তালিকা
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
              onClick={handleAddReferrerClick}
              disabled={atReferrerLimit}
              title={atReferrerLimit ? `মিডিয়া সীমা (${maxReferrer}) পূর্ণ হয়েছে` : undefined}
              className="flex items-center gap-1.5 transition-all font-semibold px-3 sm:px-4 py-2 rounded-xl text-white font-['IBM_Plex_Mono',monospace] text-xs border-none shadow-[0_4px_14px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.5)] disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed"
              style={{ background: atReferrerLimit ? "#94A3B8" : "linear-gradient(135deg,#6366F1,#4F46E5)" }}
            >
              {atReferrerLimit ? <Lock className="w-[13px] h-[13px]" /> : <UserPlus className="w-[13px] h-[13px]" />}
              <span className="whitespace-nowrap">New Media</span>
            </button>
          </div>
        </div>

        {/* Stats — 2 columns on mobile, 4/5 from sm. With a limit card the 5th
            item spans the full mobile row so there's no lone half-width orphan. */}
        {!initialLoading && (
          <div
            className={`grid grid-cols-2 ${maxReferrer !== null ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-2.5 sm:gap-3 mb-5`}
          >
            <StatCard
              label="মোট"
              value={stats.total}
              color="#6366F1"
              grad="linear-gradient(135deg,#6366F1,#4F46E5)"
              icon={Users}
            />
            <StatCard
              label="ডাক্তার"
              value={stats.doctors}
              color="#3B82F6"
              grad="linear-gradient(135deg,#3B82F6,#2563EB)"
              icon={Stethoscope}
            />
            <StatCard
              label="এজেন্ট"
              value={stats.agents}
              color="#F59E0B"
              grad="linear-gradient(135deg,#F59E0B,#D97706)"
              icon={Briefcase}
            />
            <StatCard
              label="প্রতিষ্ঠান"
              value={stats.institutes}
              color="#0D9488"
              grad="linear-gradient(135deg,#0D9488,#0F766E)"
              icon={Building2}
            />
            {maxReferrer !== null && (
              <StatCard
                className="col-span-2 sm:col-span-1"
                label="সীমা"
                value={`${stats.total}/${maxReferrer}`}
                color={atReferrerLimit ? "#EF4444" : "#64748B"}
                grad={
                  atReferrerLimit
                    ? "linear-gradient(135deg,#EF4444,#DC2626)"
                    : "linear-gradient(135deg,#64748B,#475569)"
                }
                icon={Lock}
              />
            )}
          </div>
        )}

        {atReferrerLimit && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 mb-4 bg-[#FEF2F2] border-[1.5px] border-[#EF444430] rounded-xl">
            <Lock className="w-[13px] h-[13px] text-[#EF4444] mt-[1px] shrink-0" />
            <p className="min-w-0 text-[11px] leading-[1.5] text-[#991B1B] font-[Noto_Sans_Bengali,sans-serif]">
              আপনার ল্যাবে সর্বোচ্চ {maxReferrer} জন মিডিয়া যোগ করা যাবে এবং আপনি সীমায় পৌঁছেছেন। নতুন মিডিয়া যোগ
              করতে সীমা বাড়াতে আমাদের সাথে যোগাযোগ করুন।
            </p>
          </div>
        )}

        {/* Toolbar card — search takes its own full row on mobile, the filter
            then sits below; on ≥sm everything sits inline. */}
        <div className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-2 mb-4 bg-white border border-[#E2E8F0] rounded-2xl">
          <div className="relative basis-full sm:basis-[160px] sm:flex-1 min-w-0">
            <Search className="w-[13px] h-[13px] text-[#94A3B8] absolute left-[11px] top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="নাম, নম্বর বা ডিগ্রি…"
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
          <FilterDropdown value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} placeholder="সব ধরন" />
          {hasFilters && (
            <button
              onClick={() => setTypeFilter("all")}
              className="flex items-center justify-center gap-1.5 transition-all font-semibold py-[7px] px-3 border-[1.5px] border-[#EF444430] rounded-[10px] text-[#EF4444] font-['IBM_Plex_Mono',monospace] text-[11px] bg-[#EF444406] hover:bg-[#EF444412]"
            >
              <RotateCcw className="w-3 h-3" /> রিসেট
            </button>
          )}
        </div>

        {/* Referrer cards */}
        {initialLoading ? (
          <Skeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#94A3B8] bg-white border border-[#E2E8F0] rounded-2xl">
            <AlertCircle className="w-7 h-7 opacity-40" />
            <p className="font-['IBM_Plex_Mono',monospace] text-xs text-center px-4">
              {hasFilters || search ? "কোনো মিডিয়া পাওয়া যায়নি" : "এখনো কোনো মিডিয়া যোগ করা হয়নি"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item, index) => (
              <ReferrerRow
                key={item._id}
                input={item}
                index={index}
                onEdit={() => openFormModal({ ...item, formType: "editReferrer" })}
                onCommission={() => setCommissionModal(item)}
                onDelete={() => setModal({ type: "delete", item })}
              />
            ))}
          </div>
        )}

        {/* Footer note */}
        <p className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#94A3B8] mt-4 text-center">
          * সকল মিডিয়ার কমিশন প্রযোজ্য
        </p>
      </div>
    </section>
  );
};

export default ManageReferrer;
