/**
 * RangeOverridesPanel — shows the admin's default reference values + units for
 * the report format attached to a test, and lets the lab override them.
 * Overrides are stored on the test at `test.schema.overrides`, one entry per
 * field, keyed by section name + field name (unique within a schema) and the
 * schemaId it was made on. An entry holds only the
 * keys that differ from the admin default, so a key's presence = it was changed.
 *
 * Editable per field type:
 *   number          → standardRange (none / simple / age / gender) + unit
 *   input, textarea → referenceValue (none / key-value / text / textarea) + unit
 *   radio, select, checkbox → nothing (the builder gives them no range/unit)
 *
 * Effective value per key = override ?? admin default.
 *
 * Styling matches TestConfigPage (same tokens). If you'd rather not duplicate
 * them, move the tokens into a shared file and import from both places.
 */
import { useEffect, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import testConfigService from "../../../api/testConfig";

// ─── tokens (same as TestConfigPage) ─────────────────────────────────────────
const accent = "#155E63";
const accentSoft = "#EAF3F2";
const ink = "#111827";
const sub = "#6B7280";
const line = "#E5E7EB";
const danger = "#B42318";
const sansCls = "font-['Inter','IBM_Plex_Sans',system-ui,sans-serif]";
const fieldStyle = { border: `1px solid ${line}`, background: "#fff", color: ink };

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";
const getErrorMessage = (err, fallback) =>
  err?.response?.status === 403 ? PERMISSION_DENIED_MESSAGE : (err?.response?.data?.error ?? fallback);
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// ─── shared shape helpers ────────────────────────────────────────────────────

export const idOf = (x) => String(x?._id ?? x?.id ?? "");
const emptyRange = () => ({ type: "none", data: [] });
const emptyRef = () => ({ type: "none", data: {} });
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
// `id` keys are client-side row ids — ignore them when comparing.
const same = (a, b) =>
  JSON.stringify(a ?? null, (k, v) => (k === "id" ? undefined : v)) ===
  JSON.stringify(b ?? null, (k, v) => (k === "id" ? undefined : v));

const RANGE_TYPES = ["number"];
const REF_TYPES = ["input", "textarea"];
const EDITABLE_TYPES = [...RANGE_TYPES, ...REF_TYPES];
const valueKeyFor = (type) => (type === "number" ? "standardRange" : "referenceValue");

// Old Key-Value data was a flat [{key,value}] list; wrap it in one ungrouped group.
const normalizeRef = (ref) => {
  const type = ref?.type || "none";
  if (type === "keyvalue") {
    const data = Array.isArray(ref.data) ? ref.data : [];
    const grouped = data.every((i) => i && Array.isArray(i.pairs));
    return { type, data: grouped ? data : [{ id: Date.now() + Math.random(), header: "", pairs: data }] };
  }
  return { type, data: ref?.data ?? {} };
};

const defaultsOf = (field) => ({
  standardRange: field.standardRange ?? emptyRange(),
  referenceValue: normalizeRef(field.referenceValue ?? emptyRef()),
  unit: field.unit ?? "",
});

const findOverride = (overrides, schemaId, sectionName, fieldName) =>
  (overrides ?? []).find(
    (o) => String(o.schemaId) === String(schemaId) && o.sectionName === sectionName && o.fieldName === fieldName,
  );

/**
 * Returns a copy of the schema with this test's overrides applied.
 * Use the same logic wherever a report is rendered (ReportPDF / print builder /
 * the public report backend) so reports show the lab's values, not the admin's.
 */
export const applyOverrides = (schema, overrides) => {
  if (!schema) return schema;
  return {
    ...schema,
    sections: (schema.sections ?? []).map((sec) => ({
      ...sec,
      fields: (sec.fields ?? []).map((f) => {
        const o = findOverride(overrides, schema._id, sec.name, f.name);
        if (!o) return f;
        return {
          ...f,
          ...(o.standardRange !== undefined ? { standardRange: o.standardRange } : {}),
          ...(o.referenceValue !== undefined ? { referenceValue: o.referenceValue } : {}),
          ...(o.unit !== undefined ? { unit: o.unit } : {}),
        };
      }),
    })),
  };
};

// ─── age display helpers ─────────────────────────────────────────────────────

const isNoLimit = (a) => !!a && Number(a.years) === 150 && Number(a.months) === 11 && Number(a.days) === 31;

const ageText = (a) => {
  if (!a) return "";
  const y = Number(a.years) || 0;
  const m = Number(a.months) || 0;
  const d = Number(a.days) || 0;
  return `${y ? `${y}y` : ""}${m ? `${m}m` : ""}${d ? `${d}d` : ""}` || "0y";
};

// ─── read-only summaries ─────────────────────────────────────────────────────

const tierText = (t) => {
  const c = t.comparator || "between";
  const cond =
    c === "between"
      ? `${t.min ?? ""} – ${t.max ?? ""}`
      : c === "gt"
        ? `> ${t.min ?? ""}`
        : c === "gte"
          ? `≥ ${t.min ?? ""}`
          : c === "lt"
            ? `< ${t.max ?? ""}`
            : `≤ ${t.max ?? ""}`;
  return `${t.label || "—"}: ${cond}`;
};

const TierLines = ({ tiers }) =>
  (tiers ?? []).length === 0 ? (
    <span style={{ color: sub }}>—</span>
  ) : (
    <>
      {tiers.map((t, i) => (
        <div key={t.id ?? i}>{tierText(t)}</div>
      ))}
    </>
  );

export const RangeSummary = ({ range }) => {
  const type = range?.type ?? "none";
  const data = range?.data;
  if (type === "none") return <span style={{ color: sub }}>রেঞ্জ নেই</span>;
  if (type === "simple") return <TierLines tiers={data} />;
  if (type === "age")
    return (
      <div className="space-y-1.5">
        {(data ?? []).map((b, i) => (
          <div key={i}>
            <div style={{ color: sub }}>
              {ageText(b.minAge)} – {isNoLimit(b.maxAge) ? "∞" : ageText(b.maxAge)}
            </div>
            <TierLines tiers={b.tiers} />
          </div>
        ))}
      </div>
    );
  return (
    <div className="space-y-1.5">
      {[
        ["male", "পুরুষ"],
        ["female", "নারী"],
        ["other", "অন্যান্য"],
      ].map(([k, label]) =>
        (data?.[k] ?? []).length ? (
          <div key={k}>
            <div style={{ color: sub }}>{label}</div>
            <TierLines tiers={data[k]} />
          </div>
        ) : null,
      )}
    </div>
  );
};

export const RefSummary = ({ refValue }) => {
  const type = refValue?.type ?? "none";
  const data = refValue?.data;
  if (type === "none") return <span style={{ color: sub }}>রেফারেন্স নেই</span>;
  if (type === "text" || type === "textarea")
    return data?.value ? (
      <div className="whitespace-pre-wrap">{data.value}</div>
    ) : (
      <span style={{ color: sub }}>—</span>
    );
  const groups = Array.isArray(data) ? data : [];
  if (groups.length === 0) return <span style={{ color: sub }}>—</span>;
  return (
    <div className="space-y-1.5">
      {groups.map((g, gi) => (
        <div key={g.id ?? gi}>
          {g.header && <div style={{ color: sub }}>{g.header}</div>}
          {(g.pairs ?? [])
            .filter((p) => p.key || p.value)
            .map((p, pi) => (
              <div key={p.id ?? pi}>
                {p.key}: {p.value}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
};

// ─── editors — values only ───────────────────────────────────────────────────
// Labels, conditions, age brackets, headers, keys and the range/reference type
// are shown but locked. Nothing can be added or removed; only the numbers
// (min / max), the reference text/values and the unit can be changed.

const inputCls = `${sansCls} text-[12.5px] rounded-md px-2 py-1.5 outline-none`;
const noWheel = (e) => e.currentTarget.blur();
const COMPARATOR_LABEL = { between: "মধ্যে", gt: ">", gte: "≥", lt: "<", lte: "≤" };

const Locked = ({ children, className = "" }) => (
  <span className={`${sansCls} text-[12.5px] ${className}`} style={{ color: ink }}>
    {children}
  </span>
);

const NumInput = ({ value, onChange, placeholder }) => (
  <input
    type="number"
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value)}
    onWheel={noWheel}
    placeholder={placeholder}
    className={`${inputCls} w-20`}
    style={fieldStyle}
  />
);

const TierValuesEditor = ({ tiers = [], onChange }) => {
  const rows = Array.isArray(tiers) ? tiers : [];
  if (rows.length === 0) return <span style={{ color: sub }}>—</span>;
  const update = (i, patch) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-1.5">
      {rows.map((t, i) => {
        const c = t.comparator || "between";
        const showMin = c === "between" || c === "gt" || c === "gte";
        const showMax = c === "between" || c === "lt" || c === "lte";
        return (
          <div key={t.id ?? i} className="flex flex-wrap items-center gap-1.5">
            <Locked className="w-28 truncate">{t.label || "—"}</Locked>
            <span className={`${sansCls} text-[12px]`} style={{ color: sub }}>
              {COMPARATOR_LABEL[c]}
            </span>
            {showMin && <NumInput value={t.min} onChange={(v) => update(i, { min: v })} />}
            {c === "between" && <span style={{ color: sub }}>–</span>}
            {showMax && <NumInput value={t.max} onChange={(v) => update(i, { max: v })} />}
          </div>
        );
      })}
    </div>
  );
};

const GroupBox = ({ title, children }) => (
  <div className="p-2.5 rounded-lg space-y-1.5" style={{ border: `1px solid ${line}`, background: "#fff" }}>
    {title && (
      <p className={`${sansCls} text-[12px] font-medium`} style={{ color: sub }}>
        {title}
      </p>
    )}
    {children}
  </div>
);

const RangeEditor = ({ value, onChange }) => {
  const type = value?.type ?? "none";
  const data = value?.data;

  if (type === "none")
    return (
      <p className={`${sansCls} text-[12.5px]`} style={{ color: sub }}>
        এই ফিল্ডে কোনো রেঞ্জ নেই।
      </p>
    );

  if (type === "simple") return <TierValuesEditor tiers={data} onChange={(d) => onChange({ type, data: d })} />;

  if (type === "age") {
    const brackets = Array.isArray(data) ? data : [];
    const setTiers = (i, tiers) =>
      onChange({ type, data: brackets.map((b, idx) => (idx === i ? { ...b, tiers } : b)) });
    return (
      <div className="space-y-2">
        {brackets.map((b, i) => (
          <GroupBox key={i} title={`${ageText(b.minAge)} – ${isNoLimit(b.maxAge) ? "∞" : ageText(b.maxAge)}`}>
            <TierValuesEditor tiers={b.tiers} onChange={(tiers) => setTiers(i, tiers)} />
          </GroupBox>
        ))}
      </div>
    );
  }

  // gender
  return (
    <div className="space-y-2">
      {[
        ["male", "পুরুষ"],
        ["female", "নারী"],
        ["other", "অন্যান্য"],
      ].map(([k, label]) =>
        (data?.[k] ?? []).length ? (
          <GroupBox key={k} title={label}>
            <TierValuesEditor tiers={data[k]} onChange={(tiers) => onChange({ type, data: { ...data, [k]: tiers } })} />
          </GroupBox>
        ) : null,
      )}
    </div>
  );
};

const RefEditor = ({ value, onChange }) => {
  const type = value?.type ?? "none";
  const data = value?.data;

  if (type === "none")
    return (
      <p className={`${sansCls} text-[12.5px]`} style={{ color: sub }}>
        এই ফিল্ডে কোনো রেফারেন্স মান নেই। শুধু ইউনিট পরিবর্তন করা যাবে।
      </p>
    );

  if (type === "text")
    return (
      <input
        value={data?.value || ""}
        onChange={(e) => onChange({ type, data: { ...data, value: e.target.value } })}
        className={`${inputCls} w-full`}
        style={fieldStyle}
      />
    );

  if (type === "textarea")
    return (
      <textarea
        value={data?.value || ""}
        onChange={(e) => onChange({ type, data: { ...data, value: e.target.value } })}
        rows={3}
        className={`${inputCls} w-full resize-none`}
        style={fieldStyle}
      />
    );

  // keyvalue — headers and keys are locked, only each value is editable
  const groups = Array.isArray(data) ? data : [];
  const setPairValue = (gi, pi, v) =>
    onChange({
      type,
      data: groups.map((g, gidx) =>
        gidx === gi ? { ...g, pairs: g.pairs.map((p, pidx) => (pidx === pi ? { ...p, value: v } : p)) } : g,
      ),
    });

  return (
    <div className="space-y-2">
      {groups.map((g, gi) => (
        <GroupBox key={g.id ?? gi} title={g.header || null}>
          {(g.pairs ?? []).map((pr, pi) =>
            !pr.key ? null : (
              <div key={pr.id ?? pi} className="flex items-center gap-2">
                <Locked className="w-32 truncate">{pr.key}</Locked>
                <input
                  value={pr.value}
                  onChange={(e) => setPairValue(gi, pi, e.target.value)}
                  className={`${inputCls} flex-1 min-w-0`}
                  style={fieldStyle}
                />
              </div>
            ),
          )}
        </GroupBox>
      ))}
    </div>
  );
};

// ─── one field row ───────────────────────────────────────────────────────────

const Badge = ({ children, bg = accentSoft, color = accent }) => (
  <span className={`${sansCls} text-[11px] rounded-full px-2 py-0.5`} style={{ background: bg, color }}>
    {children}
  </span>
);

const FieldRow = ({ testId, section, field, override, onSaved, onNetworkError }) => {
  const valueKey = valueKeyFor(field.type); // "standardRange" | "referenceValue"
  const isRange = valueKey === "standardRange";

  const defaults = defaultsOf(field);
  const effValue = override?.[valueKey] ?? defaults[valueKey];
  const effUnit = override?.unit ?? defaults.unit;

  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(effValue);
  const [draftUnit, setDraftUnit] = useState(effUnit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn, fallback) => {
    setSaving(true);
    setError("");
    try {
      const res = await fn();
      onSaved(res.data);
      setEditing(false);
    } catch (err) {
      if (isNetworkError(err)) {
        setError("ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করুন।");
        onNetworkError?.();
      } else setError(getErrorMessage(err, fallback));
    } finally {
      setSaving(false);
    }
  };

  // Send only what differs from the admin default. The server replaces this
  // field's entry with exactly this; nothing differs → the entry is removed
  // (so editing back to the default is also how you undo an override).
  const save = () => {
    const payload = { sectionName: section.name, fieldName: field.name };
    if (!same(draftValue, defaults[valueKey])) payload[valueKey] = draftValue;
    if (draftUnit.trim() !== defaults.unit) payload.unit = draftUnit.trim();
    return run(() => testConfigService.saveRangeOverride(testId, payload), "সংরক্ষণ ব্যর্থ হয়েছে।");
  };

  const startEdit = () => {
    setDraftValue(clone(effValue));
    setDraftUnit(effUnit);
    setError("");
    setEditing(true);
  };

  return (
    <div className="px-3 py-2.5" style={{ borderTop: `1px solid ${line}` }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`${sansCls} text-[13px] font-medium flex-1 min-w-0 truncate`} style={{ color: ink }}>
          {field.name}
        </span>
        {override && <Badge>পরিবর্তিত</Badge>}
        {!editing && (
          <button type="button" onClick={startEdit} title="সম্পাদনা">
            <Pencil className="w-3.5 h-3.5" style={{ color: sub }} />
          </button>
        )}
      </div>

      {!editing ? (
        <div className={`${sansCls} text-[12.5px] mt-1.5`} style={{ color: ink }}>
          {isRange ? <RangeSummary range={effValue} /> : <RefSummary refValue={effValue} />}
          <div className="mt-1" style={{ color: sub }}>
            ইউনিট: {effUnit || "—"}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <div>
            <p className={`${sansCls} text-[12px] mb-1`} style={{ color: sub }}>
              ইউনিট (ডিফল্ট: {defaults.unit || "—"})
            </p>
            <input
              value={draftUnit}
              onChange={(e) => setDraftUnit(e.target.value)}
              maxLength={40}
              placeholder="যেমনঃ g/dL"
              className={`${inputCls} w-40`}
              style={fieldStyle}
            />
          </div>
          <div>
            <p className={`${sansCls} text-[12px] mb-1`} style={{ color: sub }}>
              {isRange ? "রেফারেন্স রেঞ্জ" : "রেফারেন্স মান"}
            </p>
            {isRange ? (
              <RangeEditor value={draftValue} onChange={setDraftValue} />
            ) : (
              <RefEditor value={draftValue} onChange={setDraftValue} />
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={`${sansCls} text-[12.5px] font-medium text-white rounded-lg px-3.5 py-1.5`}
              style={{ background: saving ? "#9CA3AF" : accent }}
            >
              {saving ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={`${sansCls} text-[12.5px]`}
              style={{ color: sub }}
            >
              বাতিল
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className={`${sansCls} text-[12.5px] mt-1.5`} style={{ color: danger }}>
          {error}
        </p>
      )}
    </div>
  );
};

// ─── panel ───────────────────────────────────────────────────────────────────

const RangeOverridesPanel = ({ test, onSaved, onNetworkError, hideTitle = false }) => {
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSchema(null);
    setError("");
    if (!test.schemaId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await testConfigService.getSchemaBySchemaId(test.schemaId);
        setSchema(res.data);
      } catch (err) {
        if (isNetworkError(err)) {
          setError("ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করুন।");
          onNetworkError?.();
        } else setError(getErrorMessage(err, "রেঞ্জ লোড করা যায়নি।"));
      } finally {
        setLoading(false);
      }
    })();
  }, [test._id, test.schemaId]);

  const overrides = test.schema?.overrides ?? [];
  // The API returns the updated test — merge its `schema` back into the list.
  const handleSaved = (updatedTest) => onSaved?.({ ...test, schema: updatedTest.schema });

  const sections = (schema?.sections ?? [])
    .map((sec) => ({ sec, fields: (sec.fields ?? []).filter((f) => EDITABLE_TYPES.includes(f.type)) }))
    .filter((s) => s.fields.length > 0);

  return (
    <div>
      {!hideTitle && (
        <p className={`${sansCls} text-[13px] font-medium mb-2`} style={{ color: ink }}>
          রেফারেন্স রেঞ্জ ও ইউনিট
        </p>
      )}
      {!test.schemaId ? (
        <p className={`${sansCls} text-[13px]`} style={{ color: sub }}>
          আগে একটি রিপোর্ট ফরম্যাট সংরক্ষণ করুন।
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: accent }} />
          <span className={`${sansCls} text-[13px]`} style={{ color: sub }}>
            লোড হচ্ছে…
          </span>
        </div>
      ) : error ? (
        <p className={`${sansCls} text-[12.5px]`} style={{ color: danger }}>
          {error}
        </p>
      ) : sections.length === 0 ? (
        <p className={`${sansCls} text-[13px]`} style={{ color: sub }}>
          এই ফরম্যাটে সম্পাদনাযোগ্য কোনো ফিল্ড নেই।
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map(({ sec, fields }) => (
            <div key={idOf(sec) || sec.name} className="rounded-lg bg-white" style={{ border: `1px solid ${line}` }}>
              <p className={`${sansCls} text-[12.5px] font-semibold px-3 py-2`} style={{ color: ink }}>
                {sec.name}
              </p>
              {fields.map((f) => (
                <FieldRow
                  key={idOf(f) || f.name}
                  testId={test._id}
                  section={sec}
                  field={f}
                  override={findOverride(overrides, schema._id, sec.name, f.name)}
                  onSaved={handleSaved}
                  onNetworkError={onNetworkError}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RangeOverridesPanel;
