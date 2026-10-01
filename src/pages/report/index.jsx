/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 */
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import {
  Search,
  Printer,
  Upload,
  User,
  FlaskConical,
  FileText,
  CheckCircle2,
  Wallet,
  X,
  ChevronRight,
  Pencil,
  Calendar,
  ClipboardList,
  Check,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Hash,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import Popup from "../../components/popup";
import ScanButton from "../../components/scanButton";
import indoorPatientService from "../../api/indoorPatient";
import reportService from "../../api/report";
import PrintId from "../../components/PrintId";
import { useAuthStore } from "../../store/authStore";

// ─── ID Format Detection ──────────────────────────────────────────────────────
// Indoor admission IDs keep their specific pattern (IP + 3 digits + 2 letters,
// 7 chars) and are checked first. Anything else that's 6-7 characters is
// treated as an outdoor invoice ID — no fixed character pattern required.
const detectIdType = (id) => {
  const trimmed = id.trim();
  if (/^IP[1-9]{3}[A-NP-Z]{2}$/i.test(trimmed)) return "indoor";
  if (trimmed.length >= 6 && trimmed.length <= 7) return "outdoor";
  return null;
};

// ─── Data Normalizers ─────────────────────────────────────────────────────────

const normalizeOutdoor = (invoice) => ({
  _type: "outdoor",
  _patientId: null,
  displayId: invoice.invoiceId,
  createdAt: invoice.createdAt ?? null,
  patient: invoice.patient,
  amount: invoice.amount ?? null,
  space: null,
  supervisorDoctor: null,
  tests: (invoice.tests ?? []).map((t) => ({
    testId: t.testId,
    name: t.name,
    price: t.price ?? null,
    schemaId: t.schemaId ?? null,
    isCompleted: t.isCompleted ?? false,
    report: t.report ?? {},
    addedAt: t.addedAt ?? null,
    completedAt: t.completedAt ?? null,
    completedBy: t.completedBy ?? null,
    updatedAt: t.updatedAt ?? null,
    updatedBy: t.updatedBy ?? null,
  })),
});

const normalizeIndoor = (patient) => ({
  _type: "indoor",
  _patientId: String(patient._id),
  displayId: patient.admissionId,
  createdAt: patient.admittedAt ?? null,
  patient: patient.patient,
  amount: null,
  space: patient.space ?? null,
  supervisorDoctor: patient.supervisorDoctor ?? null,
  tests: (patient.reports ?? []).map((r) => ({
    testId: String(r.testId),
    name: r.name,
    price: null,
    schemaId: r.schemaId ?? null,
    isCompleted: r.isCompleted ?? false,
    report: r.report ?? {},
    addedAt: r.addedAt ?? null,
    // "Added By" — who added this test entry to the admission (indoor
    // only; outdoor invoice tests carry no addedBy in the schema). The
    // backend's GET /indoorReport/:admissionId projects the full reports
    // array, so this was already in the API response — it just wasn't
    // being mapped through here.
    addedBy: r.addedBy ?? null,
    completedAt: r.completedAt ?? null,
    completedBy: r.completedBy ?? null,
    updatedAt: r.updatedAt ?? null,
    updatedBy: r.updatedBy ?? null,
  })),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-IN") : "0");

const formatDateTime = (ts) => {
  if (!ts) return { date: "—", time: "—" };
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
    date: `${day}${suffix} ${d.toLocaleString("default", { month: "long" })}, ${d.getFullYear()}`,
    time: `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")}${h >= 12 ? "PM" : "AM"}`,
  };
};

const toInputDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
};

// Age is now stored as { years, months, days } — any part may be absent
// (defaults to 0 per patientAgeSchema). Render only the non-zero parts,
// e.g. "34y 2m", "0y 7m 10d" -> "7m 10d", or "—" if the whole object is
// empty/missing (legacy records without the new shape yet).
const formatAge = (age) => {
  if (!age || typeof age !== "object") return "—";
  const { years = 0, months = 0, days = 0 } = age;
  if (!years && !months && !days) return "—";
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  return parts.join(", ");
};

// ── Axios‑native network error detection (same as all other pages) ──────────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// ─── Color tokens (shared LabPilot palette) ────────────────────────────────────

const TEAL = {
  grad: "from-teal-500 to-teal-600",
  text: "text-teal-700",
  bg: "bg-teal-50",
  border: "border-teal-200",
  icon: "bg-teal-100 text-teal-600",
  ring: "ring-teal-100",
};
const INDIGO = {
  grad: "from-indigo-500 to-indigo-600",
  text: "text-indigo-700",
  bg: "bg-indigo-50",
  border: "border-indigo-200",
  icon: "bg-indigo-100 text-indigo-600",
  ring: "ring-indigo-100",
};
const OCHRE = {
  grad: "from-amber-500 to-amber-600",
  text: "text-amber-700",
  bg: "bg-amber-50",
  border: "border-amber-200",
  icon: "bg-amber-100 text-amber-600",
  ring: "ring-amber-100",
};
const RUST = {
  grad: "from-rose-500 to-orange-600",
  text: "text-rose-700",
  bg: "bg-rose-50",
  border: "border-rose-200",
  icon: "bg-rose-100 text-rose-600",
  ring: "ring-rose-100",
};
const GRAY = {
  text: "text-gray-800",
  bg: "bg-gray-50",
  border: "border-gray-200",
};

// ─── Skeletons ────────────────────────────────────────────────────────────────

const RecordSkeleton = () => (
  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm animate-pulse">
    <div className="h-1 bg-gray-100" />
    <div className="px-6 pt-6 pb-5 border-b border-gray-100">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-2 w-16 bg-gray-100 rounded-full" />
          <div className="h-7 w-36 bg-gray-200 rounded-lg" />
          <div className="h-2 w-44 bg-gray-100 rounded-full" />
        </div>
        <div className="h-7 w-20 bg-gray-100 rounded-full" />
      </div>
    </div>
    <div className="px-6 py-5 border-b border-gray-100">
      <div className="h-2 w-16 bg-gray-100 rounded-full mb-4" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-100 rounded-xl" />
            <div className="space-y-1.5">
              <div className="h-2 w-10 bg-gray-100 rounded-full" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="px-6 py-5 space-y-2.5">
      <div className="h-2 w-20 bg-gray-100 rounded-full mb-4" />
      {[0, 1].map((i) => (
        <div key={i} className="border border-gray-100 rounded-xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-gray-200 rounded" />
            <div className="h-2 w-20 bg-gray-100 rounded-full" />
          </div>
          <div className="h-8 w-20 bg-gray-100 rounded-lg" />
        </div>
      ))}
    </div>
  </div>
);

// Placeholder cards for the recent-invoices list (matches collapsed RecordCard height)
const ListSkeleton = () => (
  <div className="space-y-3">
    {[0, 1, 2].map((i) => (
      <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse h-[132px]" />
    ))}
  </div>
);

const DateField = ({ icon: Icon, iconColor, label, value, onChange }) => (
  <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
    <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
      <Icon className={`w-3 h-3 ${iconColor}`} />
      {label}
    </label>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 bg-gray-50 focus:bg-white text-gray-800 cursor-pointer transition-all w-full"
    />
  </div>
);

// ─── Upload / Edit Meta (who + when) ───────────────────────────────────────────

const UploadMeta = ({ completedAt, completedBy, updatedAt, updatedBy }) => {
  if (!completedAt) return null;
  const completed = formatDateTime(completedAt);
  const updated = updatedAt ? formatDateTime(updatedAt) : null;

  return (
    <div className="flex flex-col gap-0.5 mt-1.5 text-[10px] text-gray-400 font-medium">
      <span className="truncate">
        Uploaded by <span className="font-bold text-gray-500">{completedBy?.name ?? "—"}</span> · {completed.date}
      </span>
      {updated && (
        <span className="truncate">
          Edited by <span className="font-bold text-gray-500">{updatedBy?.name ?? "—"}</span> · {updated.date}
        </span>
      )}
    </div>
  );
};

// ─── Section Header (compact label with icon + accent underline) ──────────────

const SectionHeader = ({ icon: Icon, label, token }) => (
  <div className="flex items-center gap-2.5 mb-3.5">
    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${token.icon}`}>
      <Icon className="w-3 h-3" />
    </div>
    <span className={`text-[11px] font-bold uppercase tracking-widest ${token.text}`}>{label}</span>
    <div className="flex-1 h-px bg-gray-100" />
  </div>
);

// ─── Bridge Divider (dashed, matches cash memo convention) ────────────────────

const BridgeDivider = () => (
  <div className="flex items-center gap-2 py-1">
    <div className="flex-1 border-t border-dashed border-gray-200" />
    <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
    <div className="flex-1 border-t border-dashed border-gray-200" />
  </div>
);

// ─── Editable date row — its own inline edit state + its own Update/Save/Cancel ──

const EditableDateRow = ({ icon: Icon, iconColor, token, label, storedValue, onSave, onNetworkError }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toInputDate(storedValue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const displayDate = storedValue ? formatDateTime(storedValue) : null;
  const isDirty = toInputDate(storedValue) !== value;

  const startEdit = () => {
    setValue(toInputDate(storedValue));
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setValue(toInputDate(storedValue));
    setError(null);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!value) return;
    try {
      setSaving(true);
      setError(null);
      await onSave(new Date(value).getTime());
      setEditing(false);
    } catch (err) {
      if (isNetworkError(err)) {
        setError("ইন্টারনেট সংযোগ নেই। দয়া করে সংযোগ চেক করুন।");
        onNetworkError?.();
      } else {
        setError("তারিখ সেভ করা সম্ভব হয়নি");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${token.icon}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
          {displayDate ? (
            <p className="font-['IBM_Plex_Mono'] text-sm font-bold text-gray-800">{displayDate.date}</p>
          ) : (
            <p className="text-sm font-medium text-gray-300">তথ্য নেই</p>
          )}
        </div>
        <button
          onClick={startEdit}
          className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-gray-400 hover:text-gray-700 transition-colors mt-0.5"
        >
          <Pencil className="w-3 h-3" /> Update
        </button>
      </div>
    );
  }

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className={`flex items-end gap-2 p-3 rounded-xl border ${token.border} ${token.bg}`}>
        <DateField icon={Icon} iconColor={iconColor} label={label} value={value} onChange={setValue} />
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={cancelEdit}
            disabled={saving}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-all disabled:opacity-40"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty || !value}
            className={`p-2 rounded-lg bg-gradient-to-r ${token.grad} text-white shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Save"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {error && <p className="text-[11px] text-rose-600 font-medium mt-2">{error}</p>}
    </div>
  );
};

