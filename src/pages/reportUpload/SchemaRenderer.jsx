// React Compiler active — no useCallback/useMemo
import { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  Info,
  TrendingUp,
  TrendingDown,
  User,
  RotateCcw,
  Send,
  AlertTriangle,
  Eye,
  ShieldCheck,
  Pencil,
  Save,
  Activity,
  Tag,
} from "lucide-react";

// ─── Age helpers ────────────────────────────────────────────────────────────
// Age is stored as { years, months, days } (any part may be absent, defaults
// to 0) — both for the patient's own age and for age-bracket boundaries
// inside a schema's standardRange. Both sides need to be compared the same
// way, so bracket bounds are converted through the same helper as the
// patient's age rather than parsed as plain numbers.

function hasAge(age) {
  return !!age && typeof age === "object" && age.years !== "" && age.years !== undefined && age.years !== null;
}

function ageToValue(age) {
  if (!age || typeof age !== "object") return null;
  const y = Number(age.years) || 0;
  const m = Number(age.months) || 0;
  const d = Number(age.days) || 0;
  return y * 365 + m * 30 + d;
}

function formatAge(age) {
  if (!age || typeof age !== "object") return "—";
  const { years = 0, months = 0, days = 0 } = age;
  if (!years && !months && !days) return "—";
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  return parts.join(", ");
}

// ─── Range logic ─────────────────────────────────────────────────────────────
// standardRange.data is tier-based: an array of { label, comparator, min,
// max } (Simple), or age/gender/combined brackets each holding such an
// array — mirrors SchemaBuilder exactly. There is no more plain min/max
// mode, so a field's range always resolves to a set of tiers to match the
// value against.

export function getStandardRangeInfo(field, patientAge, patientGender) {
  const sr = field.standardRange;
  if (!sr || sr.type === "none") return null;

  let tiers = [];
  if (sr.type === "simple" && Array.isArray(sr.data)) {
    tiers = sr.data;
  } else if (sr.type === "age" && hasAge(patientAge) && Array.isArray(sr.data)) {
    const ageVal = ageToValue(patientAge);
    const bracket = sr.data.find((b) => ageVal >= ageToValue(b.minAge) && ageVal <= ageToValue(b.maxAge));
    tiers = bracket?.tiers || [];
  } else if (sr.type === "gender" && patientGender && sr.data) {
    tiers = sr.data[patientGender] || [];
  } else if (sr.type === "combined" && hasAge(patientAge) && patientGender && Array.isArray(sr.data)) {
    const ageVal = ageToValue(patientAge);
    const bracket = sr.data.find(
      (b) => b.gender === patientGender && ageVal >= ageToValue(b.minAge) && ageVal <= ageToValue(b.maxAge),
    );
    tiers = bracket?.tiers || [];
  }

  if (!tiers || tiers.length === 0) return null;
  return { tiers };
}

function tierMatches(t, v) {
  const comparator = t.comparator || "between";
  const min = t.min === "" || t.min === null || t.min === undefined ? null : parseFloat(t.min);
  const max = t.max === "" || t.max === null || t.max === undefined ? null : parseFloat(t.max);
  switch (comparator) {
    case "gt":
      return min !== null && v > min;
    case "gte":
      return min !== null && v >= min;
    case "lt":
      return max !== null && v < max;
    case "lte":
      return max !== null && v <= max;
    case "between":
    default: {
      const lo = min === null ? -Infinity : min;
      const hi = max === null ? Infinity : max;
      return v >= lo && v <= hi;
    }
  }
}

export function evaluateStatus(value, rangeInfo) {
  if (!rangeInfo || value === "" || value === null || value === undefined) return null;
  const v = parseFloat(value);
  if (isNaN(v)) return null;

  const tier = rangeInfo.tiers.find((t) => tierMatches(t, v));
  if (!tier) return null;

  const label = (tier.label || "").toLowerCase();
  let status = "tag";
  if (/low/.test(label)) status = "low";
  else if (/high/.test(label)) status = "high";
  else if (/normal|unremarkable|negative/.test(label)) status = "normal";
  return { status, label: tier.label };
}

