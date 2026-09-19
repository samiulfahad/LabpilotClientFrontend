/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 */
import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  X,
  FlaskConical,
  RotateCcw,
  Wifi,
  WifiOff,
  ArrowLeft,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  AlertCircle,
  Banknote,
  Coins,
  Percent,
  AlertTriangle,
  Layers,
  CircleSlash,
} from "lucide-react";
import Modal from "../../../components/modal";
import testService from "../../../api/test";
import Popup from "../../../components/popup";
import { useAuthStore } from "../../../store/authStore";

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  ink: "#0F172A",
  muted: "#94A3B8",
  sub: "#64748B",
  border: "#E2E8F0",
  paper: "#F8FAFC",
  hover: "#F1F5F9",
  divider: "#EEF2FF",
  teal: "#0D9488",
  indigo: "#6366F1",
  red: "#EF4444",
  amber: "#F59E0B",
  purple: "#8B5CF6",
  green: "#10B981",
  blue: "#3B82F6",
};

// Page background
const pageGradientBg = "bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,#eef2ff_0%,#f8fafc_45%,#f8fafc_100%)]";

const UNCATEGORIZED_ID = "uncategorized";

// Configuration semantics
// ───────────────────────
// A test is CONFIGURED as soon as a price is set. Commission ৳0 is a
// legitimate, deliberate value (plenty of tests pay no referrer cut), so it
// never marks a test incomplete — it's surfaced as its own filter/stat
// instead, for labs that want to audit which tests still pay nothing.
const CONFIG_OPTIONS = [
  { value: "all", label: "সব" },
  { value: "priceSet", label: "মূল্য নির্ধারিত" },
  { value: "priceUnset", label: "মূল্য বাকি" },
  { value: "commissionSet", label: "কমিশন নির্ধারিত" },
  { value: "commissionZero", label: "শূন্য কমিশন" },
];

// Debounce (ms) before firing GET /test/manual/check-duplicate as the user
// types a manual test name — mirrors the admin catalog's own debounce.
const DUPLICATE_CHECK_DEBOUNCE_MS = 400;

// ── Error helpers ──────────────────────────────────────────────────────────────
const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";
const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};
const getErrorStatus = (error) => error?.response?.status ?? error?.status ?? null;

// ── Axios‑native network error detection (same as all other pages) ──────────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// ── Search normalisation ─────────────────────────────────────────────────────
// Test names carry inconsistent punctuation/spacing across the catalog
// (e.g. "S. GPT", "S GPT", "S-GPT", "HIV (1+2)"). Strip everything except
// letters/digits (and lowercase) from both the query and the candidate name
// before comparing, so "sgpt" matches all of the above regardless of dots,
// dashes, spaces, parentheses, plus signs, etc.
const normaliseForSearch = (str) => (str ?? "").toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]/g, "");
const matchesSearch = (name, query) => {
  const q = normaliseForSearch(query);
  if (!q) return true;
  return normaliseForSearch(name).includes(q);
};

// ── Shared input helpers ───────────────────────────────────────────────────────
const inputBase =
  "w-full outline-none transition-all rounded-xl border-[1.5px] border-[#E2E8F0] bg-white text-[#0F172A] font-['IBM_Plex_Mono',monospace]";
const focusInput = (e) => {
  e.target.style.borderColor = "#0D9488";
  e.target.style.boxShadow = "0 0 0 3px #0D948820";
};
const blurInput = (e) => {
  e.target.style.borderColor = "#E2E8F0";
  e.target.style.boxShadow = "";
};
// Number inputs otherwise change value on mouse-wheel scroll while focused
// (browser default behavior) — blur on wheel so scrolling the page never
// silently edits a price/commission value.
const blockWheelChange = (e) => e.target.blur();

// ══════════════════════════════════════════════════════════════════════════════
// Amount Modal (used for both price and commission)
// ══════════════════════════════════════════════════════════════════════════════
const AMOUNT_FIELD_CONFIG = {
  price: {
    label: "মূল্য পরিবর্তন",
    icon: Banknote,
    accent: "#3B82F6",
    accentDark: "#2563EB",
    headerBg: "linear-gradient(135deg,#EFF6FF,#DBEAFE)",
    headerBorder: "#3B82F620",
    errorLabel: "মূল্য সংরক্ষণ ব্যর্থ।",
    save: (testId, value) => testService.updatePrice(testId, value),
  },
  commission: {
    label: "কমিশন পরিবর্তন",
    icon: Coins,
    accent: "#8B5CF6",
    accentDark: "#7C3AED",
    headerBg: "linear-gradient(135deg,#F5F3FF,#EDE9FE)",
    headerBorder: "#8B5CF620",
    errorLabel: "কমিশন সংরক্ষণ ব্যর্থ।",
    save: (testId, value) => testService.updateCommission(testId, value),
  },
};