// ─── Static (non-editable) date row — shown when editing wouldn't stick ───────
// Used for Report Date before a test is completed: the backend hardcodes
// report.reportDate to the upload timestamp on first POST /report/add,
// so any value set here would be silently overwritten the moment the
// report is actually submitted. Editing only makes sense post-completion.

const StaticDateRow = ({ icon: Icon, token, label, note }) => (
  <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${token.icon}`}>
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-300">{note}</p>
    </div>
  </div>
);

// ─── Meta row (who + when) ────────────────────────────────────────────────────

const MetaRow = ({ icon: Icon, token, label, name, date }) => (
  <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${token.icon}`}>
      <Icon className="w-4 h-4" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      {date ? (
        <>
          <p className="text-sm font-bold text-gray-800 truncate">{name ?? "—"}</p>
          <p className="font-['IBM_Plex_Mono'] text-[11px] text-gray-400 font-medium mt-0.5">
            {date.date} · {date.time}
          </p>
        </>
      ) : (
        <p className="text-sm font-medium text-gray-300">তথ্য নেই</p>
      )}
    </div>
  </div>
);

// ─── Test Meta Panel (inline details: dates + created / edited / added info) ──

const TestMetaPanel = ({ record, test, onDatesSaved, onNetworkError }) => {
  const isIndoor = record._type === "indoor";

  const added = test.addedAt ? formatDateTime(test.addedAt) : null;
  const created = test.completedAt ? formatDateTime(test.completedAt) : null;
  const edited = test.updatedAt ? formatDateTime(test.updatedAt) : null;

  const saveDateField = async (fieldKey, timestamp) => {
    const payload = { [fieldKey]: timestamp };

    if (isIndoor) {
      await reportService.updateIndoorDates({
        patientId: record._patientId,
        testId: test.testId,
        addedAt: test.addedAt,
        ...payload,
      });
    } else {
      await reportService.updateDates({
        invoiceId: record.displayId,
        testId: test.testId,
        ...payload,
      });
    }

    onDatesSaved(test.testId, test.addedAt, {
      sampleCollectionDate: test.report?.sampleCollectionDate ?? null,
      reportDate: test.report?.reportDate ?? null,
      ...payload,
    });
  };

  return (
    <div className="px-1">
      <EditableDateRow
        icon={Calendar}
        iconColor="text-teal-600"
        token={TEAL}
        label="Sample Collection Date"
        storedValue={test.report?.sampleCollectionDate}
        onSave={(ts) => saveDateField("sampleCollectionDate", ts)}
        onNetworkError={onNetworkError}
      />
      {test.isCompleted ? (
        <EditableDateRow
          icon={ClipboardList}
          iconColor="text-orange-600"
          token={OCHRE}
          label="Report Date"
          storedValue={test.report?.reportDate}
          onSave={(ts) => saveDateField("reportDate", ts)}
          onNetworkError={onNetworkError}
        />
      ) : (
        <StaticDateRow
          icon={ClipboardList}
          token={OCHRE}
          label="Report Date"
          note="আপলোডের সময় স্বয়ংক্রিয়ভাবে সেট হবে"
        />
      )}
      <MetaRow icon={Upload} token={TEAL} label="Report Uploaded By" name={test.completedBy?.name} date={created} />
      <MetaRow icon={Pencil} token={RUST} label="Last Edited By" name={test.updatedBy?.name} date={edited} />
      {isIndoor && (
        <MetaRow
          icon={Hash}
          token={OCHRE}
          label="Added"
          name={added ? (test.addedBy?.name ?? "রিপোর্ট এন্ট্রি যোগ করা হয়েছে") : null}
          date={added}
        />
      )}
    </div>
  );
};