// Convenience for callers that already have a plain { min, max } (not a
// field's standardRange) and just want low/normal/high classification.
export function getRangeStatus(value, range) {
  if (!range || value === "" || value === null || value === undefined) return "neutral";
  const v = parseFloat(value);
  if (isNaN(v)) return "neutral";
  if (v < range.min) return "low";
  if (v > range.max) return "high";
  return "normal";
}

export function hydrateValuesFromReport(schema, existingReport) {
  if (!existingReport || !schema?.sections) return {};
  const values = {};
  schema.sections.forEach((section, si) => {
    const sectionData = existingReport[section.name];
    if (!sectionData) return;
    section.fields.forEach((field) => {
      const key = `${si}_${field.name}`;
      const fieldData = sectionData[field.name];
      if (!fieldData) return;
      values[key] = fieldData.value ?? fieldData;
    });
  });
  return values;
}

// ─── Payload builder ────────────────────────────────────────────────────────
// `name` on the payload now comes from the test itself (test.name / resolvedName),
// not the schema — a schema can be reused across multiple tests, so its own
// name isn't the right label for an individual report.
function buildPayload(schema, values, patientAge, patientGender, testName) {
  const report = {};
  schema.sections.forEach((sec, si) => {
    const sd = {};
    sec.fields.forEach((field) => {
      const key = `${si}_${field.name}`;
      const val = values[key];
      if (val !== "" && val !== undefined && val !== null && !(Array.isArray(val) && val.length === 0)) {
        const entry = {
          value: val,
          ...(field.unit ? { unit: field.unit } : {}),
        };
        if (field.type === "number") {
          const rangeInfo = getStandardRangeInfo(field, patientAge, patientGender);
          const evaluated = evaluateStatus(val, rangeInfo);
          if (evaluated) entry.referenceTag = evaluated.label;
        }
        sd[field.name] = entry;
      }
    });
    if (Object.keys(sd).length > 0) report[sec.name] = { ...sd, __showTitle: sec.showTitleInReport !== false };
  });

  return { ...report, name: testName ?? schema.name };
}

// ─── Shared UI primitives ──────────────────────────────────────────────────────

const STATUS_BADGE = {
  normal: { icon: CheckCircle2, label: "Normal", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  low: { icon: TrendingDown, label: "Low", cls: "bg-orange-50 text-orange-600 border-orange-200" },
  high: { icon: TrendingUp, label: "High", cls: "bg-red-50 text-red-600 border-red-200" },
  tag: { icon: Tag, label: null, cls: "bg-violet-50 text-violet-600 border-violet-200" },
};

const EditedBadge = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600 text-[10px] font-semibold shrink-0">
    <Pencil className="w-2.5 h-2.5" />
    edited
  </span>
);

const FieldError = ({ msg }) =>
  msg ? (
    <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5">
      <XCircle className="w-3 h-3 shrink-0" />
      {msg}
    </p>
  ) : null;

// ─── Field row shell: single pill container, prefix label box + value area ───
// Mirrors the Uiverse "container / prefix / input" pattern exactly.

