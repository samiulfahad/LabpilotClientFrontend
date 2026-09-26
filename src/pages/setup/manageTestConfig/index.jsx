/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 *
 * ── Layout ───────────────────────────────────────────────────────────────
 * One list, everything editable in place — no page to enter and come back
 * from. Tests are grouped in a card per category (with its default room).
 * Each test row has:
 *   - a status icon: Wifi (green) = format attached / online,
 *     WifiOff (gray) = offline. A green dot badge on it means at least one
 *     report format is available for the test.
 *   - a blinking amber badge beside the name when formats are available but
 *     none is selected yet.
 *   - its sample collection room, editable inline (click → type → Enter)
 *   - a note saying whether the test has report formats (none / N available /
 *     one attached). Tests with no format get no format or range buttons.
 *   - a "ফরম্যাট" button → modal: pick / clear the report format, and peek at
 *     the reference ranges of every available format. A successful save or
 *     "make offline" updates the list, closes the modal and shows a success
 *     popup that this page auto-closes (the Popup component is untouched).
 *   - a "রেঞ্জ" button → the same modal on the ranges tab: edit the values
 *     and units used in this lab's reports (needs an attached format)
 *   - inside the format modal, each schema option is its own card: a header
 *     row to select it, and a footer row split into two clear actions —
 *     "ডেমো প্রিভিউ" (opens a demo report overlay with sample data — view/
 *     print/download only, no upload/edit) and "রেঞ্জ দেখুন" (expands the
 *     reference-range peek inline). Keeping these on their own row avoids
 *     stacking three tap targets on one line on narrow screens.
 *     The demo overlay is rendered as local overlay state on THIS page (not
 *     a route), so closing it never refetches or resets the list.
 *
 * Data rules:
 * - A sample collection room is a short label (e.g. "204") stored on a test
 *   as `sampleCollectionRoom`. A category's default room is persisted per lab
 *   (`categoryRoomDefaults`) and combined into each test's
 *   `effectiveCollectionRoom` (own room, else category default, else null).
 * - Reference range / unit overrides live in <RangeOverridesPanel/> and are
 *   stored on the test at `test.schema.overrides`.
 * - Changing (or clearing) a test's format wipes its overrides. The server
 *   does the wipe; the UI asks for confirmation first when any exist.
 *
 * ── Design ───────────────────────────────────────────────────────────────
 * Matches the Setup.jsx module-grid language: a soft indigo-tinted radial
 * gradient page background, white rounded-2xl cards with a hairline border
 * and a shadow that lifts on hover, a teal gradient icon badge for the page
 * header (this module's color in Setup's grid), and a short fade/slide-in
 * on first paint.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  X,
  Loader2,
  ChevronDown,
  Pencil,
  FileText,
  DoorOpen,
  Ruler,
  FlaskConical,
  Wifi,
  WifiOff,
  AlertTriangle,
  Eye,
} from "lucide-react";
import testConfigService from "../../../api/testConfig";
import Popup from "../../../components/popup";
import RangeOverridesPanel, { RangeSummary, RefSummary, applyOverrides, idOf } from "./RangeOverridesPanel";
import ReportDemoView from "../../reportDownload/ReportDemoView";

// ─── shared helpers ──────────────────────────────────────────────────────────

const SUCCESS_AUTO_CLOSE_MS = 2000; // how long the success popup stays up

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";
const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};
const getErrorStatus = (err) => err?.response?.status ?? err?.status ?? null;
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;
const NO_INTERNET = "ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করুন।";