// ─── Test Action Buttons ──────────────────────────────────────────────────────

const TestActions = ({ record, test }) => {
  const { _type, _patientId, displayId } = record;
  const { testId, name, isCompleted, addedAt } = test;
  const navigate = useNavigate();

  const role = useAuthStore((s) => s.user?.role);
  const permissions = useAuthStore((s) => s.user?.permissions);
  const isAdmin = role === "admin";
  const canUpload = isAdmin || !!permissions?.testReportUpload;
  const canDownload = isAdmin || !!permissions?.testReportDownload;

  const goToUpload = (isEdit) => {
    const state =
      _type === "indoor"
        ? { patientId: _patientId, testId, testName: name, type: "indoor", addedAt, ...(isEdit && { isEdit: true }) }
        : { invoiceId: displayId, testId, testName: name, ...(isEdit && { isEdit: true }) };
    navigate("/report-upload", { state });
  };

  // Same-tab navigation, same as goToUpload — avoids the auth race that
  // happens with target="_blank" (a new tab starts with isAuthenticated:
  // false until the /refresh call resolves, and ProtectedRoutes doesn't
  // wait for it, so it briefly bounces to /login).
  const goToPrint = (printType) => {
    const state =
      _type === "indoor"
        ? { patientId: _patientId, testId, testName: name, type: "indoor", addedAt, printType }
        : { invoiceId: displayId, testId, testName: name, printType };
    navigate("/report-download", { state });
  };

  const actionBtnClass = (enabled) =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all shadow-sm ${
      enabled
        ? "bg-gray-900 text-white hover:bg-gray-700 cursor-pointer"
        : "bg-gray-200 text-gray-400 cursor-not-allowed"
    }`;

  const printBtnClass = (enabled) =>
    `flex items-center gap-1 px-2.5 py-2 border text-xs font-semibold rounded-xl transition-all ${
      enabled
        ? "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-800 cursor-pointer"
        : "border-gray-100 text-gray-300 cursor-not-allowed"
    }`;

  if (!isCompleted) {
    return (
      <button
        onClick={canUpload ? () => goToUpload(false) : undefined}
        disabled={!canUpload}
        title={!canUpload ? "No Permission" : undefined}
        className={actionBtnClass(canUpload)}
      >
        <Upload className="w-3 h-3" /> Upload
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={canDownload ? () => goToPrint("PAD") : undefined}
        disabled={!canDownload}
        title={!canDownload ? "No Permission" : undefined}
        className={printBtnClass(canDownload)}
      >
        <Printer className="w-3 h-3" />
        <span className="hidden sm:inline">Pad</span>
      </button>

      <button
        onClick={canDownload ? () => goToPrint("PLAIN") : undefined}
        disabled={!canDownload}
        title={!canDownload ? "No Permission" : undefined}
        className={printBtnClass(canDownload)}
      >
        <Printer className="w-3 h-3" />
        <span className="hidden sm:inline">A4</span>
      </button>

      <button
        onClick={canUpload ? () => goToUpload(true) : undefined}
        disabled={!canUpload}
        title={!canUpload ? "No Permission" : undefined}
        className={printBtnClass(canUpload)}
      >
        <Pencil className="w-3 h-3" />
        <span className="hidden sm:inline">Edit</span>
      </button>
    </div>
  );
};

// ─── Test Card (each card owns its own collapse / expand state) ───────────────
// Height animates via the grid-rows 0fr → 1fr trick (no measuring needed).
// While closed, the panel is visibility:hidden so its buttons can't be tabbed
// into; the visibility change is delayed on close so the animation can finish.

const TestCard = ({ record, test, onDatesSaved, onNetworkError }) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-xl border transition-all ${
        test.isCompleted
          ? `${TEAL.border} ${TEAL.bg}`
          : "border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm"
      }`}
    >
      {/* ── Header row (always visible) ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
        >
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              test.isCompleted ? TEAL.icon : OCHRE.icon
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 truncate leading-snug">{test.name}</p>
            <div className="flex items-center gap-2 mt-1">
              {test.isCompleted ? (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold ${TEAL.text} ${TEAL.bg} border ${TEAL.border} px-1.5 py-0.5 rounded-full`}
                >
                  <CheckCircle2 className="w-2.5 h-2.5" /> Completed
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold ${OCHRE.text} ${OCHRE.bg} border ${OCHRE.border} px-1.5 py-0.5 rounded-full`}
                >
                  Pending
                </span>
              )}
              {test.price != null && (
                <span className="font-['IBM_Plex_Mono'] text-[10px] text-gray-400 tabular-nums">
                  ৳{fmt(test.price)}
                </span>
              )}
            </div>
          </div>
        </button>

        <div className="shrink-0 flex items-center gap-1.5">
          <TestActions record={record} test={test} />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            title={open ? "Collapse details" : "Expand details"}
            className="p-2 rounded-xl border border-gray-200 bg-white/70 text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-all"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Collapsible details ── */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div
          className="overflow-hidden"
          aria-hidden={!open}
          style={{
            visibility: open ? "visible" : "hidden",
            transition: `visibility 0s linear ${open ? "0s" : "0.3s"}`,
          }}
        >
          <div className="mx-4 mb-4 pt-2 border-t border-gray-200/70">
            <TestMetaPanel record={record} test={test} onDatesSaved={onDatesSaved} onNetworkError={onNetworkError} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Record Detail Card ───────────────────────────────────────────────────────

const RecordDetail = ({ record, onDatesSaved, onNetworkError }) => {
  const [qrDataUrl, setQrDataUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(record.displayId, { width: 96, margin: 0 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [record.displayId]);

  const { date, time } = formatDateTime(record.createdAt);
  const amount = record.amount;
  const final = Number(amount?.final) || 0;
  const paid = Number(amount?.paid) || 0;
  const initial = Number(amount?.initial) || 0;
  const due = Math.max(0, final - paid);

  const isIndoor = record._type === "indoor";
  const onlineTests = record.tests.filter((t) => t.schemaId);
  const offlineTests = record.tests.filter((t) => !t.schemaId);
  const completedCount = onlineTests.filter((t) => t.isCompleted).length;

  const headerToken = isIndoor ? INDIGO : due > 0 ? RUST : TEAL;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${headerToken.icon}`}>
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${headerToken.text} mb-1`}>
                {isIndoor ? "Admission" : "Invoice"}
              </p>
              <h2 className="font-['IBM_Plex_Mono'] text-xl font-semibold text-gray-900 tracking-tight leading-none">
                {record.displayId}
              </h2>
              <p className="text-xs text-gray-400 mt-2 font-medium">
                {date} · {time}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center justify-center mx-2">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${record.displayId}`}
                className="w-16 h-16 rounded-lg border border-gray-100 p-1 bg-white"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg border border-gray-100 bg-gray-50 animate-pulse" />
            )}
          </div>

          {!isIndoor && amount && (
            <div className="text-right shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Total</p>
              <p className="font-['IBM_Plex_Mono'] text-xl font-semibold text-gray-900 leading-none">৳{fmt(final)}</p>
              {final < initial && (
                <p className="font-['IBM_Plex_Mono'] text-[11px] text-gray-400 line-through mt-1">৳{fmt(initial)}</p>
              )}
              <div className="mt-2.5">
                {due === 0 ? (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${TEAL.bg} ${TEAL.text} border ${TEAL.border}`}
                  >
                    <CheckCircle2 className="w-3 h-3" /> Paid
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${RUST.bg} ${RUST.text} border ${RUST.border}`}
                  >
                    <Wallet className="w-3 h-3" /> Due ৳{fmt(due)}
                  </span>
                )}
              </div>
            </div>
          )}

          {isIndoor && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${INDIGO.bg} ${INDIGO.text} border ${INDIGO.border} shrink-0`}
            >
              <CheckCircle2 className="w-3 h-3" /> Indoor Patient
            </span>
          )}
        </div>
      </div>

      {/* ── Patient Info ── */}
      <div className="px-6 py-5 border-b border-gray-100 bg-slate-50/60">
        <SectionHeader icon={User} label="রোগীর তথ্য" token={INDIGO} />
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {[
            { label: "Name", val: record.patient?.name },
            { label: "Contact", val: record.patient?.contactNumber },
            { label: "Gender", val: record.patient?.gender, cap: true },
            { label: "Age", val: formatAge(record.patient?.age) },
          ].map(({ label, val, cap }) => (
            <div key={label} className="min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
              <p className={`text-sm font-bold text-gray-800 truncate ${cap ? "capitalize" : ""}`}>{val || "—"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Online Tests ── */}
      {onlineTests.length > 0 && (
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2.5 mb-3.5">
            <div className="flex items-center gap-2.5">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${TEAL.icon}`}>
                <FlaskConical className="w-3 h-3" />
              </div>
              <span className={`text-[11px] font-bold uppercase tracking-widest ${TEAL.text}`}>অনলাইন টেস্ট</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${TEAL.grad} rounded-full transition-all`}
                  style={{ width: `${onlineTests.length > 0 ? (completedCount / onlineTests.length) * 100 : 0}%` }}
                />
              </div>
              <span className="font-['IBM_Plex_Mono'] text-[11px] font-medium text-gray-400 tabular-nums">
                {completedCount}/{onlineTests.length}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            {onlineTests.map((test, i) => (
              <TestCard
                key={(test.testId ?? "") + (test.addedAt ?? i)}
                record={record}
                test={test}
                onDatesSaved={onDatesSaved}
                onNetworkError={onNetworkError}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Offline Tests ── */}
      {offlineTests.length > 0 && (
        <div className="px-6 py-5">
          <SectionHeader icon={FileText} label="অফলাইন টেস্ট" token={OCHRE} />
          <div className="space-y-2">
            {offlineTests.map((test, i) => (
              <div
                key={(test.testId ?? "") + (test.addedAt ?? i)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-slate-50/60 transition-all"
              >
                <span className="font-['IBM_Plex_Mono'] text-[10px] font-bold text-gray-300 w-5 shrink-0 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-gray-700 truncate flex-1">{test.name}</span>
                {test.price != null && (
                  <span className="font-['IBM_Plex_Mono'] text-xs font-medium text-gray-400 tabular-nums shrink-0">
                    ৳{fmt(test.price)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Record Card (collapsed summary → expands to full RecordDetail) ───────────
// Used both for the single search result and for every row of the recent-
// invoices list. Each card owns its own expanded state, so in a list use
// key={record.displayId}.

const StatTile = ({ label, value, token }) => (
  <div className={`rounded-xl border px-3 py-2.5 text-center ${token.border} ${token.bg}`}>
    <p className={`font-['IBM_Plex_Mono'] text-lg font-semibold leading-none tabular-nums ${token.text}`}>{value}</p>
    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-1.5">{label}</p>
  </div>
);

const RecordCard = ({ record, onDatesSaved, onNetworkError }) => {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div>
        <button
          onClick={() => setExpanded(false)}
          className="w-full flex items-center justify-center gap-1.5 py-2 mb-2 text-[11px] font-bold text-gray-500 hover:text-gray-800 bg-white/60 border border-gray-200 rounded-xl transition-all"
        >
          <ChevronUp className="w-3.5 h-3.5" /> Collapse
        </button>
        <RecordDetail record={record} onDatesSaved={onDatesSaved} onNetworkError={onNetworkError} />
      </div>
    );
  }

  const isIndoor = record._type === "indoor";
  const token = isIndoor ? INDIGO : TEAL;
  const total = record.tests.length;
  const online = record.tests.filter((t) => t.schemaId).length;
  const offline = total - online;
  const completed = record.tests.filter((t) => t.schemaId && t.isCompleted).length;
  const { date, time } = formatDateTime(record.createdAt);

  return (
    <button
      onClick={() => setExpanded(true)}
      className="w-full text-left bg-white border border-gray-100 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-gray-200 hover:shadow-md transition-all overflow-hidden"
    >
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${token.icon}`}>
              <Hash className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-['IBM_Plex_Mono'] text-base font-semibold text-gray-900 leading-none">
                  {record.displayId}
                </h3>
                <span className={`text-[9px] font-bold uppercase tracking-widest ${token.text}`}>
                  {isIndoor ? "Admission" : "Invoice"}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-1.5 truncate">
                {record.patient?.name || "—"} <span className="text-gray-300">·</span> {date} · {time}
              </p>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        </div>

        <div className="grid grid-cols-4 gap-2 mt-4">
          <StatTile label="Total" value={total} token={GRAY} />
          <StatTile label="Online" value={online} token={INDIGO} />
          <StatTile label="Completed" value={`${completed}/${online}`} token={TEAL} />
          <StatTile label="Offline" value={offline} token={OCHRE} />
        </div>
      </div>
    </button>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const Report = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [record, setRecord] = useState(null);
  const [searching, setSearching] = useState(false);
  const [popup, setPopup] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [invalidId, setInvalidId] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  // Distinct from notFound: the invoice/admission exists but was
  // soft-deleted (backend signals this with 410 + { deleted: true }
  // instead of a plain 404 — see findReportableInvoice in
  // outdoorReportRoutes.js). Kept as the raw error message from the
  // response so the banner can show backend-provided context if it varies.
  const [deletedInfo, setDeletedInfo] = useState(null);

  // ── Recent outdoor invoices (cursor-paginated, 40 per page) ───────────────
  const [list, setList] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);

  const location = useLocation();

  const fetchRecord = async (id) => {
    const type = detectIdType(id);
    if (!type) {
      setInvalidId(true);
      setRecord(null);
      setNotFound(false);
      setDeletedInfo(null);
      return;
    }
    try {
      setSearching(true);
      setNotFound(false);
      setInvalidId(false);
      setDeletedInfo(null);
      setRecord(null);
      if (type === "outdoor") {
        const res = await reportService.getOutdoorPatient(id.trim().toUpperCase());
        setRecord(normalizeOutdoor(res.data));
      } else {
        const res = await reportService.getIndoorPatient(id.trim().toUpperCase());
        setRecord(normalizeIndoor(res.data));
      }
    } catch (err) {
      if (isNetworkError(err)) {
        setNetworkError(true);
      } else if (err?.response?.status === 410 && err?.response?.data?.deleted) {
        setDeletedInfo(err.response.data.error ?? "This invoice has been deleted");
      } else if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        setPopup({ type: "error", message: "Something went wrong. Please try again." });
      }
    } finally {
      setSearching(false);
    }
  };

  const loadInitialList = async () => {
    try {
      setListLoading(true);
      const res = await reportService.getOutdoorList();
      setList(res.data.invoices.map(normalizeOutdoor));
      setNextCursor(res.data.nextCursor);
    } catch (err) {
      if (isNetworkError(err)) setNetworkError(true);
      else setPopup({ type: "error", message: "Could not load recent invoices." });
    } finally {
      setListLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const res = await reportService.getOutdoorList(nextCursor);
      setList((prev) => [...prev, ...res.data.invoices.map(normalizeOutdoor)]);
      setNextCursor(res.data.nextCursor);
    } catch (err) {
      if (isNetworkError(err)) setNetworkError(true);
      else setPopup({ type: "error", message: "Could not load more invoices." });
    } finally {
      setLoadingMore(false);
    }
  };

  // Load the latest 40 invoices on mount (refires on every fresh mount, so
  // coming back from /report-upload shows up-to-date completion status).
  useEffect(() => {
    loadInitialList();
  }, []);

  // Keyed on location.key (not []) so this refires on EVERY navigation
  // into /report — including browser-back / mobile swipe-back / the X
  // button in ReportUpload — not just the very first mount.
  useEffect(() => {
    const id = location.state?.invoiceId ?? location.state?.admissionId;
    if (id) {
      const idStr = String(id);
      setSearchQuery(idStr);
      fetchRecord(idStr);
    }
  }, [location.key]);

  // The list is visible only when no search result / error state is showing.
  const showList = !searching && !record && !notFound && !invalidId && !deletedInfo;

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!showList || !el || !nextCursor) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showList, nextCursor, loadingMore]);

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (q) fetchRecord(q);
  };

  const handleScan = (text) => {
    const q = text.trim().toUpperCase();
    setSearchQuery(q);
    fetchRecord(q);
  };

  const handleClear = () => {
    setSearchQuery("");
    setRecord(null);
    setNotFound(false);
    setInvalidId(false);
    setDeletedInfo(null);
  };

  const handleDatesSaved = (testId, addedAt, dates) => {
    setRecord((prev) => ({
      ...prev,
      tests: prev.tests.map((t) =>
        t.testId !== testId || t.addedAt !== addedAt ? t : { ...t, report: { ...(t.report ?? {}), ...dates } },
      ),
    }));
    setPopup({ type: "success", message: "Dates saved" });
  };

  // Same as handleDatesSaved, but for a card inside the recent-invoices list.
  const handleListDatesSaved = (displayId, testId, addedAt, dates) => {
    setList((prev) =>
      prev.map((r) =>
        r.displayId !== displayId
          ? r
          : {
              ...r,
              tests: r.tests.map((t) =>
                t.testId !== testId || t.addedAt !== addedAt ? t : { ...t, report: { ...(t.report ?? {}), ...dates } },
              ),
            },
      ),
    );
    setPopup({ type: "success", message: "Dates saved" });
  };

  const handlePrintError = () => {
    setPopup({ type: "error", message: "Could not generate print. Please try again." });
  };

  return (
    <section className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4 py-6">
      {popup && <Popup type={popup.type} message={popup.message} onClose={() => setPopup(null)} />}
      {networkError && <Popup type="offline" onClose={() => setNetworkError(false)} />}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fu  { animation: fadeUp 0.4s cubic-bezier(.22,1,.36,1) both; }
        .fu1 { animation-delay: 60ms; }
        .fu2 { animation-delay: 120ms; }
      `}</style>

      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-5 fu">
          <div>
            <h1 className="text-2xl font-black text-gray-900 leading-tight">রিপোর্ট ম্যানেজমেন্ট</h1>
            <p className="text-xs text-gray-400 font-medium mt-1">ইনভয়েস বা ভর্তি আইডি দিয়ে রিপোর্ট খুঁজুন</p>
          </div>
          <Link
            to="/lab-management"
            className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white/60 text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2 text-sm font-semibold shadow-sm shrink-0"
          >
            <ArrowLeft className="w-4 h-4" /> ফিরে যান
          </Link>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm fu fu1">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Invoice ID or Admission ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full pl-9 pr-9 py-2.5 text-sm font-medium border border-gray-200 rounded-xl focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder-gray-300 text-gray-800 bg-gray-50 focus:bg-white font-['IBM_Plex_Mono']"
              />
              {searchQuery && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <ScanButton onScan={handleScan} />
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || searching}
              className="px-4 py-2.5 bg-gray-900 text-white hover:bg-gray-700 text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              Search
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[11px] text-gray-400 font-medium">e.g.</span>
            <span className="font-['IBM_Plex_Mono'] text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">
              090901
            </span>
            <span className="text-gray-300">·</span>
            <span className="font-['IBM_Plex_Mono'] text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">
              IP482XK
            </span>
          </div>
        </div>

        {searching && <RecordSkeleton />}

        {!searching && invalidId && (
          <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm fu fu2">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-sm font-black text-gray-800 mb-1.5">Unrecognized ID format</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Invoice:{" "}
              <span className="font-['IBM_Plex_Mono'] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-lg">
                090901
              </span>
              {"  ·  "}
              Admission:{" "}
              <span className="font-['IBM_Plex_Mono'] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-lg">
                IP482XK
              </span>
            </p>
          </div>
        )}

        {!searching && notFound && (
          <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center shadow-sm fu fu2">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-black text-gray-800 mb-1.5">No record found</p>
            <p className="text-xs text-gray-500">
              Nothing matched{" "}
              <span className="font-['IBM_Plex_Mono'] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-lg">
                #{searchQuery.toUpperCase()}
              </span>
            </p>
          </div>
        )}

        {!searching && deletedInfo && (
          <div className={`bg-white border ${RUST.border} rounded-2xl p-8 text-center shadow-sm fu fu2`}>
            <div
              className={`w-12 h-12 rounded-2xl ${RUST.bg} border ${RUST.border} flex items-center justify-center mx-auto mb-3`}
            >
              <Trash2 className={`w-6 h-6 ${RUST.text}`} />
            </div>
            <p className="text-sm font-black text-gray-800 mb-1.5">এই ইনভয়েসটি ডিলিট করা হয়েছে</p>
            <p className="text-xs text-gray-500">
              <span className="font-['IBM_Plex_Mono'] font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-lg">
                #{searchQuery.toUpperCase()}
              </span>{" "}
              {deletedInfo}
            </p>
          </div>
        )}

        {!searching && record && (
          <>
            <PrintId displayId={record.displayId} onError={handlePrintError} />
            <div className="fu fu2">
              <RecordCard
                key={record.displayId}
                record={record}
                onDatesSaved={handleDatesSaved}
                onNetworkError={() => setNetworkError(true)}
              />
            </div>
          </>
        )}

        {/* ── Recent invoices (hidden while a search result / error is showing) ── */}
        {showList && (
          <>
            {listLoading ? (
              <ListSkeleton />
            ) : list.length === 0 ? (
              <p className="text-center text-xs text-gray-400 font-medium py-10">No invoices yet</p>
            ) : (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3 px-1">
                  Recent invoices
                </p>
                <div className="space-y-3 fu fu2">
                  {list.map((r) => (
                    <RecordCard
                      key={r.displayId}
                      record={r}
                      onDatesSaved={(testId, addedAt, dates) =>
                        handleListDatesSaved(r.displayId, testId, addedAt, dates)
                      }
                      onNetworkError={() => setNetworkError(true)}
                    />
                  ))}
                </div>

                {nextCursor && <div ref={sentinelRef} className="h-10" />}
                {loadingMore && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                )}
                {!nextCursor && (
                  <p className="text-center text-[11px] text-gray-300 font-medium py-4">No more invoices</p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default Report;