function FieldRow({ field, isChanged, borderCls, footer, children }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div
        className={`flex items-stretch w-full bg-white rounded-[10px] border-2 overflow-hidden shadow-[0_2px_4px_rgba(0,0,0,0.1)] transition-colors ${
          borderCls || "border-slate-800"
        }`}
      >
        <span className="flex items-center justify-center shrink-0 px-3.5 bg-[#f0f0f0] text-[#666] text-sm font-semibold whitespace-nowrap">
          {field.name}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        {children}
      </div>
      {(footer || isChanged) && (
        <div className="flex items-center gap-2 flex-wrap px-0.5">
          {isChanged && <EditedBadge />}
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Field types ───────────────────────────────────────────────────────────────

function NumberField({ field, value, onChange, error, patientAge, patientGender, originalValue, isEditMode }) {
  const rangeInfo = getStandardRangeInfo(field, patientAge, patientGender);
  const evaluated = evaluateStatus(value, rangeInfo);
  const hasValue = value !== "" && value !== null && value !== undefined;
  const isChanged = isEditMode && originalValue !== undefined && String(value) !== String(originalValue ?? "");
  const badge = hasValue && evaluated && STATUS_BADGE[evaluated.status];

  let borderCls = "border-slate-800";
  if (error) borderCls = "border-red-500";
  else if (isChanged) borderCls = "border-violet-500";
  else if (evaluated?.status === "normal") borderCls = "border-emerald-500";
  else if (evaluated?.status === "low") borderCls = "border-orange-500";
  else if (evaluated?.status === "high") borderCls = "border-red-500";
  else if (evaluated?.status === "tag") borderCls = "border-violet-500";

  const footer =
    rangeInfo || badge ? (
      <>
        {rangeInfo && (
          <span className="text-[11px] text-slate-400 font-mono">Ranges set{field.unit ? ` (${field.unit})` : ""}</span>
        )}
        {badge && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${badge.cls}`}
          >
            <badge.icon className="w-2.5 h-2.5" />
            {badge.label || evaluated.label}
          </span>
        )}
      </>
    ) : null;

  return (
    <FieldRow field={field} isChanged={isChanged} borderCls={borderCls} footer={footer}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Blur on wheel so scrolling (mouse wheel / two-finger trackpad)
        // scrolls the page instead of being captured by the number input's
        // native up/down-step-on-scroll behavior, which was silently
        // changing the entered value while the user tried to scroll past it.
        onWheel={(e) => e.currentTarget.blur()}
        className="flex-1 min-w-0 px-3 py-2.5 bg-white text-sm font-mono text-slate-900 focus:outline-none"
      />
      {field.unit && (
        <span className="shrink-0 flex items-center px-3 bg-[#f0f0f0] border-l border-slate-200 text-xs font-medium text-slate-500">
          {field.unit}
        </span>
      )}
    </FieldRow>
  );
}

function ToggleGroup({ options, isSelected, onToggle, changedPredicate }) {
  return (
    <div className="flex flex-wrap gap-2 max-w-md">
      {options.map((opt) => {
        const sel = isSelected(opt);
        const changed = changedPredicate?.(opt, sel);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              sel
                ? changed
                  ? "bg-violet-600 border-violet-600 text-white"
                  : "bg-blue-600 border-blue-600 text-white"
                : changed
                  ? "bg-white border-violet-300 text-slate-600"
                  : "bg-white border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <span
              className={`w-3 h-3 rounded-full border-2 shrink-0 flex items-center justify-center ${
                sel ? "border-white" : "border-slate-300"
              }`}
            >
              {sel && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function RadioField({ field, options = [], value, onChange, error, originalValue, isEditMode }) {
  const isChanged = isEditMode && originalValue !== undefined && value !== (originalValue ?? "");
  return (
    <FieldRow field={field} isChanged={isChanged} footer={<FieldError msg={error} />}>
      <div className="flex-1 flex items-center px-3 py-2 bg-white">
        <ToggleGroup
          options={options}
          isSelected={(opt) => value === opt}
          onToggle={(opt) => onChange(value === opt ? "" : opt)}
          changedPredicate={(opt, sel) => isChanged && sel}
        />
      </div>
    </FieldRow>
  );
}

function CheckboxField({ field, options = [], value = [], onChange, error, originalValue, isEditMode }) {
  const toggle = (opt) => onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  const origArr = Array.isArray(originalValue) ? originalValue : [];
  const isChanged =
    isEditMode &&
    originalValue !== undefined &&
    JSON.stringify([...(value || [])].sort()) !== JSON.stringify([...origArr].sort());
  return (
    <FieldRow field={field} isChanged={isChanged} footer={<FieldError msg={error} />}>
      <div className="flex-1 flex items-center px-3 py-2 bg-white">
        <ToggleGroup
          options={options}
          isSelected={(opt) => value.includes(opt)}
          onToggle={toggle}
          changedPredicate={(opt, sel) => isEditMode && originalValue !== undefined && sel !== origArr.includes(opt)}
        />
      </div>
    </FieldRow>
  );
}

function DropdownField({ field, options = [], value, onChange, error, originalValue, isEditMode }) {
  const [open, setOpen] = useState(false);
  const isChanged = isEditMode && originalValue !== undefined && value !== (originalValue ?? "");

  return (
    <FieldRow field={field} isChanged={isChanged} footer={<FieldError msg={error} />}>
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-full h-full flex items-center justify-between px-3.5 py-2.5 bg-white text-sm font-medium transition-colors focus:outline-none ${
            value ? "text-slate-900" : "text-slate-400"
          }`}
        >
          <span>{value || "— নির্বাচন করুন —"}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute z-40 top-[calc(100%+4px)] left-0 right-0 bg-white border-2 border-slate-800 rounded-[10px] shadow-lg overflow-y-auto max-h-52">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between text-left px-3.5 py-2.5 text-sm transition-colors ${
                  value === opt ? "bg-slate-800 text-white font-semibold" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt}
                {value === opt && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </FieldRow>
  );
}

function TextareaField({ field, value, onChange, error, originalValue, isEditMode }) {
  const isChanged = isEditMode && originalValue !== undefined && value !== (originalValue ?? "");
  return (
    <FieldRow field={field} isChanged={isChanged} footer={<FieldError msg={error} />}>
      <div className="flex-1 flex flex-col bg-white">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength}
          rows={3}
          className="w-full px-3.5 py-2.5 bg-transparent text-sm text-slate-900 focus:outline-none resize-none font-noto"
        />
        <div className="text-right text-[10px] font-mono text-slate-400 px-3 pb-1.5">
          {(value || "").length}/{field.maxLength}
        </div>
      </div>
    </FieldRow>
  );
}

function TextInputField({ field, value, onChange, error, originalValue, isEditMode }) {
  const isChanged = isEditMode && originalValue !== undefined && value !== (originalValue ?? "");
  return (
    <FieldRow field={field} isChanged={isChanged} footer={<FieldError msg={error} />}>
      <div className="relative flex-1 flex items-center bg-white">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength}
          className="w-full px-3.5 py-2.5 bg-transparent text-sm text-slate-900 focus:outline-none font-noto"
          style={{ paddingRight: field.maxLength ? "48px" : undefined }}
        />
        {field.maxLength && (
          <span className="absolute right-3.5 text-[10px] font-mono text-slate-300">
            {(value || "").length}/{field.maxLength}
          </span>
        )}
      </div>
    </FieldRow>
  );
}

// ─── Section panel ─────────────────────────────────────────────────────────────

function SectionPanel({
  section,
  sectionIndex,
  values,
  onChange,
  errors,
  patientAge,
  patientGender,
  hideTitle,
  originalValues,
  isEditMode,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const fieldCount = section.fields.length;
  const filledCount = section.fields.filter((f) => {
    const v = values[`${sectionIndex}_${f.name}`];
    return Array.isArray(v) ? v.length > 0 : v !== "" && v !== undefined && v !== null;
  }).length;
  const hasError = section.fields.some((f) => errors[`${sectionIndex}_${f.name}`]);
  const complete = filledCount === fieldCount && fieldCount > 0;
  const pct = fieldCount > 0 ? (filledCount / fieldCount) * 100 : 0;

  const rows = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 px-5 py-4">
      {section.fields.map((field) => {
        const key = `${sectionIndex}_${field.name}`;
        const val = values[key] ?? (field.type === "checkbox" ? [] : "");
        const err = errors[key];
        const origVal = originalValues ? originalValues[key] : undefined;
        return (
          <div key={key} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
            {field.type === "number" && (
              <NumberField
                field={field}
                value={val}
                onChange={(v) => onChange(key, v)}
                error={err}
                patientAge={patientAge}
                patientGender={patientGender}
                originalValue={origVal}
                isEditMode={isEditMode}
              />
            )}
            {field.type === "radio" && (
              <RadioField
                field={field}
                options={field.options}
                value={val}
                onChange={(v) => onChange(key, v)}
                error={err}
                originalValue={origVal}
                isEditMode={isEditMode}
              />
            )}
            {field.type === "select" && (
              <DropdownField
                field={field}
                options={field.options}
                value={val}
                onChange={(v) => onChange(key, v)}
                error={err}
                originalValue={origVal}
                isEditMode={isEditMode}
              />
            )}
            {field.type === "checkbox" && (
              <CheckboxField
                field={field}
                options={field.options}
                value={val}
                onChange={(v) => onChange(key, v)}
                error={err}
                originalValue={origVal}
                isEditMode={isEditMode}
              />
            )}
            {field.type === "textarea" && (
              <TextareaField
                field={field}
                value={val}
                onChange={(v) => onChange(key, v)}
                error={err}
                originalValue={origVal}
                isEditMode={isEditMode}
              />
            )}
            {field.type === "input" && (
              <TextInputField
                field={field}
                value={val}
                onChange={(v) => onChange(key, v)}
                error={err}
                originalValue={origVal}
                isEditMode={isEditMode}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  if (hideTitle) return <div className="bg-white rounded-xl py-1">{rows}</div>;

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${hasError ? "border-red-200" : "border-slate-200"}`}
    >
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full flex items-center gap-3 px-5 py-3.5 text-left border-b transition-colors ${
          hasError
            ? "bg-red-50 border-red-200 hover:bg-red-100/70"
            : "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
        }`}
      >
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-mono font-semibold shrink-0 border ${
            complete
              ? "bg-blue-600 border-blue-600 text-white"
              : hasError
                ? "bg-red-500 border-red-500 text-white"
                : "bg-white border-slate-300 text-slate-500"
          }`}
        >
          {sectionIndex + 1}
        </div>
        <span className="flex-1 text-sm font-semibold text-slate-800 tracking-tight">{section.name}</span>
        <span
          className={`font-mono text-[11px] px-2.5 py-1 rounded-full border ${
            complete ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-200 text-slate-400"
          }`}
        >
          {filledCount}/{fieldCount}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${!collapsed ? "rotate-180" : ""}`}
        />
      </button>
      <div className="h-[2px] bg-slate-100">
        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      {!collapsed && rows}
    </div>
  );
}

// ─── Patient banner ─────────────────────────────────────────────────────────────

function PatientBanner({ invoice }) {
  const { patient } = invoice;
  const cells = [
    { label: "Full Name", val: patient.name },
    { label: "Age", val: formatAge(patient.age) },
    { label: "Gender", val: patient.gender, cap: true },
    { label: "Contact", val: patient.contactNumber },
  ];
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 border-b border-slate-200">
        <User className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Patient Record</span>
        <span className="ml-auto font-mono text-[10px] text-slate-400">{invoice.invoiceId}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100">
        {cells.map((c) => (
          <div key={c.label} className="px-5 py-3.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{c.label}</div>
            <div className={`text-sm font-semibold text-slate-900 ${c.cap ? "capitalize" : ""}`}>{c.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Alert banner ─────────────────────────────────────────────────────────────

const ALERT_STYLES = {
  amber: {
    wrap: "bg-amber-50 border-amber-400",
    title: "text-amber-800",
    body: "text-amber-700",
    icon: "text-amber-500",
  },
  red: { wrap: "bg-red-50 border-red-400", title: "text-red-800", body: "text-red-700", icon: "text-red-500" },
  violet: {
    wrap: "bg-violet-50 border-violet-400",
    title: "text-violet-800",
    body: "text-violet-700",
    icon: "text-violet-500",
  },
};

function Alert({ tone, icon: Icon, title, children }) {
  const s = ALERT_STYLES[tone];
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border-l-4 ${s.wrap}`}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.icon}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${s.title}`}>{title}</div>
        <div className={`text-[13px] leading-relaxed break-words ${s.body}`}>{children}</div>
      </div>
    </div>
  );
}

// ─── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, tone }) {
  const toneCls = {
    default: "text-slate-900",
    green: "text-emerald-600",
    red: "text-red-600",
    violet: "text-violet-600",
    blue: "text-blue-600",
  };
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{label}</div>
      <div className={`font-mono text-xl font-semibold leading-none ${toneCls[tone] || toneCls.default}`}>{value}</div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
// `testName` (the test's own name, e.g. from ReportUpload's `resolvedName` /
// the Report page's `test.name`) is now the source of truth for the report's
// `name` field — the schema's own name is only used as a fallback when
// testName isn't available.
function SchemaRenderer({
  schema,
  invoice,
  onSubmit,
  onUpdate,
  loading = false,
  existingReport = null,
  testName = null,
}) {
  const isEditMode = Boolean(existingReport);
  const computeInitial = () => (isEditMode ? hydrateValuesFromReport(schema, existingReport) : {});

  const [values, setValues] = useState(computeInitial);
  const [errors, setErrors] = useState({});
  const [originalValues] = useState(() => (isEditMode ? hydrateValuesFromReport(schema, existingReport) : {}));
  const patientAge = invoice?.patient?.age ?? existingReport?.patientAge ?? "";
  const patientGender = invoice?.patient?.gender ?? existingReport?.patientGender ?? "";

  useEffect(() => {
    setValues(computeInitial());
    setErrors({});
  }, [JSON.stringify(schema?.sections), JSON.stringify(existingReport)]);

  if (!schema || !schema.sections) return null;

  const handleChange = (key, val) => {
    setValues((v) => ({ ...v, [key]: val }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const errs = {};
    schema.sections.forEach((sec, si) => {
      sec.fields.forEach((field) => {
        if (!field.required) return;
        const key = `${si}_${field.name}`;
        const val = values[key];
        if (field.type === "checkbox") {
          if (!val || val.length === 0) errs[key] = "At least one option is required";
        } else if (val === "" || val === undefined || val === null) {
          errs[key] = "This field is required";
        }
      });
    });
    return errs;
  };

  const allKeys = schema.sections.flatMap((sec, si) => sec.fields.map((f) => `${si}_${f.name}`));

  const changedCount = isEditMode
    ? Object.keys(originalValues).filter((k) => {
        const cur = values[k],
          orig = originalValues[k];
        if (Array.isArray(orig)) return JSON.stringify([...(cur || [])].sort()) !== JSON.stringify([...orig].sort());
        return String(cur ?? "") !== String(orig ?? "");
      }).length
    : 0;

  const newlyFilled = isEditMode
    ? allKeys.filter((k) => {
        const cur = values[k],
          orig = originalValues[k];
        const empty = (v) => v === "" || v === undefined || v === null || (Array.isArray(v) && v.length === 0);
        return empty(orig) && !empty(cur);
      }).length
    : 0;

  const totalChanges = changedCount + newlyFilled;

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    const payload = buildPayload(schema, values, patientAge, patientGender, testName);
    if (isEditMode) onUpdate?.(payload);
    else onSubmit?.(payload);
  };

  const handleReset = () => {
    setValues(isEditMode ? hydrateValuesFromReport(schema, existingReport) : {});
    setErrors({});
  };

  const hasFields = schema.sections.some((s) => s.fields.length > 0);
  const totalFields = allKeys.length;
  const totalFilled = allKeys.filter((k) => {
    const v = values[k];
    return Array.isArray(v) ? v.length > 0 : v !== "" && v !== undefined && v !== null;
  }).length;
  const progress = totalFields > 0 ? (totalFilled / totalFields) * 100 : null;

  const numStatuses = schema.sections.flatMap((sec, si) =>
    sec.fields
      .filter((f) => f.type === "number")
      .map((f) => {
        const rangeInfo = getStandardRangeInfo(f, patientAge, patientGender);
        return evaluateStatus(values[`${si}_${f.name}`], rangeInfo);
      }),
  );
  const abnormalCount = numStatuses.filter((s) => s && (s.status === "high" || s.status === "low")).length;
  const normalCount = numStatuses.filter((s) => s && s.status === "normal").length;

  if (!hasFields) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center px-4 font-noto">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm mb-4">
            <Eye className="w-6 h-6 text-slate-300" />
          </div>
          <p className="font-semibold text-slate-600 text-sm">No fields configured</p>
          <p className="text-slate-400 text-sm mt-1">Add fields in the Builder to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-6 px-4 sm:px-6 lg:px-8 font-noto">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Edit mode ribbon */}
        {isEditMode && (
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            <Pencil className="w-3.5 h-3.5" />
            <span className="font-bold uppercase tracking-wide text-[11px]">Edit Mode</span>
            <span className="font-mono text-[11px] opacity-70">— Modifying existing report</span>
            {totalChanges > 0 && (
              <span className="ml-auto font-mono text-[10px] bg-violet-600/10 text-violet-700 px-2.5 py-0.5 rounded-full font-semibold">
                {totalChanges} change{totalChanges !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}

        {/* Header card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-start gap-4 mb-5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${isEditMode ? "bg-violet-600" : "bg-blue-600"}`}
            >
              {isEditMode ? <Pencil className="w-5 h-5 text-white" /> : <Activity className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wide text-slate-400 mb-1">
                <span>{isEditMode ? "Lab Report · Edit" : "Lab Report Entry"}</span>
                <span className="w-[3px] h-[3px] rounded-full bg-slate-300" />
                <span className={schema.isActive ? "text-emerald-500" : "text-slate-400"}>
                  {schema.isActive ? "● Active" : "○ Inactive"}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {testName || schema.name || "Untitled Schema"}
              </h1>
              {schema.description && (
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">{schema.description}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {progress !== null && (
              <StatTile
                label="Progress"
                value={`${Math.round(progress)}%`}
                tone={progress === 100 ? "green" : "blue"}
              />
            )}
            <StatTile label="Filled" value={`${totalFilled}/${totalFields}`} />
            <StatTile label="In Range" value={normalCount} tone={normalCount > 0 ? "green" : "default"} />
            <StatTile label="Abnormal" value={abnormalCount} tone={abnormalCount > 0 ? "red" : "default"} />
            {isEditMode && (
              <StatTile label="Changes" value={totalChanges} tone={totalChanges > 0 ? "violet" : "default"} />
            )}
          </div>

          {progress !== null && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Completion</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {totalFilled} / {totalFields} fields
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Alerts */}
        {abnormalCount > 0 && (
          <Alert tone="amber" icon={AlertTriangle} title="Abnormal Values Detected">
            {abnormalCount} result{abnormalCount > 1 ? "s" : ""} outside the standard reference range — please review
            before submitting.
          </Alert>
        )}

        {isEditMode && totalChanges > 0 && (
          <Alert tone="violet" icon={Pencil} title="Unsaved Changes">
            {totalChanges} change{totalChanges !== 1 ? "s" : ""} pending. Edited fields are highlighted in purple. Click{" "}
            <strong>Update Report</strong> to save.
          </Alert>
        )}

        {/* Patient banner */}
        {invoice && <PatientBanner invoice={invoice} />}

        {/* Sections */}
        <div className="space-y-3">
          {schema.sections.map((section, si) => (
            <SectionPanel
              key={si}
              section={section}
              sectionIndex={si}
              values={values}
              onChange={handleChange}
              errors={errors}
              patientAge={patientAge}
              patientGender={patientGender}
              hideTitle={section.showTitleInReport === false}
              originalValues={isEditMode ? originalValues : undefined}
              isEditMode={isEditMode}
            />
          ))}
        </div>

        {/* Static range note — rendered with whitespace-pre-wrap so
            newlines/spacing in the DB value (e.g. a multi-line reference
            table) render exactly as stored, instead of being collapsed
            into a single line by default HTML whitespace handling. */}
        {schema.hasStaticStandardRange && schema.staticStandardRange && (
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800">Standard Reference</h3>
            </div>
            <div className="bg-amber-50/40 p-4">
              <p className="text-xs font-semibold text-black whitespace-pre-wrap leading-relaxed">
                {schema.staticStandardRange}
              </p>
            </div>
          </div>
        )}

        {/* Validation errors */}
        {Object.keys(errors).length > 0 && (
          <Alert tone="red" icon={XCircle} title="Validation Failed">
            {Object.keys(errors).length} field{Object.keys(errors).length > 1 ? "s" : ""} require attention before
            submitting.
          </Alert>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-between flex-wrap gap-3 bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="font-mono text-[11px]">
              {isEditMode ? "Editing existing report" : "Form validated on submit"}
            </span>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleReset}
              title={isEditMode ? "Revert all changes" : "Clear all fields"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:border-slate-400 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isEditMode ? "Revert" : "Reset"}
            </button>
            <button
              type="button"
              disabled={loading || (isEditMode && totalChanges === 0)}
              onClick={handleSubmit}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isEditMode ? "bg-violet-600 hover:bg-violet-700" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? (
                <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
              ) : isEditMode ? (
                <Save className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {loading
                ? isEditMode
                  ? "Updating…"
                  : "Submitting…"
                : isEditMode
                  ? totalChanges > 0
                    ? `Update Report (${totalChanges})`
                    : "No Changes"
                  : "Submit Report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SchemaRenderer;