// Search ignores ANY punctuation/symbol, in any script, so "platelet count",
// "platelet-count" and "platelet, count" all match "Platelet Count".
const strip = (str) => (str ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const matchesSearch = (name, query) => {
  const q = strip(query);
  return q === "" || strip(name).includes(q);
};

// Field types that carry a reference range / value + unit.
const PREVIEW_TYPES = ["number", "input", "textarea"];
const countFields = (schema) =>
  (schema.sections ?? []).reduce(
    (n, s) => n + (s.fields ?? []).filter((f) => PREVIEW_TYPES.includes(f.type)).length,
    0,
  );

// Overrides made on the currently attached format (drives the "রেঞ্জ" badge).
const activeOverrideCount = (test) =>
  (test.schema?.overrides ?? []).filter((o) => String(o.schemaId) === String(test.schemaId)).length;

// Every stored override, whatever format it was made on — this is what a
// format change wipes, so it's what the confirmation reports.
const totalOverrideCount = (test) => test.schema?.overrides?.length ?? 0;

// ─── design tokens ────────────────────────────────────────────────────────────
// Same family as Setup.jsx's "teal" module color, applied consistently here
// since this whole page IS that module.

const pageBg = "bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,#eef2ff_0%,#f8fafc_45%,#f8fafc_100%)]";
const cardCls = "rounded-2xl bg-white border border-slate-200 shadow-sm";
const cardHoverCls = "transition-shadow duration-200 hover:shadow-md";
const focusRing =
  "outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-400";

const Spinner = ({ label }) => (
  <div className="flex items-center gap-2 py-2">
    <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
    <span className="text-[13px] text-slate-400">{label}</span>
  </div>
);

const ErrorLine = ({ children }) => (
  <p className="text-[13px] rounded-xl px-3 py-2 bg-rose-50 text-rose-600 border border-rose-100" role="alert">
    {children}
  </p>
);

const Pill = ({ icon: Icon, children, tone = "soft" }) => {
  const toneCls =
    tone === "accent"
      ? "bg-teal-600 text-white"
      : tone === "green"
        ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
        : tone === "plain"
          ? "bg-slate-100 text-slate-500"
          : "bg-teal-50 text-teal-700 border border-teal-100";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[12px] rounded-full px-2.5 py-0.5 whitespace-nowrap ${toneCls}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
};

const StatusPill = ({ online }) => (
  <Pill icon={online ? Wifi : WifiOff} tone={online ? "green" : "plain"}>
    {online ? "অনলাইন" : "অফলাইন"}
  </Pill>
);

// Blinking "formats available, none selected" badge. Pulse + ping are turned
// off for users who prefer reduced motion.
const PendingBadge = () => (
  <span
    role="status"
    title="ফরম্যাট আছে, কিন্তু এখনো Select করা হয়নি"
    className="inline-flex items-center gap-1.5 text-[11.5px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap bg-amber-50 text-amber-700 animate-pulse motion-reduce:animate-none"
  >
    <span className="relative flex w-2 h-2">
      <span className="absolute inline-flex w-full h-full rounded-full bg-amber-400 opacity-75 animate-ping motion-reduce:animate-none" />
      <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-500" />
    </span>
    Format Available
  </span>
);

const PrimaryButton = ({ children, disabled, ...rest }) => (
  <button
    type="button"
    disabled={disabled}
    className={`${focusRing} text-[13px] font-semibold text-white rounded-xl px-4 py-2.5 transition-all ${
      disabled
        ? "bg-slate-300 cursor-not-allowed"
        : "bg-gradient-to-br from-teal-500 to-teal-600 shadow hover:shadow-md hover:-translate-y-px"
    }`}
    {...rest}
  >
    {children}
  </button>
);

const GhostButton = ({ children, tone, ...rest }) => (
  <button
    type="button"
    className={`${focusRing} text-[13px] font-medium rounded-xl px-4 py-2.5 bg-white border transition-colors disabled:opacity-50 ${
      tone === "danger"
        ? "border-rose-200 text-rose-600 hover:bg-rose-50"
        : "border-slate-200 text-slate-700 hover:bg-slate-50"
    }`}
    {...rest}
  >
    {children}
  </button>
);

const DangerButton = ({ children, ...rest }) => (
  <button
    type="button"
    className={`${focusRing} text-[13px] font-semibold text-white rounded-xl px-4 py-2.5 bg-rose-600 hover:bg-rose-700 transition-colors`}
    {...rest}
  >
    {children}
  </button>
);

// Small inline "[input] [save] [cancel]" editor, used for a category's default
// room and for a test's own room.
const RoomInlineEditor = ({ initialValue, saving, onSave, onCancel, placeholder }) => {
  const [value, setValue] = useState(initialValue ?? "");
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(value.trim() || null);
          if (e.key === "Escape") onCancel();
        }}
        className="text-[13px] px-2.5 py-1.5 w-24 rounded-lg outline-none border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-teal-100"
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(value.trim() || null)}
        className={`${focusRing} text-[12px] font-semibold text-white rounded-lg px-3 py-1.5 ${
          saving ? "bg-slate-300" : "bg-teal-600 hover:bg-teal-700"
        }`}
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className={`${focusRing} text-[12px] px-1.5 py-1 rounded text-slate-400 hover:text-slate-600`}
      >
        বাতিল
      </button>
    </div>
  );
};

// ─── modal shell ─────────────────────────────────────────────────────────────

