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
} from "lucide-react";
import testConfigService from "../../../api/testConfig";
import Popup from "../../../components/popup";
import RangeOverridesPanel, { RangeSummary, RefSummary, applyOverrides, idOf } from "./RangeOverridesPanel";

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

// ─── tokens ──────────────────────────────────────────────────────────────────

const accent = "#155E63"; // deep teal — the one deliberate brand color
const accentDark = "#0F4A4E";
const accentSoft = "#EAF3F2";
const accentLine = "#CFE3E1";
const green = "#16A34A"; // format available / online
const greenDark = "#15803D";
const greenSoft = "#E8F7EE";
const amber = "#D97706"; // formats available, none selected yet
const amberDark = "#92400E";
const amberSoft = "#FEF3C7";
const ink = "#111827";
const sub = "#6B7280";
const line = "#E5E7EB";
const page = "#F5F7F7";
const danger = "#B42318";
const dangerSoft = "#FEF3F2";

const sansCls = "font-['Inter','IBM_Plex_Sans',system-ui,sans-serif]";
const fieldStyle = { border: `1px solid ${line}`, background: "#fff", color: ink };
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const focusStyle = { outlineColor: accent };

// ─── small shared bits ───────────────────────────────────────────────────────

const Spinner = ({ label }) => (
  <div className="flex items-center gap-2 py-2">
    <Loader2 className="w-4 h-4 animate-spin" style={{ color: accent }} />
    <span className={`${sansCls} text-[13px]`} style={{ color: sub }}>
      {label}
    </span>
  </div>
);

const ErrorLine = ({ children }) => (
  <p
    className={`${sansCls} text-[13px] rounded-lg px-3 py-2`}
    style={{ color: danger, background: dangerSoft }}
    role="alert"
  >
    {children}
  </p>
);

const Pill = ({ icon: Icon, children, tone = "soft" }) => (
  <span
    className={`${sansCls} inline-flex items-center gap-1 text-[12px] rounded-full px-2.5 py-0.5 whitespace-nowrap`}
    style={
      tone === "accent"
        ? { background: accent, color: "#fff" }
        : tone === "green"
          ? { background: greenSoft, color: greenDark }
          : tone === "plain"
            ? { background: "#F3F4F6", color: sub }
            : { background: accentSoft, color: accent }
    }
  >
    {Icon && <Icon className="w-3 h-3" />}
    {children}
  </span>
);

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
    title="ফরম্যাট আছে, কিন্তু এখনো বাছাই করা হয়নি"
    className={`${sansCls} inline-flex items-center gap-1.5 text-[11.5px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap animate-pulse motion-reduce:animate-none`}
    style={{ background: amberSoft, color: amberDark }}
  >
    <span className="relative flex w-2 h-2">
      <span
        className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping motion-reduce:animate-none"
        style={{ background: amber }}
      />
      <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: amber }} />
    </span>
    বাছাই বাকি
  </span>
);

const PrimaryButton = ({ children, disabled, ...rest }) => (
  <button
    type="button"
    disabled={disabled}
    className={`${sansCls} ${focusRing} text-[13px] font-medium text-white rounded-lg px-4 py-2.5 transition-colors`}
    style={{ background: disabled ? "#9CA3AF" : accent, ...focusStyle }}
    {...rest}
  >
    {children}
  </button>
);

const GhostButton = ({ children, tone, ...rest }) => (
  <button
    type="button"
    className={`${sansCls} ${focusRing} text-[13px] font-medium rounded-lg px-4 py-2.5 bg-white disabled:opacity-50`}
    style={{ border: `1px solid ${line}`, color: tone === "danger" ? danger : ink, ...focusStyle }}
    {...rest}
  >
    {children}
  </button>
);