const AmountModal = ({ field, test, onClose, onSave, onNetworkError }) => {
  const cfg = AMOUNT_FIELD_CONFIG[field];
  const Icon = cfg.icon;
  const [value, setValue] = useState(String(test[field] ?? ""));
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");

  const numeric = parseFloat(value);
  const isEmpty = value === "" || isNaN(numeric) || numeric < 0;
  const counterpart = field === "price" ? (test.commission ?? 0) : (test.price ?? 0);
  const exceedsCounterpart = !isEmpty && (field === "price" ? numeric < counterpart : numeric > counterpart);
  const invalid = isEmpty || exceedsCounterpart;

  const handleSubmit = async () => {
    if (invalid) return;
    setSaving(true);
    setApiError("");
    const parsed = parseFloat(value) || 0;
    try {
      await cfg.save(test._id, parsed);
      onSave({ ...test, [field]: parsed });
    } catch (err) {
      if (isNetworkError(err)) {
        setApiError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
        onNetworkError?.();
      } else if (getErrorStatus(err) === 404) {
        onSave({ ...test, __notFound: true });
        return;
      } else {
        setApiError(getErrorMessage(err, cfg.errorLabel));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="sm" onClose={onClose}>
      <div className="flex flex-col max-h-[calc(100svh-96px)] overflow-hidden">
        {/* Header */}
        <div
          className="shrink-0 px-6 py-5 flex items-center justify-between border-b"
          style={{ background: cfg.headerBg, borderColor: cfg.headerBorder }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="flex items-center justify-center shrink-0 w-11 h-11 rounded-[14px]"
              style={{
                background: `linear-gradient(135deg,${cfg.accent},${cfg.accentDark})`,
                boxShadow: `0 8px 20px ${cfg.accent}59`,
              }}
            >
              <Icon className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <p
                className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.1em] mb-[2px]"
                style={{ color: cfg.accentDark }}
              >
                {cfg.label}
              </p>
              <p className="font-['IBM_Plex_Sans',sans-serif] text-base font-bold text-[#0F172A] truncate max-w-[280px]">
                {test.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[#94A3B8] border-[1.5px] border-[#E2E8F0] bg-white transition-all hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="w-[15px] h-[15px]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 bg-[#F8FAFC] flex-1 min-h-0 overflow-y-auto">
          <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
            <p className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.1em] text-[#94A3B8] mb-2">
              {cfg.label}
            </p>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-xs font-bold"
                style={{ color: cfg.accentDark }}
              >
                ৳
              </span>
              <input
                type="number"
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (apiError) setApiError("");
                }}
                placeholder="০.০০"
                min="0"
                className={`${inputBase} pl-7 pr-3 py-2.5 text-sm`}
                onFocus={focusInput}
                onBlur={blurInput}
                onWheel={blockWheelChange}
              />
            </div>
            {field === "commission" && (
              <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#94A3B8]">
                ৳০ দিলে এই টেস্টে কোনো কমিশন থাকবে না — এটি বৈধ।
              </p>
            )}
            {exceedsCounterpart && (
              <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[11px] text-[#EF4444]">
                {field === "price"
                  ? "মূল্য বিদ্যমান কমিশনের চেয়ে কম হতে পারবে না।"
                  : "কমিশন মূল্যের চেয়ে বেশি হতে পারবে না।"}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-white border-t border-[#E2E8F0]">
          {apiError && (
            <div className="mx-6 mt-4 flex items-start gap-2.5 px-4 py-3 bg-[#EF444408] border-[1.5px] border-[#EF444430] rounded-xl">
              <AlertTriangle className="w-[14px] h-[14px] text-[#EF4444] shrink-0 mt-[1px]" />
              <span className="text-xs font-['IBM_Plex_Mono',monospace] text-[#EF4444]">{apiError}</span>
            </div>
          )}
          <div className="px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 font-semibold transition-all rounded-xl border-[1.5px] border-[#E2E8F0] text-[#64748B] font-['IBM_Plex_Mono',monospace] text-xs hover:bg-[#F1F5F9]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || invalid}
              className="flex-1 py-3 flex items-center justify-center gap-2 font-semibold transition-all rounded-xl border-none text-white font-['IBM_Plex_Mono',monospace] text-xs disabled:opacity-60"
              style={{ background: saving ? "#94A3B8" : `linear-gradient(135deg,${cfg.accent},${cfg.accentDark})` }}
            >
              {saving ? (
                <span className="animate-spin inline-block w-[14px] h-[14px] rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Icon className="w-[13px] h-[13px]" />
              )}
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Manual Add Test Modal (test not found in catalog)
// ══════════════════════════════════════════════════════════════════════════════
const ManualAddTestModal = ({ initialName, onClose, onAdded, onNetworkError }) => {
  const [name, setName] = useState(initialName ?? "");
  const [price, setPrice] = useState("");
  const [commission, setCommission] = useState("");
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  // Duplicate-name check against this lab's own tests — mirrors the admin
  // catalog's DupWarning contract: `exact` blocks submission, `fuzzy` is
  // informational only (see GET /test/manual/check-duplicate).
  const [dup, setDup] = useState({ checking: false, exact: null, fuzzy: [] });

  const trimmedName = name.trim();
  const numericPrice = parseFloat(price);
  const numericCommission = parseFloat(commission);
  const priceInvalid = price === "" || isNaN(numericPrice) || numericPrice < 0;
  const commissionInvalid = commission !== "" && (isNaN(numericCommission) || numericCommission < 0);
  const exceedsPrice = !priceInvalid && !commissionInvalid && (parseFloat(commission) || 0) > numericPrice;
  const invalid = trimmedName.length === 0 || priceInvalid || commissionInvalid || exceedsPrice || !!dup.exact;

  // Debounced call to GET /test/manual/check-duplicate as the name changes.
  useEffect(() => {
    if (!trimmedName) {
      setDup({ checking: false, exact: null, fuzzy: [] });
      return;
    }

    let cancelled = false;
    setDup((d) => ({ ...d, checking: true }));

    const handle = setTimeout(async () => {
      try {
        const { data } = await testService.checkManualDuplicate(trimmedName);
        if (cancelled) return;
        setDup({ checking: false, exact: data.exact ?? null, fuzzy: data.fuzzy ?? [] });
      } catch {
        if (!cancelled) setDup({ checking: false, exact: null, fuzzy: [] });
      }
    }, DUPLICATE_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmedName]);

  const handleSubmit = async () => {
    if (invalid || dup.exact) return; // safety net alongside the disabled button state
    setSaving(true);
    setApiError("");
    try {
      const res = await testService.addManualTest({
        name: trimmedName,
        price: numericPrice,
        commission: parseFloat(commission) || 0,
      });
      onAdded(res.data);
    } catch (err) {
      if (isNetworkError(err)) {
        setApiError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
        onNetworkError?.();
      } else if (getErrorStatus(err) === 409) {
        setApiError("এই নামে টেস্ট ইতিমধ্যে বিদ্যমান।");
      } else {
        setApiError(getErrorMessage(err, "টেস্ট যোগ করতে ব্যর্থ।"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen size="sm" onClose={onClose}>
      <div className="flex flex-col max-h-[calc(100svh-96px)] overflow-hidden">
        {/* Header */}
        <div
          className="shrink-0 px-6 py-5 flex items-center justify-between border-b border-[#0D948820]"
          style={{ background: "linear-gradient(135deg,#0D948815 0%,#0F766E08 100%)" }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="flex items-center justify-center shrink-0 w-11 h-11 rounded-[14px] shadow-[0_8px_20px_#0D948840]"
              style={{ background: "linear-gradient(135deg,#0D9488,#0F766E)" }}
            >
              <Plus className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <p className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.1em] mb-[2px] text-[#0D9488]">
                ম্যানুয়াল টেস্ট
              </p>
              <p className="font-['IBM_Plex_Sans',sans-serif] text-base font-bold text-[#0F172A]">
                নতুন টেস্ট যোগ করুন
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[#94A3B8] border-[1.5px] border-[#E2E8F0] transition-all hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="w-[15px] h-[15px]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 bg-[#F8FAFC] flex-1 min-h-0 overflow-y-auto space-y-3">
          <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
            <p className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.1em] text-[#94A3B8] mb-2">
              টেস্টের নাম
            </p>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (apiError) setApiError("");
              }}
              placeholder="যেমন: S. GPT"
              className={`${inputBase} px-3 py-2.5 text-sm`}
              onFocus={focusInput}
              onBlur={blurInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !invalid && !saving) handleSubmit();
              }}
            />

            {/* Duplicate-name feedback — checking / exact (blocks) / fuzzy (informational) */}
            {dup.checking && (
              <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#94A3B8]">যাচাই করা হচ্ছে…</p>
            )}
            {!dup.checking && dup.exact && (
              <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#EF4444] flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3 shrink-0" />"{dup.exact.name}" নামে টেস্ট ইতিমধ্যে আছে
              </p>
            )}
            {!dup.checking && !dup.exact && dup.fuzzy.length > 0 && (
              <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#F59E0B]">
                আপনি কি বোঝাতে চেয়েছেন: {dup.fuzzy.map((f) => f.name).join(", ")}?
              </p>
            )}

            <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#94A3B8] leading-relaxed">
              এই টেস্টটি ক্যাটালগে পাওয়া যায়নি। নাম, মূল্য ও কমিশন দিয়ে যোগ করুন — ফরম্যাট পরে সেট করা যাবে।
            </p>
          </div>

          <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="flex items-center gap-1 mb-1.5 font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#0D9488]">
                  <Banknote className="w-3 h-3" /> মূল্য
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-xs font-bold text-[#0D9488]">
                    ৳
                  </span>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      if (apiError) setApiError("");
                    }}
                    placeholder="০.০০"
                    min="0"
                    className={`${inputBase} pl-7 pr-2 py-2.5 text-sm`}
                    onFocus={focusInput}
                    onBlur={blurInput}
                    onWheel={blockWheelChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !invalid && !saving) handleSubmit();
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1 mb-1.5 font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#8B5CF6]">
                  <Coins className="w-3 h-3" /> কমিশন
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-xs font-bold text-[#8B5CF6]">
                    ৳
                  </span>
                  <input
                    type="number"
                    value={commission}
                    onChange={(e) => {
                      setCommission(e.target.value);
                      if (apiError) setApiError("");
                    }}
                    placeholder="০.০০"
                    min="0"
                    className={`${inputBase} pl-7 pr-2 py-2.5 text-sm ${exceedsPrice ? "!border-[#EF4444]" : ""}`}
                    onFocus={focusInput}
                    onBlur={blurInput}
                    onWheel={blockWheelChange}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !invalid && !saving) handleSubmit();
                    }}
                  />
                </div>
              </div>
            </div>
            <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#94A3B8]">
              কমিশন ঐচ্ছিক — খালি রাখলে ৳০ ধরা হবে।
            </p>
            {exceedsPrice && (
              <p className="mt-2 font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#EF4444]">
                কমিশন মূল্যের চেয়ে বেশি হতে পারবে না।
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 bg-white border-t border-[#E2E8F0]">
          {apiError && (
            <div className="mx-6 mt-4 flex items-start gap-2.5 px-4 py-3 bg-[#EF444408] border-[1.5px] border-[#EF444430] rounded-xl">
              <AlertTriangle className="w-[14px] h-[14px] text-[#EF4444] shrink-0 mt-[1px]" />
              <span className="text-xs font-['IBM_Plex_Mono',monospace] text-[#EF4444]">{apiError}</span>
            </div>
          )}
          <div className="px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 font-semibold transition-all rounded-xl border-[1.5px] border-[#E2E8F0] text-[#64748B] font-['IBM_Plex_Mono',monospace] text-xs hover:bg-[#F1F5F9]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || invalid}
              className="flex-1 py-3 flex items-center justify-center gap-2 font-semibold transition-all rounded-xl border-none text-white font-['IBM_Plex_Mono',monospace] text-xs disabled:opacity-60"
              style={{ background: saving || invalid ? "#94A3B8" : "linear-gradient(135deg,#0D9488,#0F766E)" }}
            >
              {saving ? (
                <span className="animate-spin inline-block w-[14px] h-[14px] rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Plus className="w-[13px] h-[13px]" />
              )}
              যোগ করুন
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Add Test Modal
// ══════════════════════════════════════════════════════════════════════════════
const AddTestModal = ({ existingTests, onClose, onSaved, onNetworkError }) => {
  const [availableTests, setAvailableTests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [registeredTests, setRegisteredTests] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTests, setSelectedTests] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [manualModal, setManualModal] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [testsRes, catsRes, ownTestsRes] = await Promise.all([
          testService.getTestCatalog(),
          testService.getCategories(),
          existingTests.length === 0 ? testService.getTestList() : Promise.resolve({ data: existingTests }),
        ]);
        setAvailableTests(testsRes.data);
        setCategories(catsRes.data);
        setRegisteredTests(ownTestsRes.data);
        const expanded = {};
        catsRes.data.forEach((c) => {
          if (c._id) expanded[c._id] = true;
        });
        expanded["uncategorized"] = true;
        setExpandedCategories(expanded);
      } catch (err) {
        if (isNetworkError(err)) {
          setLoadError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
          onNetworkError?.();
        } else {
          setLoadError(getErrorMessage(err, "টেস্ট লোড করতে ব্যর্থ।"));
        }
      } finally {
        setInitialLoading(false);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const existingTestIds = new Set(registeredTests.map((t) => t.testId));
  const categoryMap = Object.fromEntries(categories.filter((c) => c._id).map((c) => [c._id, c.name]));

  const filtered = useMemo(() => {
    return availableTests.filter((t) => matchesSearch(t.name, searchQuery));
  }, [availableTests, searchQuery]);

  const groupedTests = useMemo(() => {
    const groups = {};
    filtered.forEach((test) => {
      const catKey = test.categoryId || "uncategorized";
      const catName = categoryMap[catKey] || "Uncategorized";
      if (!groups[catKey]) groups[catKey] = { name: catName, tests: [] };
      groups[catKey].tests.push(test);
    });
    return groups;
  }, [filtered, categoryMap]);

  const toggleSelect = (testKey) => {
    if (!testKey || existingTestIds.has(testKey)) return;
    if (apiError) setApiError("");
    setSelectedTests((prev) => {
      const updated = { ...prev };
      if (updated[testKey]) {
        delete updated[testKey];
      } else {
        const test = availableTests.find((t) => t._id === testKey);
        if (!test) return prev;
        updated[testKey] = { price: "", commission: "" };
      }
      return updated;
    });
  };

  const updateField = (testKey, field, value) =>
    setSelectedTests((prev) => ({ ...prev, [testKey]: { ...prev[testKey], [field]: value } }));

  const toggleCategory = (catKey) => setExpandedCategories((prev) => ({ ...prev, [catKey]: !prev[catKey] }));

  const handleSave = async () => {
    const selectedCount = Object.keys(selectedTests).length;
    if (selectedCount === 0) {
      setApiError("কমপক্ষে একটি টেস্ট নির্বাচন করুন।");
      return;
    }
    const hasInvalidRow = Object.values(selectedTests).some(
      (config) => (parseFloat(config.commission) || 0) > (parseFloat(config.price) || 0),
    );
    if (hasInvalidRow) {
      setApiError("কমিশন মূল্যের চেয়ে বেশি হতে পারবে না।");
      return;
    }
    const toSave = Object.entries(selectedTests).map(([testKey, config]) => {
      const test = availableTests.find((t) => t._id === testKey);
      return {
        name: test.name,
        testId: testKey,
        categoryId: test.categoryId ?? null,
        schemaId: test.defaultSchemaId ?? null, // ← was test.schemaId
        price: parseFloat(config.price) || 0,
        commission: parseFloat(config.commission) || 0,
      };
    });
    try {
      setSaving(true);
      setApiError("");
      await Promise.all(toSave.map((t) => testService.addTest(t)));
      onSaved(toSave);
    } catch (err) {
      if (isNetworkError(err)) {
        setApiError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
        onNetworkError?.();
      } else {
        setApiError(getErrorMessage(err, "টেস্ট যোগ করতে ব্যর্থ।"));
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = Object.keys(selectedTests).length;

  return (
    <>
      {manualModal && (
        <ManualAddTestModal
          initialName={searchQuery}
          onClose={() => setManualModal(false)}
          onAdded={(newTest) => {
            setManualModal(false);
            onSaved([newTest]);
          }}
          onNetworkError={onNetworkError}
        />
      )}
      <Modal isOpen size="lg" onClose={onClose}>
        <div className="flex flex-col max-h-[calc(100svh-96px)] overflow-hidden">
          {/* Header */}
          <div
            className="shrink-0 px-6 py-5 flex items-center justify-between border-b border-[#0D948820]"
            style={{ background: "linear-gradient(135deg,#0D948815 0%,#0F766E08 100%)" }}
          >
            <div className="flex items-center gap-3.5">
              <div
                className="flex items-center justify-center shrink-0 w-11 h-11 rounded-[14px] shadow-[0_8px_20px_#0D948840]"
                style={{ background: "linear-gradient(135deg,#0D9488,#0F766E)" }}
              >
                <Plus className="w-[18px] h-[18px] text-white" />
              </div>
              <div>
                <p className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.1em] mb-[2px] text-[#0D9488]">
                  ক্যাটালগ থেকে যোগ করুন
                </p>
                <p className="font-['IBM_Plex_Sans',sans-serif] text-base font-bold text-[#0F172A]">
                  টেস্ট নির্বাচন করুন
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-[10px] text-[#94A3B8] border-[1.5px] border-[#E2E8F0] transition-all hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <X className="w-[15px] h-[15px]" />
            </button>
          </div>

          {/* Search */}
          <div className="shrink-0 px-5 pt-4 pb-3 bg-[#F8FAFC] border-b border-[#E2E8F0]">
            <div className="relative">
              <Search className="w-[13px] h-[13px] text-[#94A3B8] absolute left-[11px] top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="টেস্টের নাম খুঁজুন…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${inputBase} pl-8 ${searchQuery ? "pr-8" : "pr-3"} py-2 text-xs`}
                onFocus={focusInput}
                onBlur={blurInput}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[#94A3B8]"
                >
                  <X className="w-[13px] h-[13px]" />
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {initialLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex items-center gap-3 px-2 py-3 border-b border-[#E2E8F0]">
                    <div className="w-5 h-5 rounded bg-[#E2E8F0]" />
                    <div className="flex-1 h-3 bg-[#E2E8F0] rounded" />
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#94A3B8]">
                <AlertCircle className="w-7 h-7 opacity-40" />
                <p className="font-['IBM_Plex_Mono',monospace] text-xs text-[#EF4444]">{loadError}</p>
              </div>
            ) : Object.keys(groupedTests).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-[#94A3B8]">
                <FlaskConical className="w-7 h-7 opacity-40" />
                <p className="font-['IBM_Plex_Mono',monospace] text-xs">কোনো টেস্ট পাওয়া যায়নি</p>
                <button
                  onClick={() => setManualModal(true)}
                  className="flex items-center gap-1.5 transition-all font-semibold px-4 py-2 rounded-xl text-white font-['IBM_Plex_Mono',monospace] text-xs border-none shadow-[0_4px_14px_rgba(13,148,136,0.4)] hover:shadow-[0_6px_20px_rgba(13,148,136,0.5)]"
                  style={{ background: "linear-gradient(135deg,#0D9488,#0F766E)" }}
                >
                  <Plus className="w-[13px] h-[13px]" />
                  {searchQuery.trim() ? `"${searchQuery.trim()}" নামে নতুন টেস্ট যোগ করুন` : "নতুন টেস্ট যোগ করুন"}
                </button>
              </div>
            ) : (
              <div className="px-4 py-3 space-y-1">
                {Object.entries(groupedTests).map(([catKey, { name: catName, tests: catTests }]) => (
                  <div key={catKey}>
                    {/* Category header */}
                    <button
                      onClick={() => toggleCategory(catKey)}
                      className="w-full flex items-center gap-2 py-2 px-1 group"
                    >
                      <span className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.1em] text-[#0D9488]">
                        {catName}
                      </span>
                      <span
                        className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold px-1.5 py-px rounded-[5px] text-[#0D9488]"
                        style={{ background: "#0D948812", border: "1px solid #0D948825" }}
                      >
                        {catTests.length}
                      </span>
                      <div className="flex-1 h-px bg-[#0D948820]" />
                      {expandedCategories[catKey] ? (
                        <ChevronDown className="w-3 h-3 text-[#94A3B8]" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-[#94A3B8]" />
                      )}
                    </button>

                    {expandedCategories[catKey] &&
                      catTests.map((test, index) => {
                        const testKey = test._id;
                        const isAlreadyAdded = existingTestIds.has(testKey);
                        const isSelected = !!selectedTests[testKey];

                        return (
                          <div
                            key={testKey || `test-${catKey}-${index}`}
                            onClick={() => !isAlreadyAdded && toggleSelect(testKey)}
                            className={`flex items-start gap-3 px-2 py-2.5 rounded-xl transition-all mb-0.5
                            ${isAlreadyAdded ? "opacity-50 cursor-not-allowed" : isSelected ? "bg-[#0D948808] cursor-pointer" : "hover:bg-[#F1F5F9] cursor-pointer"}`}
                          >
                            {/* Checkbox */}
                            <div className="shrink-0 mt-0.5">
                              {isAlreadyAdded ? (
                                <div className="w-5 h-5 rounded-full bg-[#10B98120] border-2 border-[#10B981] flex items-center justify-center">
                                  <CheckCircle2 className="w-3 h-3 text-[#10B981]" />
                                </div>
                              ) : (
                                <span
                                  className="flex items-center justify-center w-5 h-5 rounded-[5px] border-[1.5px] transition-all"
                                  style={{
                                    background: isSelected ? C.teal : undefined,
                                    borderColor: isSelected ? C.teal : "#CBD5E1",
                                  }}
                                >
                                  {isSelected && <Check className="w-[9px] h-[9px] text-white" />}
                                </span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 pt-0.5">
                                <span className="font-['IBM_Plex_Sans',sans-serif] text-sm font-semibold text-[#0F172A]">
                                  {test.name}
                                </span>
                                {test.isOnline ? (
                                  <span
                                    className="inline-flex items-center gap-1 font-['IBM_Plex_Mono',monospace] text-[9px] font-bold text-white rounded-[6px] px-1.5 py-px shrink-0 shadow-[0_2px_5px_#10B98130]"
                                    style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}
                                  >
                                    <Wifi className="w-2.5 h-2.5" /> অনলাইন
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-['IBM_Plex_Mono',monospace] text-[9px] font-bold text-[#94A3B8] bg-[#F1F5F9] border border-[#E2E8F0] rounded-[6px] px-1.5 py-px shrink-0">
                                    <WifiOff className="w-2.5 h-2.5" /> অফলাইন
                                  </span>
                                )}
                                {isAlreadyAdded && (
                                  <span className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold text-[#10B981] bg-[#10B98110] border border-[#10B98125] rounded-[6px] px-1.5 py-px shrink-0">
                                    যোগ করা আছে
                                  </span>
                                )}
                              </div>

                              {isSelected && !isAlreadyAdded && (
                                <div
                                  className="mt-2.5 grid grid-cols-2 gap-2.5 p-3 rounded-xl border-[1.5px] border-[#E2E8F0] bg-[#F8FAFC]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div>
                                    <label className="flex items-center gap-1 mb-1.5 font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#0D9488]">
                                      <Banknote className="w-3 h-3" /> মূল্য
                                    </label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-xs font-bold text-[#0D9488]">
                                        ৳
                                      </span>
                                      <input
                                        type="number"
                                        value={selectedTests[testKey]?.price ?? ""}
                                        onChange={(e) => updateField(testKey, "price", e.target.value)}
                                        placeholder="০.০০"
                                        min="0"
                                        className={`${inputBase} pl-7 pr-2 py-2 text-xs bg-white`}
                                        onFocus={focusInput}
                                        onBlur={blurInput}
                                        onWheel={blockWheelChange}
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="flex items-center gap-1 mb-1.5 font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.08em] text-[#8B5CF6]">
                                      <Coins className="w-3 h-3" /> কমিশন
                                    </label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-['IBM_Plex_Mono',monospace] text-xs font-bold text-[#8B5CF6]">
                                        ৳
                                      </span>
                                      <input
                                        type="number"
                                        value={selectedTests[testKey]?.commission ?? ""}
                                        onChange={(e) => updateField(testKey, "commission", e.target.value)}
                                        placeholder="০.০০"
                                        min="0"
                                        className={`${inputBase} pl-7 pr-2 py-2 text-xs bg-white ${
                                          (parseFloat(selectedTests[testKey]?.commission) || 0) >
                                          (parseFloat(selectedTests[testKey]?.price) || 0)
                                            ? "!border-[#EF4444]"
                                            : ""
                                        }`}
                                        onFocus={focusInput}
                                        onBlur={blurInput}
                                        onWheel={blockWheelChange}
                                      />
                                    </div>
                                    {(parseFloat(selectedTests[testKey]?.commission) || 0) >
                                      (parseFloat(selectedTests[testKey]?.price) || 0) && (
                                      <p className="mt-1 font-['IBM_Plex_Mono',monospace] text-[10px] text-[#EF4444]">
                                        মূল্যের চেয়ে বেশি হতে পারবে না
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 bg-white border-t border-[#E2E8F0]">
            {apiError && (
              <div className="mx-6 mt-4 flex items-start gap-2.5 px-4 py-3 bg-[#EF444408] border-[1.5px] border-[#EF444430] rounded-xl">
                <AlertTriangle className="w-[14px] h-[14px] text-[#EF4444] shrink-0 mt-[1px]" />
                <span className="text-xs font-['IBM_Plex_Mono',monospace] text-[#EF4444]">{apiError}</span>
              </div>
            )}
            <div className="px-6 py-4 flex items-center justify-between gap-3">
              <span className="font-['IBM_Plex_Mono',monospace] text-xs text-[#64748B]">
                {selectedCount > 0 ? `${selectedCount}টি নির্বাচিত` : "কোনোটি নির্বাচিত নয়"}
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="py-2.5 px-5 font-semibold transition-all rounded-xl border-[1.5px] border-[#E2E8F0] text-[#64748B] font-['IBM_Plex_Mono',monospace] text-xs hover:bg-[#F1F5F9]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || selectedCount === 0}
                  className="py-2.5 px-5 flex items-center justify-center gap-2 font-semibold transition-all rounded-xl border-none text-white font-['IBM_Plex_Mono',monospace] text-xs"
                  style={{
                    background: saving || selectedCount === 0 ? C.muted : "linear-gradient(135deg,#0D9488,#0F766E)",
                    cursor: saving || selectedCount === 0 ? "not-allowed" : "pointer",
                    boxShadow: saving || selectedCount === 0 ? "none" : "0 4px 14px rgba(13,148,136,0.4)",
                  }}
                >
                  {saving ? (
                    <span className="animate-spin inline-block w-[14px] h-[14px] rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <Plus className="w-[13px] h-[13px]" />
                  )}
                  {selectedCount > 0 ? `${selectedCount}টি টেস্ট যোগ করুন` : "যোগ করুন"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// Small reusable components
// ══════════════════════════════════════════════════════════════════════════════
const ActionChip = ({ onClick, icon: Icon, label, color }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 transition-all font-semibold px-3 py-[5px] rounded-lg font-['IBM_Plex_Mono',monospace] text-[11px]"
    style={{ border: `1.5px solid ${color}25`, color, background: `${color}08` }}
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

const Avatar = ({ name }) => {
  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <div className="w-10 h-10 flex items-center justify-center shrink-0 text-[14px] font-bold rounded-[9px] font-['IBM_Plex_Mono',monospace] bg-[#0D948815] text-[#0D9488]">
      {initial}
    </div>
  );
};

// Compact amount chip shown right beside the test name — visible without
// expanding the card. Price uses teal when set / amber "বাকি" when not;
// commission uses the Coins icon (never Percent) since it's a flat ৳
// amount, not a rate — and always shows the value, including ৳0.
const AmountChip = ({ icon: Icon, amount, set, unsetLabel, color }) => (
  <span
    className="shrink-0 inline-flex items-center gap-1 px-1.5 py-[2px] rounded-[6px] font-['IBM_Plex_Mono',monospace] text-[10px] font-bold"
    style={{
      color: set ? color : C.amber,
      background: set ? `${color}0C` : `${C.amber}0C`,
      border: `1px solid ${set ? color : C.amber}25`,
    }}
  >
    <Icon className="w-2.5 h-2.5" />
    {set ? `৳${amount.toLocaleString("en-IN")}` : unsetLabel}
  </span>
);

const TestCard = ({ test, onConfigurePrice, onConfigureCommission, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  // Configured === price set. Commission ৳0 is valid and does not downgrade
  // the badge.
  const statusGrad = test.isConfigured
    ? "linear-gradient(135deg,#10B981,#059669)"
    : "linear-gradient(135deg,#F59E0B,#D97706)";
  const statusShadow = test.isConfigured ? "shadow-[0_3px_8px_#10B98130]" : "shadow-[0_3px_8px_#F59E0B30]";

  return (
    <div
      className="bg-white border border-[#E2E8F0] rounded-[14px] transition-shadow"
      style={{ boxShadow: expanded ? "0 4px 14px rgba(15,23,42,0.08)" : "0 1px 2px rgba(15,23,42,0.03)" }}
    >
      <button onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar name={test.name} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-['IBM_Plex_Sans',sans-serif] text-sm font-semibold text-[#0F172A] truncate">
                {test.name}
              </span>
              <AmountChip
                icon={Banknote}
                amount={test.price}
                set={test.hasPrice}
                unsetLabel="মূল্য বাকি"
                color={C.teal}
              />
              <AmountChip icon={Coins} amount={test.commission} set={true} unsetLabel="" color={C.purple} />
            </div>
            <p className="font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#94A3B8] mt-0.5 truncate">
              {test.categoryName}
            </p>
          </div>

          <span
            className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-[20px] text-white font-['IBM_Plex_Mono',monospace] text-[10px] font-bold ${statusShadow}`}
            style={{ background: statusGrad }}
          >
            {test.isConfigured ? (
              <CheckCircle2 className="w-[10px] h-[10px]" />
            ) : (
              <AlertTriangle className="w-[10px] h-[10px]" />
            )}
            {test.isConfigured ? "কনফিগার্ড" : "মূল্য বাকি"}
          </span>

          <ChevronDown
            className={`w-[15px] h-[15px] text-[#94A3B8] transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#E2E8F0]">
          <div className="pt-3.5 space-y-3.5">
            <div className="font-['IBM_Plex_Mono',monospace] text-xs text-[#64748B] leading-loose flex flex-wrap gap-x-4 gap-y-1">
              <span>
                মূল্য:{" "}
                <span className={test.hasPrice ? "font-bold text-[#0D9488]" : "font-bold text-[#F59E0B]"}>
                  {test.hasPrice ? `৳${test.price.toLocaleString("en-IN")}` : "নির্ধারিত নয়"}
                </span>
              </span>
              <span>
                কমিশন:{" "}
                <span className={test.hasCommission ? "font-bold text-[#8B5CF6]" : "font-bold text-[#64748B]"}>
                  ৳{test.commission.toLocaleString("en-IN")}
                </span>
              </span>
            </div>
            {!test.hasPrice && (
              <p className="font-['IBM_Plex_Mono',monospace] text-[10.5px] text-[#F59E0B] flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                এই টেস্টের মূল্য এখনো নির্ধারিত হয়নি
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <ActionChip onClick={onConfigurePrice} icon={Banknote} label="Change Price" color={C.blue} />
              <ActionChip onClick={onConfigureCommission} icon={Coins} label="Change Commission" color={C.purple} />
              <ActionChip onClick={onDelete} icon={Trash2} label="Delete" color={C.red} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, color, grad, icon: Icon }) => (
  <div className="bg-white relative overflow-hidden border border-[#E2E8F0] rounded-2xl p-[14px_16px] shadow-[0_2px_8px_rgba(15,23,42,0.05)] h-full">
    <div className="absolute top-0 right-0 w-16 h-16 opacity-5 rounded-[0_16px_0_100%]" style={{ background: grad }} />
    <div className="flex items-center gap-2 mb-2">
      <div
        className="flex items-center justify-center w-[26px] h-[26px] rounded-lg shrink-0"
        style={{ background: grad, boxShadow: `0 3px 8px ${color}30` }}
      >
        <Icon className="w-[13px] h-[13px] text-white" />
      </div>
      <p className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.06em] text-[#94A3B8] leading-tight">
        {label}
      </p>
    </div>
    <p className="font-['IBM_Plex_Mono',monospace] text-[26px] font-extrabold leading-none" style={{ color }}>
      {value}
    </p>
  </div>
);

const Skeleton = () => (
  <div className="space-y-2">
    {[1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className="flex items-center gap-3 px-4 py-3.5 bg-white border border-[#E2E8F0] rounded-[14px] animate-pulse"
      >
        <div className="w-10 h-10 bg-[#E2E8F0] rounded-[9px] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-2/5 bg-[#E2E8F0] rounded-md" />
          <div className="h-2.5 w-3/5 bg-[#EEF2FF] rounded-md" />
        </div>
        <div className="w-[65px] h-[26px] bg-[#E2E8F0] rounded-[20px]" />
      </div>
    ))}
  </div>
);

const SectionDivider = ({ title, count }) => (
  <div className="flex items-center gap-2 pt-1 pb-1">
    <span className="font-['IBM_Plex_Mono',monospace] text-[9px] font-bold uppercase tracking-[0.1em] text-[#0D9488]">
      {title}
    </span>
    <span
      className="font-['IBM_Plex_Mono',monospace] text-[10px] font-bold px-1.5 py-px rounded-[5px] text-[#0D9488]"
      style={{ background: "#0D948812", border: "1px solid #0D948825" }}
    >
      {count}
    </span>
    <div className="flex-1 h-px bg-[#0D948820]" />
  </div>
);

const FilterDropdown = ({ value, onChange, options }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`appearance-none outline-none cursor-pointer transition-all font-['IBM_Plex_Mono',monospace] text-xs rounded-[10px] py-[7px] pl-3 pr-[30px] border-[1.5px]
        ${value !== "all" ? "border-[#0D948860] bg-[#0D948808] text-[#0F172A] shadow-[0_2px_8px_#0D948815]" : "border-[#E2E8F0] bg-white text-[#64748B]"}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="w-3 h-3 text-[#94A3B8] absolute right-[9px] top-1/2 -translate-y-1/2 pointer-events-none" />
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
// Main Page — ManageTests
// ══════════════════════════════════════════════════════════════════════════════
const ManageTests = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  // ─── Frontend permission check ─────────────────────────────────────────
  const hasAccess = isAdmin || user?.permissions?.manageTests === true;
  if (!hasAccess) {
    return <Popup type="denied" message="টেস্ট ব্যবস্থাপনা দেখার অনুমতি আপনার নেই।" onClose={() => navigate("/")} />;
  }

  const [tests, setTests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [priceTest, setPriceTest] = useState(null);
  const [commissionTest, setCommissionTest] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [configFilter, setConfigFilter] = useState("all");

  const loadAll = async () => {
    try {
      const [testsRes, catsRes] = await Promise.all([testService.getTestList(), testService.getCategories()]);
      setTests(Array.isArray(testsRes?.data) ? testsRes.data : []);
      setCategories(Array.isArray(catsRes?.data) ? catsRes.data : []);
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        const message = getErrorMessage(err, "টেস্ট লোড করতে ব্যর্থ।");
        setError(message);
        setTests([]);
        setCategories([]);
        if (err?.response?.status === 403) setPopup({ type: "error", message });
      }
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.filter((c) => c._id).map((c) => [c._id, c.name])),
    [categories],
  );

  // isConfigured tracks price only — commission ৳0 is a deliberate value, not
  // a gap. zeroCommission is surfaced separately (stat card, filter).
  const enrichedTests = useMemo(
    () =>
      tests.map((t) => {
        const price = Number(t.price) || 0;
        const commission = Number(t.commission) || 0;
        const hasPrice = price > 0;
        const hasCommission = commission > 0;
        return {
          ...t,
          price,
          commission,
          categoryId: t.categoryId || UNCATEGORIZED_ID,
          categoryName: t.categoryId && categoryMap[t.categoryId] ? categoryMap[t.categoryId] : "Uncategorized",
          hasPrice,
          hasCommission,
          zeroCommission: !hasCommission,
          isConfigured: hasPrice,
        };
      }),
    [tests, categoryMap],
  );

  const stats = useMemo(
    () => ({
      total: enrichedTests.length,
      priceSet: enrichedTests.filter((t) => t.hasPrice).length,
      priceUnset: enrichedTests.filter((t) => !t.hasPrice).length,
      commissionSet: enrichedTests.filter((t) => t.hasCommission).length,
      commissionZero: enrichedTests.filter((t) => t.zeroCommission).length,
    }),
    [enrichedTests],
  );

  const filtered = useMemo(() => {
    const byConfig = {
      priceSet: (t) => t.hasPrice,
      priceUnset: (t) => !t.hasPrice,
      commissionSet: (t) => t.hasCommission,
      commissionZero: (t) => t.zeroCommission,
    };
    const predicate = byConfig[configFilter] ?? (() => true);
    return enrichedTests.filter(predicate).filter((t) => matchesSearch(t.name, search));
  }, [enrichedTests, configFilter, search]);

  const groups = useMemo(() => {
    const groupsMap = {};
    filtered.forEach((test) => {
      if (!groupsMap[test.categoryId]) {
        groupsMap[test.categoryId] = { categoryId: test.categoryId, categoryName: test.categoryName, tests: [] };
      }
      groupsMap[test.categoryId].tests.push(test);
    });
    return Object.values(groupsMap).sort((a, b) => {
      if (a.categoryName === "Uncategorized") return 1;
      if (b.categoryName === "Uncategorized") return -1;
      return a.categoryName.localeCompare(b.categoryName);
    });
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await testService.deleteTest(deleteTarget._id);
      setTests((prev) => prev.filter((t) => t._id !== deleteTarget._id));
      setPopup({ type: "success", message: "টেস্ট মুছে ফেলা হয়েছে।" });
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        if (getErrorStatus(err) === 404) {
          setTests((prev) => prev.filter((t) => t._id !== deleteTarget._id));
        }
        setPopup({ type: "error", message: getErrorMessage(err, "টেস্ট মুছতে ব্যর্থ।") });
      }
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleNetworkError = () => setOfflinePopup(true);

  const handlePriceSave = (updatedTest) => {
    if (updatedTest.__notFound) {
      setTests((prev) => prev.filter((t) => t._id !== updatedTest._id));
      setPriceTest(null);
      setPopup({ type: "error", message: "টেস্টটি আর পাওয়া যায়নি।" });
      return;
    }
    setTests((prev) => prev.map((t) => (t._id === updatedTest._id ? { ...t, ...updatedTest } : t)));
    setPriceTest(null);
    setPopup({ type: "success", message: "মূল্য সংরক্ষিত।" });
  };

  const handleCommissionSave = (updatedTest) => {
    if (updatedTest.__notFound) {
      setTests((prev) => prev.filter((t) => t._id !== updatedTest._id));
      setCommissionTest(null);
      setPopup({ type: "error", message: "টেস্টটি আর পাওয়া যায়নি।" });
      return;
    }
    setTests((prev) => prev.map((t) => (t._id === updatedTest._id ? { ...t, ...updatedTest } : t)));
    setCommissionTest(null);
    setPopup({ type: "success", message: "কমিশন সংরক্ষিত।" });
  };

  const handleAdded = async (added) => {
    setAddModal(false);
    await loadAll();
    setPopup({ type: "success", message: `${added.length}টি টেস্ট যোগ করা হয়েছে।` });
  };

  const hasFilters = search !== "" || configFilter !== "all";

  return (
    <section className={`min-h-screen px-4 py-6 ${pageGradientBg} font-[Noto_Sans_Bengali,sans-serif]`}>
      {popup && <Popup type={popup.type} message={popup.message} onClose={() => setPopup(null)} />}
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      {addModal && (
        <AddTestModal
          existingTests={tests}
          onClose={() => setAddModal(false)}
          onSaved={handleAdded}
          onNetworkError={handleNetworkError}
        />
      )}

      {priceTest && (
        <AmountModal
          field="price"
          test={priceTest}
          onClose={() => setPriceTest(null)}
          onSave={handlePriceSave}
          onNetworkError={handleNetworkError}
        />
      )}

      {commissionTest && (
        <AmountModal
          field="commission"
          test={commissionTest}
          onClose={() => setCommissionTest(null)}
          onSave={handleCommissionSave}
          onNetworkError={handleNetworkError}
        />
      )}

      {deleteTarget && (
        <Popup
          type="warning"
          message={`"${deleteTarget.name}" ডিলিট করে দিতে চান?`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <div className="max-w-2xl mx-auto">
        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl shadow-md"
              style={{
                background: "linear-gradient(135deg,#0D9488,#0F766E)",
                boxShadow: "0 4px 10px #0D948835",
              }}
            >
              <FlaskConical className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <h1 className="font-['IBM_Plex_Sans',sans-serif] text-[22px] font-bold text-[#0F172A] leading-tight">
                টেস্ট ব্যবস্থাপনা
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/setup"
              aria-label="Back"
              className="flex items-center justify-center w-9 h-9 shrink-0 transition-all border-[1.5px] border-[#E2E8F0] rounded-xl text-[#64748B] bg-white hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            >
              <ArrowLeft className="w-[15px] h-[15px]" />
            </Link>
            <button
              onClick={() => setAddModal(true)}
              className="flex items-center gap-1.5 transition-all font-semibold px-4 py-2 rounded-xl text-white font-['IBM_Plex_Mono',monospace] text-xs border-none shadow-[0_4px_14px_rgba(13,148,136,0.4)] hover:shadow-[0_6px_20px_rgba(13,148,136,0.5)]"
              style={{ background: "linear-gradient(135deg,#0D9488,#0F766E)" }}
            >
              <Plus className="w-[13px] h-[13px]" /> নতুন টেস্ট
            </button>
          </div>
        </div>

        {/* Stats — mobile: 6-col grid, cards span 2 (row 1, thirds) then 3 (row 2, halves);
            sm+: collapses to a single row of 5 equal columns */}
        {!initialLoading && (
          <div className="grid grid-cols-6 sm:grid-cols-5 gap-3 mb-5">
            <div className="col-span-2 sm:col-span-1">
              <StatCard
                label="Total"
                value={stats.total}
                color={C.teal}
                grad="linear-gradient(135deg,#0D9488,#0F766E)"
                icon={FlaskConical}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <StatCard
                label="মূল্য সেট"
                value={stats.priceSet}
                color={C.green}
                grad="linear-gradient(135deg,#10B981,#059669)"
                icon={CheckCircle2}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <StatCard
                label="মূল্য বাকি"
                value={stats.priceUnset}
                color={C.amber}
                grad="linear-gradient(135deg,#F59E0B,#D97706)"
                icon={AlertTriangle}
              />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <StatCard
                label="কমিশন সেট"
                value={stats.commissionSet}
                color={C.purple}
                grad="linear-gradient(135deg,#8B5CF6,#7C3AED)"
                icon={Coins}
              />
            </div>
            <div className="col-span-3 sm:col-span-1">
              <StatCard
                label="শূন্য কমিশন"
                value={stats.commissionZero}
                color={C.sub}
                grad="linear-gradient(135deg,#94A3B8,#64748B)"
                icon={CircleSlash}
              />
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 mb-4 bg-white border border-[#E2E8F0] rounded-2xl">
          <div className="relative flex-[1_1_160px]">
            <Search className="w-[13px] h-[13px] text-[#94A3B8] absolute left-[11px] top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="টেস্টের নাম খুঁজুন…"
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
          <FilterDropdown value={configFilter} onChange={setConfigFilter} options={CONFIG_OPTIONS} />
          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setConfigFilter("all");
              }}
              className="flex items-center gap-1.5 transition-all font-semibold py-[7px] px-3 border-[1.5px] border-[#EF444430] rounded-[10px] text-[#EF4444] font-['IBM_Plex_Mono',monospace] text-[11px] bg-[#EF444406] hover:bg-[#EF444412]"
            >
              <RotateCcw className="w-3 h-3" /> রিসেট
            </button>
          )}
        </div>

        {/* Test cards */}
        {initialLoading ? (
          <Skeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#94A3B8] bg-white border border-[#E2E8F0] rounded-2xl">
            <AlertCircle className="w-7 h-7 opacity-40" />
            <p className="font-['IBM_Plex_Mono',monospace] text-xs text-[#EF4444]">{error}</p>
            <button
              onClick={() => {
                setInitialLoading(true);
                setError("");
                loadAll();
              }}
              className="font-['IBM_Plex_Mono',monospace] text-xs text-[#0D9488] underline"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-[#94A3B8] bg-white border border-[#E2E8F0] rounded-2xl">
            <AlertCircle className="w-7 h-7 opacity-40" />
            <p className="font-['IBM_Plex_Mono',monospace] text-xs">
              {hasFilters ? "কোনো টেস্ট পাওয়া যায়নি" : "এখনো কোনো টেস্ট যোগ করা হয়নি"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.categoryId}>
                <SectionDivider title={group.categoryName} count={group.tests.length} />
                <div className="space-y-2">
                  {group.tests.map((test) => (
                    <TestCard
                      key={test._id}
                      test={test}
                      onConfigurePrice={() => setPriceTest(test)}
                      onConfigureCommission={() => setCommissionTest(test)}
                      onDelete={() => setDeleteTarget(test)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        <p className="font-['IBM_Plex_Mono',monospace] text-[10px] text-[#94A3B8] mt-4 text-center">
          * শুধুমাত্র সক্রিয় টেস্টের তথ্য অন্তর্ভুক্ত
        </p>
      </div>
    </section>
  );
};

export default ManageTests;