const Modal = ({ onClose, labelledBy, children, zIndex = 50, widthCls = "sm:max-w-2xl" }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Rendered into <body> via a portal so no parent's overflow, transform or
  // z-index can clip or stack over it.
  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6 bg-slate-900/50"
      style={{ zIndex }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`bg-white w-full ${widthCls} max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl border border-slate-200 animate-[modalIn_0.2s_ease-out_both]`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

// Asks before a format change wipes the test's custom ranges/units.
const ConfirmOverrideWipeModal = ({ count, action, onCancel, onConfirm }) => (
  <Modal onClose={onCancel} labelledBy="confirm-wipe-title" zIndex={60} widthCls="sm:max-w-md">
    <div className="px-5 pt-5 pb-2 sm:px-6 flex items-start gap-3">
      <span className="w-9 h-9 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-5 h-5 text-rose-600" />
      </span>
      <div className="min-w-0">
        <h3 id="confirm-wipe-title" className="text-[16px] leading-snug font-semibold text-slate-900">
          পুরনো কাস্টম রেঞ্জ মুছে যাবে
        </h3>
        <p className="text-[13.5px] leading-relaxed mt-1.5 text-slate-500">
          এই টেস্টে {count}টি কাস্টম রেফারেন্স রেঞ্জ/ইউনিট আছে।{" "}
          {action === "offline" ? "অফলাইন করলে" : "ফরম্যাট বদলালে"} এগুলো স্থায়ীভাবে মুছে যাবে
          {action === "offline" ? "।" : " এবং নতুন ফরম্যাটের ডিফল্ট মান ব্যবহার হবে।"}।
        </p>
      </div>
    </div>
    <div className="flex items-center justify-end gap-2 flex-wrap px-5 py-4 sm:px-6">
      <GhostButton onClick={onCancel}>বাতিল</GhostButton>
      <DangerButton onClick={onConfirm}>
        {action === "offline" ? "মুছে অফলাইন করুন" : "মুছে পরিবর্তন করুন"}
      </DangerButton>
    </div>
  </Modal>
);

// Read-only peek at a format's reference ranges / values / units.
const FormatPreview = ({ schema }) => {
  const rows = (schema.sections ?? [])
    .map((sec) => ({ sec, fields: (sec.fields ?? []).filter((f) => PREVIEW_TYPES.includes(f.type)) }))
    .filter((s) => s.fields.length > 0);

  if (rows.length === 0) return <p className="text-[13px] text-slate-400">এই ফরম্যাটে কোনো রেফারেন্স রেঞ্জ নেই।</p>;

  return (
    <div className="space-y-3">
      {rows.map(({ sec, fields }) => (
        <div key={idOf(sec) || sec.name}>
          <p className="text-[12.5px] font-semibold mb-1 text-slate-800">{sec.name}</p>
          {fields.map((f) => (
            <div
              key={idOf(f) || f.name}
              className="flex gap-3 py-2 text-[12.5px] border-t border-slate-100 text-slate-700"
            >
              <span className="w-32 sm:w-40 shrink-0 font-medium">{f.name}</span>
              <div className="flex-1 min-w-0">
                {f.type === "number" ? (
                  <RangeSummary range={f.standardRange} />
                ) : (
                  <RefSummary refValue={f.referenceValue} />
                )}
              </div>
              <span className="shrink-0 text-slate-400">{f.unit || ""}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ─── schema picker card ───────────────────────────────────────────────────────
// One schema = one card, two clearly separated rows:
//   header  → tap anywhere to select this format
//   footer  → "ডেমো প্রিভিউ" and "রেঞ্জ দেখুন", side by side, each its own
//             tap target — so the header never has to carry three actions
//             at once (the old crowding on narrow screens).
const SchemaCard = ({ schema, test, selected, isCurrent, rangesOpen, onSelect, onToggleRanges, onOpenDemo }) => {
  // For the format this test already uses, show the lab's own saved values.
  const shown = schema._id === test.schemaId ? applyOverrides(schema, test.schema?.overrides) : schema;

  return (
    <div
      className={`rounded-2xl overflow-hidden transition-all ${
        selected ? "bg-teal-50 border-2 border-teal-400 shadow-sm" : "bg-white border border-slate-200"
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className={`${focusRing} w-full flex items-center gap-3 text-left px-4 py-3.5`}
      >
        <span
          className={`w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center border-2 ${
            selected ? "border-teal-500" : "border-slate-300"
          }`}
        >
          {selected && <span className="w-2 h-2 rounded-full bg-teal-500" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[14px] ${selected ? "text-teal-800 font-semibold" : "text-slate-800"}`}>
            {schema.description || "নামহীন ফরম্যাট"}
          </span>
          <span className="block text-[12px] text-slate-400">{countFields(schema)}টি ফিল্ডে রেঞ্জ/মান</span>
        </span>
        {isCurrent && <Pill tone="green">বর্তমান</Pill>}
      </button>

      <div className="flex items-stretch border-t border-slate-100">
        <button
          type="button"
          onClick={onOpenDemo}
          title="ডেমো রিপোর্ট দেখুন — শুধু দেখা, ছাপানো ও ডাউনলোড করা যাবে"
          className={`${focusRing} flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-medium py-2.5 text-teal-700 hover:bg-teal-50/60 transition-colors`}
        >
          <Eye className="w-3.5 h-3.5" />
          ডেমো প্রিভিউ
        </button>
        <span className="w-px bg-slate-100" />
        <button
          type="button"
          onClick={onToggleRanges}
          aria-expanded={rangesOpen}
          className={`${focusRing} flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-medium py-2.5 text-slate-500 hover:bg-slate-50 transition-colors`}
        >
          রেঞ্জ দেখুন
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${rangesOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {rangesOpen && (
        <div className="px-4 pb-4 pt-3 bg-white border-t border-slate-100">
          <FormatPreview schema={shown} />
        </div>
      )}
    </div>
  );
};

// ─── format + ranges modal ───────────────────────────────────────────────────

const FormatRangesModal = ({
  test,
  category,
  initialTab,
  onClose,
  onSaved,
  onSuccess,
  onNetworkError,
  onOpenDemoPreview,
}) => {
  const [tab, setTab] = useState(initialTab);

  const [schemas, setSchemas] = useState([]);
  const [selectedSchemaId, setSelectedSchemaId] = useState(test.schemaId ?? null);
  const [previewId, setPreviewId] = useState(null);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [schemaError, setSchemaError] = useState(null);
  const [savingSchema, setSavingSchema] = useState(false);
  const [schemaApiError, setSchemaApiError] = useState("");
  const [makingOffline, setMakingOffline] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // null | "save" | "offline"

  const selectSchema = (schemaId) => setSelectedSchemaId(schemaId);

  // Opens the demo report preview overlay for this schema — handled by the
  // parent page (TestConfigPage) so it renders as a sibling overlay instead
  // of a route. Routing away would unmount TestConfigPage and force a
  // refetch of the whole test/category list on close.
  const openDemoPreview = (schema) => {
    onOpenDemoPreview?.({ schemaId: schema._id, testName: test.name });
  };

  const handleLoadError = (err, setter, fallback) => {
    if (isNetworkError(err)) {
      setter(NO_INTERNET);
      onNetworkError?.();
    } else {
      setter(getErrorMessage(err, fallback));
    }
  };

  useEffect(() => {
    if (!test.testId) return;
    (async () => {
      setLoadingSchemas(true);
      setSchemaError(null);
      try {
        const res = await testConfigService.getSchemasByTestId(test.testId);
        setSchemas(res.data ?? []);
      } catch (err) {
        handleLoadError(err, setSchemaError, "ফরম্যাট লোড করা যায়নি");
        setSchemas([]);
      } finally {
        setLoadingSchemas(false);
      }
    })();
  }, [test._id, test.testId]);

  // The server wipes `schema.overrides` when the format changes, so merge its
  // `schema` back too — otherwise the badge/panel would show stale overrides.
  const handleSaveSchema = async (schemaId) => {
    const res = await testConfigService.updateSchema(test._id, schemaId);
    onSaved?.({ ...test, schemaId: res.data.schemaId, schema: res.data.schema });
  };

  // On success the list is already updated (onSaved above): close this modal,
  // then let the page show the success popup.
  const handleSubmitSelection = async () => {
    setSavingSchema(true);
    setSchemaApiError("");
    try {
      await handleSaveSchema(selectedSchemaId);
      onClose();
      onSuccess?.("ফরম্যাট সফলভাবে Save করা হয়েছে।");
    } catch (err) {
      if (isNetworkError(err)) {
        setSchemaApiError(NO_INTERNET);
        onNetworkError?.();
      } else if (getErrorStatus(err) === 404) {
        onSaved?.({ ...test, __notFound: true });
        return;
      } else {
        setSchemaApiError(getErrorMessage(err, "Save করা যায়নি"));
      }
    } finally {
      setSavingSchema(false);
    }
  };

  const handleMakeOffline = async () => {
    setMakingOffline(true);
    setSchemaApiError("");
    try {
      await handleSaveSchema(null);
      onClose();
      onSuccess?.("টেস্টটি অফলাইন করা হয়েছে।");
    } catch (err) {
      if (isNetworkError(err)) {
        setSchemaApiError(NO_INTERNET);
        onNetworkError?.();
      } else if (getErrorStatus(err) === 404) {
        onSaved?.({ ...test, __notFound: true });
        return;
      } else {
        setSchemaApiError(getErrorMessage(err, "অফলাইন করা যায়নি।"));
      }
    } finally {
      setMakingOffline(false);
    }
  };

  // Gate both actions: if the format is really changing and the test has
  // custom ranges, confirm before anything is sent.
  const overrideTotal = totalOverrideCount(test);
  const formatChanging = selectedSchemaId !== (test.schemaId ?? null);

  const requestSave = () => {
    if (formatChanging && overrideTotal > 0) setConfirmAction("save");
    else handleSubmitSelection();
  };

  const requestOffline = () => {
    if (overrideTotal > 0) setConfirmAction("offline");
    else handleMakeOffline();
  };

  const confirmWipe = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "save") handleSubmitSelection();
    else if (action === "offline") handleMakeOffline();
  };

  const isOnline = !!test.schemaId;
  const overrideCount = activeOverrideCount(test);
  const tabs = [
    { id: "format", label: "রিপোর্ট ফরম্যাট", icon: FileText },
    { id: "ranges", label: "রেফারেন্স রেঞ্জ", icon: Ruler },
  ];

  return (
    <>
      <Modal
        onClose={() => {
          // While the confirm dialog is up, Escape/backdrop must not close this one too.
          if (!confirmAction) onClose();
        }}
        labelledBy="fr-modal-title"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 sm:px-6 bg-slate-50/70 border-b border-slate-200">
          <div className="min-w-0">
            <h2 id="fr-modal-title" className="text-[19px] leading-snug font-bold text-slate-900">
              {test.name}
            </h2>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {category && <Pill tone="plain">{category.name}</Pill>}
              <StatusPill online={isOnline} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            className={`${focusRing} p-2 -mr-2 -mt-1 rounded-xl hover:bg-slate-100 transition-colors`}
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 px-3 sm:px-5 border-b border-slate-200" role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`${focusRing} flex items-center gap-2 px-3 py-3 text-[14px] whitespace-nowrap -mb-px border-b-2 transition-colors ${
                  active ? "border-teal-600 text-teal-700 font-semibold" : "border-transparent text-slate-400"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {id === "ranges" && overrideCount > 0 && (
                  <span
                    className="text-[11px] rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center bg-teal-50 text-teal-700"
                    title="পরিবর্তিত ফিল্ড"
                  >
                    {overrideCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6" role="tabpanel">
          {tab === "format" && (
            <div className="space-y-4">
              {loadingSchemas ? (
                <Spinner label="ফরম্যাট লোড হচ্ছে…" />
              ) : schemaError ? (
                <ErrorLine>{schemaError}</ErrorLine>
              ) : schemas.length === 0 ? (
                <p className="text-[14px] text-slate-400">এই টেস্টের জন্য কোনো ফরম্যাট তৈরি করা হয়নি।</p>
              ) : (
                <>
                  <p className="text-[13px] text-slate-400">
                    একটি ফরম্যাট Select করুন। নিচে “ডেমো প্রিভিউ” চাপলে রিপোর্টটি কেমন দেখাবে তা
                    দেখা যাবে, আর “রেঞ্জ দেখুন” চাপলে সেই ফরম্যাটের রেফারেন্স রেঞ্জ দেখা যাবে।
                  </p>
                  <div role="radiogroup" aria-label="রিপোর্ট ফরম্যাট" className="space-y-2">
                    {schemas.map((schema) => (
                      <SchemaCard
                        key={schema._id}
                        schema={schema}
                        test={test}
                        selected={selectedSchemaId === schema._id}
                        isCurrent={test.schemaId === schema._id}
                        rangesOpen={previewId === schema._id}
                        onSelect={() => selectSchema(schema._id)}
                        onToggleRanges={() => setPreviewId(previewId === schema._id ? null : schema._id)}
                        onOpenDemo={() => openDemoPreview(schema)}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap pt-1">
                    <PrimaryButton onClick={requestSave} disabled={savingSchema || makingOffline}>
                      {savingSchema ? "Save করা হচ্ছে…" : "Save করুন"}
                    </PrimaryButton>
                    <GhostButton
                      tone={selectedSchemaId === null ? undefined : "danger"}
                      onClick={requestOffline}
                      disabled={savingSchema || makingOffline || selectedSchemaId === null}
                    >
                      {makingOffline ? "অফলাইন করা হচ্ছে…" : "অফলাইন করুন"}
                    </GhostButton>
                  </div>
                  {schemaApiError && <ErrorLine>{schemaApiError}</ErrorLine>}
                </>
              )}
            </div>
          )}

          {tab === "ranges" && (
            <div>
              <p className="text-[13px] mb-4 leading-relaxed text-slate-500">
                রিপোর্টে এই ল্যাবের জন্য ব্যবহৃত মান ও ইউনিট। শুধু সংখ্যা, রেফারেন্স মান ও ইউনিট বদলানো যাবে।
              </p>
              <RangeOverridesPanel
                key={test.schemaId ?? "none"}
                test={test}
                onSaved={onSaved}
                onNetworkError={onNetworkError}
                hideTitle
              />
            </div>
          )}
        </div>
      </Modal>

      {confirmAction && (
        <ConfirmOverrideWipeModal
          count={overrideTotal}
          action={confirmAction}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmWipe}
        />
      )}
    </>
  );
};

// ─── list rows ───────────────────────────────────────────────────────────────

const TestRow = ({ test, categoryRoom, onOpen, onSaved, onNetworkError }) => {
  const [editingRoom, setEditingRoom] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);
  const [roomError, setRoomError] = useState("");

  const isOnline = !!test.schemaId;
  const ownRoom = test.sampleCollectionRoom ?? null;
  const inheritedRoom = ownRoom === null ? (categoryRoom ?? null) : null;
  const room = ownRoom ?? inheritedRoom;
  const overrideCount = activeOverrideCount(test);
  const formatCount = test.formatCount ?? 0;
  const hasFormats = isOnline || formatCount > 0;
  const needsPick = !isOnline && formatCount > 0; // formats available, none selected
  const formatNote = isOnline
    ? "ফরম্যাট সংযুক্ত আছে"
    : formatCount > 0
      ? `${formatCount}টি ফরম্যাট আছে — এখনো Select করা হয়নি`
      : "কোনো ফরম্যাট নেই";

  const handleSaveRoom = async (value) => {
    setSavingRoom(true);
    setRoomError("");
    try {
      const res = await testConfigService.updateCollectionRoom(test._id, value);
      setEditingRoom(false);
      onSaved?.({ ...test, sampleCollectionRoom: res.data.sampleCollectionRoom });
    } catch (err) {
      if (isNetworkError(err)) {
        setRoomError(NO_INTERNET);
        onNetworkError?.();
      } else if (getErrorStatus(err) === 404) {
        onSaved?.({ ...test, __notFound: true });
        return;
      } else {
        setRoomError(getErrorMessage(err, "Save করা যায়নি"));
      }
    } finally {
      setSavingRoom(false);
    }
  };

  const chipBtn = `${focusRing} inline-flex items-center gap-1.5 text-[13px] rounded-xl px-2.5 py-1.5 whitespace-nowrap transition-colors`;

  return (
    <li className="border-t border-slate-100">
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap px-4 py-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[170px]">
          {/* status: Wifi = online (format attached), WifiOff = offline.
              Green dot badge = a format is available for this test. */}
          <span
            className={`relative w-7 h-7 rounded-xl shrink-0 flex items-center justify-center ${
              isOnline ? "bg-emerald-50" : "bg-slate-100"
            }`}
            title={`${isOnline ? "অনলাইন" : "অফলাইন"} — ${formatNote}`}
          >
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-slate-400" />}
            {hasFormats && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"
                aria-hidden="true"
              />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className="text-[14.5px] text-slate-800">{test.name}</span>
              {needsPick && <PendingBadge />}
            </span>
            <span className={`block text-[12px] ${hasFormats ? "text-emerald-600" : "text-slate-400"}`}>
              {formatNote}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* room — click to edit in place */}
          {editingRoom ? (
            <RoomInlineEditor
              initialValue={ownRoom}
              saving={savingRoom}
              placeholder="যেমনঃ 204"
              onSave={handleSaveRoom}
              onCancel={() => setEditingRoom(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingRoom(true)}
              title={inheritedRoom ? "ক্যাটাগরির ডিফল্ট কক্ষ — পরিবর্তন করতে ক্লিক করুন" : "কক্ষ পরিবর্তন করুন"}
              className={`${chipBtn} ${
                room
                  ? "bg-teal-50 border border-teal-100 text-teal-700 hover:bg-teal-100"
                  : "bg-white border border-dashed border-slate-300 text-slate-400 hover:bg-slate-50"
              }`}
            >
              <DoorOpen className="w-3.5 h-3.5" />
              {room ? `কক্ষ ${room}` : "কক্ষ দিন"}
              {inheritedRoom && <span className="text-[11px] opacity-70">(ডিফল্ট)</span>}
              <Pencil className="w-3 h-3 opacity-60" />
            </button>
          )}

          {/* format + ranges: only for tests that have a format */}
          {hasFormats && (
            <>
              <button
                type="button"
                onClick={() => onOpen(test._id, "format")}
                className={`${chipBtn} ${
                  isOnline
                    ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                    : "bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {isOnline ? "ফরম্যাট" : "Select ফরম্যাট"}
              </button>

              {/* ranges */}
              <button
                type="button"
                disabled={!isOnline}
                onClick={() => onOpen(test._id, "ranges")}
                title={isOnline ? "রেফারেন্স রেঞ্জ দেখুন/পরিবর্তন করুন" : "আগে একটি ফরম্যাট Select করুন"}
                className={`${chipBtn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white`}
              >
                <Ruler className="w-3.5 h-3.5" />
                রেঞ্জ
                {overrideCount > 0 && (
                  <span
                    className="text-[11px] rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center bg-teal-50 text-teal-700"
                    title="পরিবর্তিত ফিল্ড"
                  >
                    {overrideCount}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
      {roomError && (
        <div className="px-4 pb-3">
          <ErrorLine>{roomError}</ErrorLine>
        </div>
      )}
    </li>
  );
};

const CategoryGroup = ({
  category,
  tests,
  categoryRoom,
  open,
  onToggle,
  onOpenTest,
  onTestSaved,
  onNetworkError,
  onSetCategoryRoom,
  animDelay,
}) => {
  const [editingRoom, setEditingRoom] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);
  const [roomApiError, setRoomApiError] = useState("");

  const handleSaveRoom = async (room) => {
    setSavingRoom(true);
    setRoomApiError("");
    try {
      await testConfigService.updateCategoryCollectionRoom(category._id, room);
      setEditingRoom(false);
      onSetCategoryRoom(category._id, room);
    } catch (err) {
      if (isNetworkError(err)) {
        setRoomApiError(NO_INTERNET);
        onNetworkError?.();
      } else {
        setRoomApiError(getErrorMessage(err, "Save করা যায়নি"));
      }
    } finally {
      setSavingRoom(false);
    }
  };

  return (
    <div
      style={{ animationDelay: `${animDelay}ms` }}
      className={`${cardCls} ${cardHoverCls} mb-4 overflow-hidden animate-[cardIn_0.35s_cubic-bezier(.22,1,.36,1)_both]`}
    >
      <div
        className={`flex items-center justify-between gap-x-4 gap-y-2 flex-wrap px-4 py-3 ${
          open ? "border-b border-slate-100" : ""
        } bg-slate-50/60 rounded-t-2xl`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`${focusRing} flex items-center gap-2 text-left rounded-lg`}
        >
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform text-teal-600 ${open ? "" : "-rotate-90"}`} />
          <span className="text-[15px] font-bold text-slate-800">{category.name}</span>
          <span className="text-[12px] rounded-full px-2 py-0.5 bg-white border border-slate-200 text-slate-400">
            {tests.length}
          </span>
        </button>

        {editingRoom ? (
          <RoomInlineEditor
            initialValue={categoryRoom}
            saving={savingRoom}
            placeholder="যেমনঃ 204"
            onSave={handleSaveRoom}
            onCancel={() => setEditingRoom(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingRoom(true)}
            title="ক্যাটাগরির ডিফল্ট কক্ষ পরিবর্তন করুন"
            className={`${focusRing} inline-flex items-center gap-1.5 text-[13px] rounded-lg ${
              categoryRoom ? "text-teal-700" : "text-slate-400"
            }`}
          >
            <DoorOpen className="w-4 h-4" />
            {categoryRoom ? `ডিফল্ট কক্ষ ${categoryRoom}` : "ডিফল্ট কক্ষ নির্ধারিত নয়"}
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {roomApiError && (
        <div className="px-4 pt-3">
          <ErrorLine>{roomApiError}</ErrorLine>
        </div>
      )}

      {open && (
        <ul>
          {tests.map((test) => (
            <TestRow
              key={test._id}
              test={test}
              categoryRoom={categoryRoom}
              onOpen={onOpenTest}
              onSaved={onTestSaved}
              onNetworkError={onNetworkError}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

// ─── page ────────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { id: "all", label: "সব", icon: null },
  { id: "online", label: "অনলাইন", icon: Wifi },
  { id: "offline", label: "অফলাইন", icon: WifiOff },
];

const TestConfigPage = () => {
  const [categories, setCategories] = useState([]);
  const [tests, setTests] = useState([]);
  const [categoryRooms, setCategoryRooms] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [collapsed, setCollapsed] = useState({});
  const [modal, setModal] = useState(null); // { testId, tab }
  const [demoPreview, setDemoPreview] = useState(null); // { schemaId, testName } | null
  const [offlinePopup, setOfflinePopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState(""); // non-empty = success popup showing

  const handleNetworkError = () => setOfflinePopup(true);

  useEffect(() => {
    (async () => {
      try {
        const [testsRes, categoriesRes, categoryRoomsRes] = await Promise.all([
          testConfigService.getTestList(),
          testConfigService.getCategories(),
          testConfigService.getCategoryRooms(),
        ]);
        setTests(Array.isArray(testsRes?.data) ? testsRes.data : []);
        setCategories(Array.isArray(categoriesRes?.data) ? categoriesRes.data : []);
        const map = {};
        for (const cr of categoryRoomsRes?.data ?? []) map[cr.categoryId] = cr.sampleCollectionRoom;
        setCategoryRooms(map);
      } catch (err) {
        if (isNetworkError(err)) handleNetworkError();
        else {
          setError(getErrorMessage(err, "লোড করা যায়নি।"));
          setTests([]);
          setCategories([]);
          setCategoryRooms({});
        }
      } finally {
        setInitialLoading(false);
      }
    })();
  }, []);

  // Auto-dismiss the success popup. Popup itself is unchanged, so the page
  // owns the timer and simply unmounts it.
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(""), SUCCESS_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const handleTestSaved = (updatedTest) => {
    if (updatedTest.__notFound) {
      setTests((prev) => prev.filter((t) => t._id !== updatedTest._id));
      setModal(null);
      return;
    }
    setTests((prev) =>
      prev.map((t) => {
        if (t._id !== updatedTest._id) return t;
        const merged = { ...t, ...updatedTest };
        // Keep the computed effective room in sync with whichever field
        // just changed, without waiting for a refetch.
        merged.effectiveCollectionRoom = merged.sampleCollectionRoom ?? categoryRooms[merged.categoryId] ?? null;
        return merged;
      }),
    );
  };

  // A category's default just changed — every test in it that doesn't have
  // its own override should reflect the new default immediately.
  const handleSetCategoryRoom = (categoryId, room) => {
    setCategoryRooms((prev) => ({ ...prev, [categoryId]: room }));
    setTests((prev) =>
      prev.map((t) =>
        t.categoryId === categoryId ? { ...t, effectiveCollectionRoom: t.sampleCollectionRoom ?? room ?? null } : t,
      ),
    );
  };

  const counts = useMemo(() => {
    const online = tests.filter((t) => !!t.schemaId).length;
    return { all: tests.length, online, offline: tests.length - online };
  }, [tests]);

  const groups = useMemo(() => {
    const byCategory = new Map();
    for (const test of tests) {
      const key = test.categoryId ?? "uncategorized";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(test);
    }

    const result = [];
    for (const category of categories) {
      const list = (byCategory.get(category._id) ?? []).filter((t) => {
        if (statusFilter === "online" && !t.schemaId) return false;
        if (statusFilter === "offline" && t.schemaId) return false;
        return matchesSearch(t.name, search);
      });
      if (list.length > 0) result.push({ category, tests: list });
    }
    return result;
  }, [categories, tests, search, statusFilter]);

  const modalTest = modal ? (tests.find((t) => t._id === modal.testId) ?? null) : null;
  const modalCategory = modalTest ? categories.find((c) => c._id === modalTest.categoryId) : null;
  const searching = strip(search) !== "";

  return (
    <section className={`min-h-screen ${pageBg} font-noto`}>
      {modalTest && (
        <FormatRangesModal
          key={`${modalTest._id}-${modal.tab}`}
          test={modalTest}
          category={modalCategory}
          initialTab={modal.tab}
          onClose={() => setModal(null)}
          onSaved={handleTestSaved}
          onSuccess={setSuccessMsg}
          onNetworkError={handleNetworkError}
          onOpenDemoPreview={setDemoPreview}
        />
      )}

      {demoPreview && (
        <ReportDemoView
          schemaId={demoPreview.schemaId}
          testName={demoPreview.testName}
          onClose={() => setDemoPreview(null)}
        />
      )}

      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}
      {successMsg && <Popup type="success" message={successMsg} onClose={() => setSuccessMsg("")} />}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 via-teal-500 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-200 shrink-0">
              <FlaskConical className="w-5 h-5 text-white" strokeWidth={2.25} />
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />
            </div>
            <div>
              <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-tight">টেস্ট কনফিগারেশন</h1>
              <p className="text-[13.5px] text-slate-400 mt-0.5">
                কক্ষ নম্বর সরাসরি বদলান; ফরম্যাট ও রেঞ্জ এক ক্লিকে দেখুন ও Edit করুন
              </p>
            </div>
          </div>
          <Link
            to="/setup"
            className={`${focusRing} flex items-center gap-1.5 text-[13px] shrink-0 rounded-lg py-1 text-slate-400 hover:text-slate-600 transition-colors`}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> ফিরে যান
          </Link>
        </div>

        {initialLoading ? (
          <Spinner label="লোড হচ্ছে…" />
        ) : error ? (
          <ErrorLine>{error}</ErrorLine>
        ) : (
          <>
            {/* search + status filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="টেস্টের নাম খুঁজুন…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`text-[14px] rounded-xl pl-10 ${
                    search ? "pr-10" : "pr-4"
                  } py-3 w-full outline-none border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-teal-100 focus:border-teal-300 transition-shadow`}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="মুছুন"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 items-center" role="group" aria-label="স্ট্যাটাস ফিল্টার">
                {STATUS_FILTERS.map(({ id, label, icon: Icon }) => {
                  const active = statusFilter === id;
                  const activeCls =
                    id === "online" ? "bg-emerald-500 border-emerald-500" : "bg-teal-600 border-teal-600";
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStatusFilter(id)}
                      aria-pressed={active}
                      className={`${focusRing} inline-flex items-center gap-1.5 text-[13px] rounded-full px-3.5 py-2 transition-colors whitespace-nowrap border ${
                        active
                          ? `${activeCls} text-white font-semibold shadow-sm`
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      {label} {counts[id]}
                    </button>
                  );
                })}
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="text-[14px] py-10 text-center text-slate-400">কোনো টেস্ট পাওয়া যায়নি।</p>
            ) : (
              groups.map(({ category, tests: categoryTests }, idx) => (
                <CategoryGroup
                  key={category._id}
                  category={category}
                  tests={categoryTests}
                  categoryRoom={categoryRooms[category._id] ?? null}
                  open={searching || !collapsed[category._id]}
                  onToggle={() => setCollapsed((c) => ({ ...c, [category._id]: !c[category._id] }))}
                  onOpenTest={(testId, tab) => setModal({ testId, tab })}
                  onTestSaved={handleTestSaved}
                  onNetworkError={handleNetworkError}
                  onSetCategoryRoom={handleSetCategoryRoom}
                  animDelay={idx * 40}
                />
              ))
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(8px) scale(.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-\\[cardIn"], [class*="animate-\\[modalIn"] { animation: none !important; }
        }
      `}</style>
    </section>
  );
};

export default TestConfigPage;