const DangerButton = ({ children, ...rest }) => (
  <button
    type="button"
    className={`${sansCls} ${focusRing} text-[13px] font-medium text-white rounded-lg px-4 py-2.5`}
    style={{ background: danger, outlineColor: danger }}
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
        className={`${sansCls} text-[13px] px-2.5 py-1.5 w-24 rounded-lg outline-none`}
        style={fieldStyle}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(value.trim() || null)}
        className={`${sansCls} ${focusRing} text-[12px] font-medium text-white rounded-lg px-3 py-1.5`}
        style={{ background: saving ? "#9CA3AF" : accent, ...focusStyle }}
      >
        {saving ? "…" : "সংরক্ষণ"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className={`${sansCls} ${focusRing} text-[12px] px-1.5 py-1 rounded`}
        style={{ color: sub, ...focusStyle }}
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
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6"
      style={{ background: "rgba(17,24,39,.45)", zIndex }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`bg-white w-full ${widthCls} max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl`}
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
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: dangerSoft }}
      >
        <AlertTriangle className="w-5 h-5" style={{ color: danger }} />
      </span>
      <div className="min-w-0">
        <h3
          id="confirm-wipe-title"
          className={`${sansCls} text-[16px] leading-snug font-semibold`}
          style={{ color: ink }}
        >
          পুরনো কাস্টম রেঞ্জ মুছে যাবে
        </h3>
        <p className={`${sansCls} text-[13.5px] leading-relaxed mt-1.5`} style={{ color: sub }}>
          এই টেস্টে {count}টি কাস্টম রেফারেন্স রেঞ্জ/ইউনিট আছে।{" "}
          {action === "offline" ? "অফলাইন করলে" : "ফরম্যাট বদলালে"} এগুলো স্থায়ীভাবে মুছে যাবে
          {action === "offline" ? "।" : " এবং নতুন ফরম্যাটের ডিফল্ট মান ব্যবহার হবে।"} এটি ফেরানো যাবে না।
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

  if (rows.length === 0)
    return (
      <p className={`${sansCls} text-[13px]`} style={{ color: sub }}>
        এই ফরম্যাটে কোনো রেফারেন্স রেঞ্জ নেই।
      </p>
    );

  return (
    <div className="space-y-3">
      {rows.map(({ sec, fields }) => (
        <div key={idOf(sec) || sec.name}>
          <p className={`${sansCls} text-[12.5px] font-semibold mb-1`} style={{ color: ink }}>
            {sec.name}
          </p>
          {fields.map((f) => (
            <div
              key={idOf(f) || f.name}
              className={`${sansCls} flex gap-3 py-2 text-[12.5px]`}
              style={{ borderTop: `1px solid ${line}`, color: ink }}
            >
              <span className="w-32 sm:w-40 shrink-0 font-medium">{f.name}</span>
              <div className="flex-1 min-w-0">
                {f.type === "number" ? (
                  <RangeSummary range={f.standardRange} />
                ) : (
                  <RefSummary refValue={f.referenceValue} />
                )}
              </div>
              <span className="shrink-0" style={{ color: sub }}>
                {f.unit || ""}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ─── format + ranges modal ───────────────────────────────────────────────────

const FormatRangesModal = ({ test, category, initialTab, onClose, onSaved, onSuccess, onNetworkError }) => {
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
      onSuccess?.("ফরম্যাট সফলভাবে সংরক্ষণ করা হয়েছে।");
    } catch (err) {
      if (isNetworkError(err)) {
        setSchemaApiError(NO_INTERNET);
        onNetworkError?.();
      } else if (getErrorStatus(err) === 404) {
        onSaved?.({ ...test, __notFound: true });
        return;
      } else {
        setSchemaApiError(getErrorMessage(err, "সংরক্ষণ ব্যর্থ হয়েছে।"));
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
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
          <div className="min-w-0">
            <h2
              id="fr-modal-title"
              className={`${sansCls} text-[19px] leading-snug font-semibold`}
              style={{ color: ink }}
            >
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
            className={`${focusRing} p-2 -mr-2 -mt-1 rounded-lg hover:bg-[#F3F4F6]`}
            style={focusStyle}
          >
            <X className="w-5 h-5" style={{ color: sub }} />
          </button>
        </div>

        {/* tabs */}
        <div className="flex gap-1 px-3 sm:px-5" style={{ borderBottom: `1px solid ${line}` }} role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`${sansCls} ${focusRing} flex items-center gap-2 px-3 py-3 text-[14px] whitespace-nowrap -mb-px`}
                style={{
                  color: active ? accent : sub,
                  fontWeight: active ? 600 : 400,
                  borderBottom: `2px solid ${active ? accent : "transparent"}`,
                  ...focusStyle,
                }}
              >
                <Icon className="w-4 h-4" />
                {label}
                {id === "ranges" && overrideCount > 0 && (
                  <span
                    className="text-[11px] rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center"
                    style={{ background: accentSoft, color: accent }}
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
                <p className={`${sansCls} text-[14px]`} style={{ color: sub }}>
                  এই টেস্টের জন্য কোনো ফরম্যাট তৈরি করা হয়নি।
                </p>
              ) : (
                <>
                  <p className={`${sansCls} text-[13px]`} style={{ color: sub }}>
                    একটি ফরম্যাট বেছে নিন। “রেঞ্জ দেখুন” চাপলে সেই ফরম্যাটের রেফারেন্স রেঞ্জ দেখা যাবে।
                  </p>
                  <div role="radiogroup" aria-label="রিপোর্ট ফরম্যাট" className="space-y-2">
                    {schemas.map((schema) => {
                      const selected = selectedSchemaId === schema._id;
                      const open = previewId === schema._id;
                      // For the format this test already uses, show the lab's own values.
                      const shown =
                        schema._id === test.schemaId ? applyOverrides(schema, test.schema?.overrides) : schema;
                      return (
                        <div
                          key={schema._id}
                          className="rounded-xl overflow-hidden"
                          style={{
                            background: selected ? accentSoft : "#fff",
                            border: `1.5px solid ${selected ? accent : line}`,
                          }}
                        >
                          <div className="flex items-center">
                            <button
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => selectSchema(schema._id)}
                              className={`${sansCls} ${focusRing} flex-1 min-w-0 flex items-center gap-3 text-left px-4 py-3.5`}
                              style={focusStyle}
                            >
                              <span
                                className="w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center"
                                style={{ border: `2px solid ${selected ? accent : "#D1D5DB"}` }}
                              >
                                {selected && <span className="w-2 h-2 rounded-full" style={{ background: accent }} />}
                              </span>
                              <span className="min-w-0">
                                <span
                                  className="block text-[14px]"
                                  style={{ color: selected ? accentDark : ink, fontWeight: selected ? 600 : 400 }}
                                >
                                  {schema.description || "নামহীন ফরম্যাট"}
                                </span>
                                <span className="block text-[12px]" style={{ color: sub }}>
                                  {countFields(schema)}টি ফিল্ডে রেঞ্জ/মান
                                </span>
                              </span>
                              {test.schemaId === schema._id && <Pill tone="green">বর্তমান</Pill>}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPreviewId(open ? null : schema._id)}
                              aria-expanded={open}
                              className={`${sansCls} ${focusRing} flex items-center gap-1 text-[12.5px] mr-3 px-2 py-1.5 rounded-lg shrink-0`}
                              style={{ color: accent, ...focusStyle }}
                            >
                              রেঞ্জ দেখুন
                              <ChevronDown
                                className="w-3.5 h-3.5 transition-transform"
                                style={{ transform: open ? "rotate(180deg)" : "none" }}
                              />
                            </button>
                          </div>
                          {open && (
                            <div className="px-4 pb-4 pt-2 bg-white" style={{ borderTop: `1px solid ${line}` }}>
                              <FormatPreview schema={shown} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <PrimaryButton onClick={requestSave} disabled={savingSchema || makingOffline}>
                      {savingSchema ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
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
              <p className={`${sansCls} text-[13px] mb-4 leading-relaxed`} style={{ color: sub }}>
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
      ? `${formatCount}টি ফরম্যাট আছে — এখনো বাছাই করা হয়নি`
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
        setRoomError(getErrorMessage(err, "সংরক্ষণ ব্যর্থ হয়েছে।"));
      }
    } finally {
      setSavingRoom(false);
    }
  };

  const chipBtn = `${sansCls} ${focusRing} inline-flex items-center gap-1.5 text-[13px] rounded-lg px-2.5 py-1.5 whitespace-nowrap`;

  return (
    <li style={{ borderTop: `1px solid ${line}` }}>
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap px-4 py-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[170px]">
          {/* status: Wifi = online (format attached), WifiOff = offline.
              Green dot badge = a format is available for this test. */}
          <span
            className="relative w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
            style={{ background: isOnline ? greenSoft : "#F3F4F6" }}
            title={`${isOnline ? "অনলাইন" : "অফলাইন"} — ${formatNote}`}
          >
            {isOnline ? (
              <Wifi className="w-4 h-4" style={{ color: green }} />
            ) : (
              <WifiOff className="w-4 h-4" style={{ color: "#9CA3AF" }} />
            )}
            {hasFormats && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: green, border: "2px solid #fff" }}
                aria-hidden="true"
              />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 flex-wrap">
              <span className={`${sansCls} text-[14.5px]`} style={{ color: ink }}>
                {test.name}
              </span>
              {needsPick && <PendingBadge />}
            </span>
            <span className={`${sansCls} block text-[12px]`} style={{ color: hasFormats ? greenDark : sub }}>
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
              className={chipBtn}
              style={{
                border: `1px ${room ? "solid" : "dashed"} ${room ? accentLine : "#D1D5DB"}`,
                background: room ? accentSoft : "#fff",
                color: room ? accent : sub,
                ...focusStyle,
              }}
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
                className={chipBtn}
                style={
                  isOnline
                    ? { background: green, color: "#fff", ...focusStyle }
                    : { border: `1px solid ${green}`, background: "#fff", color: greenDark, ...focusStyle }
                }
              >
                <FileText className="w-3.5 h-3.5" />
                {isOnline ? "ফরম্যাট" : "ফরম্যাট বাছুন"}
              </button>

              {/* ranges */}
              <button
                type="button"
                disabled={!isOnline}
                onClick={() => onOpen(test._id, "ranges")}
                title={isOnline ? "রেফারেন্স রেঞ্জ দেখুন/পরিবর্তন করুন" : "আগে একটি ফরম্যাট বেছে নিন"}
                className={`${chipBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
                style={{ border: `1px solid ${line}`, background: "#fff", color: ink, ...focusStyle }}
              >
                <Ruler className="w-3.5 h-3.5" />
                রেঞ্জ
                {overrideCount > 0 && (
                  <span
                    className="text-[11px] rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center"
                    style={{ background: accentSoft, color: accent }}
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
        setRoomApiError(getErrorMessage(err, "সংরক্ষণ ব্যর্থ হয়েছে।"));
      }
    } finally {
      setSavingRoom(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white mb-4 overflow-hidden" style={{ border: `1px solid ${line}` }}>
      <div
        className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap px-4 py-3"
        style={{ background: accentSoft }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`${sansCls} ${focusRing} flex items-center gap-2 text-left rounded`}
          style={focusStyle}
        >
          <ChevronDown
            className="w-4 h-4 shrink-0 transition-transform"
            style={{ color: accent, transform: open ? "none" : "rotate(-90deg)" }}
          />
          <span className="text-[15px] font-semibold" style={{ color: ink }}>
            {category.name}
          </span>
          <span className="text-[12px] rounded-full px-2 py-0.5 bg-white" style={{ color: sub }}>
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
            className={`${sansCls} ${focusRing} inline-flex items-center gap-1.5 text-[13px] rounded`}
            style={{ color: categoryRoom ? accent : sub, ...focusStyle }}
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
    <section className="min-h-screen font-[Noto_Sans_Bengali,sans-serif]" style={{ background: page }}>
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
        />
      )}
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}
      {successMsg && <Popup type="success" message={successMsg} onClose={() => setSuccessMsg("")} />}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: accent }}
            >
              <FlaskConical className="w-5 h-5 text-white" />
            </span>
            <div>
              <h1 className={`${sansCls} text-[22px] leading-tight font-semibold`} style={{ color: ink }}>
                টেস্ট কনফিগারেশন
              </h1>
              <p className={`${sansCls} text-[13px] mt-0.5`} style={{ color: sub }}>
                কক্ষ নম্বর সরাসরি বদলান; ফরম্যাট ও রেঞ্জ এক ক্লিকে দেখুন ও সম্পাদনা করুন
              </p>
            </div>
          </div>
          <Link
            to="/setup"
            className={`${sansCls} ${focusRing} flex items-center gap-1.5 text-[13px] shrink-0 rounded py-1`}
            style={{ color: sub, ...focusStyle }}
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
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: sub }} />
                <input
                  type="text"
                  placeholder="টেস্টের নাম খুঁজুন…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${sansCls} text-[14px] rounded-xl pl-10 ${search ? "pr-10" : "pr-4"} py-3 w-full outline-none focus:ring-2`}
                  style={{ ...fieldStyle, "--tw-ring-color": accentLine }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="মুছুন"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4" style={{ color: sub }} />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 items-center" role="group" aria-label="স্ট্যাটাস ফিল্টার">
                {STATUS_FILTERS.map(({ id, label, icon: Icon }) => {
                  const active = statusFilter === id;
                  const activeBg = id === "online" ? green : accent;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setStatusFilter(id)}
                      aria-pressed={active}
                      className={`${sansCls} ${focusRing} inline-flex items-center gap-1.5 text-[13px] rounded-full px-3.5 py-2 transition-colors whitespace-nowrap`}
                      style={{
                        background: active ? activeBg : "#fff",
                        color: active ? "#fff" : sub,
                        border: `1px solid ${active ? activeBg : line}`,
                        fontWeight: active ? 600 : 400,
                        ...focusStyle,
                      }}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      {label} {counts[id]}
                    </button>
                  );
                })}
              </div>
            </div>

            {groups.length === 0 ? (
              <p className={`${sansCls} text-[14px] py-10 text-center`} style={{ color: sub }}>
                কোনো টেস্ট পাওয়া যায়নি।
              </p>
            ) : (
              groups.map(({ category, tests: categoryTests }) => (
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
                />
              ))
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default TestConfigPage;
