/**
 * useCallback / useMemo are intentionally absent throughout this file.
 * babel-plugin-react-compiler handles all memoization automatically.
 *
 * ── Design notes ─────────────────────────────────────────────────────────
 * Category-wise accordion: each category is a group header showing its name
 * plus its sample collection room (editable inline — editing it updates
 * this lab's persisted default room for that category). Tests inside a
 * category render as a searchable sub-list; tapping a test expands its own
 * config (report format + its own room override, shown with a badge when it
 * differs from — or simply inherits — the category's default). One accent
 * color, generous whitespace, no gradients/card-soup.
 *
 * A sample collection room is a short label (e.g. "204") stored directly on
 * a test as `sampleCollectionRoom`. A category's default room IS persisted
 * per lab (backend's `categoryRoomDefaults` collection) — fetched via
 * `getCategoryRooms` and combined here into each test's
 * `effectiveCollectionRoom` (own room if set, else the category default,
 * else null), so a newly added test in an existing category picks up the
 * right default without anyone re-applying anything.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, X, Loader2, ChevronDown, Check, Pencil, Circle, CheckCircle2 } from "lucide-react";
import testConfigService from "../../../api/testConfig";
import Popup from "../../../components/popup";

// ─── shared helpers ──────────────────────────────────────────────────────────

const PERMISSION_DENIED_MESSAGE = "আপনার কর্তৃপক্ষ আপনাকে এই কাজটি করার বা এই তথ্যটি পাওয়ার অনুমতি দেয়নি।";
const getErrorMessage = (err, fallback) => {
  if (err?.response?.status === 403) return PERMISSION_DENIED_MESSAGE;
  return err?.response?.data?.error ?? fallback;
};
const getErrorStatus = (err) => err?.response?.status ?? err?.status ?? null;
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// Search ignores ANY punctuation/symbol, in any script, so "platelet count",
// "platelet-count" and "platelet, count" all match "Platelet Count".
const strip = (str) => (str ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const matchesSearch = (name, query) => {
  const q = strip(query);
  return q === "" || strip(name).includes(q);
};

// ─── tokens ──────────────────────────────────────────────────────────────────

const accent = "#155E63"; // deep teal — the one deliberate color
const accentSoft = "#EAF3F2";
const ink = "#111827";
const sub = "#6B7280";
const line = "#E5E7EB";
const danger = "#B42318";

const sansCls = "font-['Inter','IBM_Plex_Sans',system-ui,sans-serif]";

const fieldStyle = { border: `1px solid ${line}`, background: "#fff", color: ink };

// ─── small shared bits ────────────────────────────────────────────────────

const Spinner = ({ label }) => (
  <div className="flex items-center gap-2 py-1">
    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: accent }} />
    <span className={`${sansCls} text-[13px]`} style={{ color: sub }}>
      {label}
    </span>
  </div>
);

const ErrorLine = ({ children }) => (
  <p className={`${sansCls} text-[12.5px]`} style={{ color: danger }}>
    {children}
  </p>
);

// Renders like a selectable list row (radio-style circle + label) rather
// than a standalone button, so it reads clearly as "pick from this list"
// even though several can be selected at once.
const Chip = ({ label, selected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`${sansCls} text-[13px] rounded-lg px-3 py-2.5 w-full flex items-center gap-2.5 text-left transition-colors`}
    style={{
      background: selected ? accentSoft : "#fff",
      border: `1px solid ${selected ? accent : line}`,
      color: selected ? accent : ink,
      fontWeight: selected ? 600 : 400,
    }}
  >
    {selected ? (
      <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: accent }} />
    ) : (
      <Circle className="w-4 h-4 shrink-0" style={{ color: sub }} />
    )}
    <span className="truncate">{label}</span>
  </button>
);

// Small inline "label: [input] [save] [cancel]" editor, used both for a
// category's room and for a test's own room override.
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
        className={`${sansCls} text-[13px] rounded-lg px-2 py-1 w-28 outline-none`}
        style={fieldStyle}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(value.trim() || null)}
        className={`${sansCls} text-[12px] font-medium text-white rounded-lg px-2.5 py-1`}
        style={{ background: saving ? "#9CA3AF" : accent }}
      >
        {saving ? "…" : "সংরক্ষণ"}
      </button>
      <button type="button" onClick={onCancel} className={`${sansCls} text-[12px] px-1.5 py-1`} style={{ color: sub }}>
        বাতিল
      </button>
    </div>
  );
};

// ─── inline config editor (rendered inside an expanded test row) ───────────

const TestEditor = ({ test, categoryRoom, onSaved, onNetworkError }) => {
  const [schemas, setSchemas] = useState([]);
  const [selectedSchemaId, setSelectedSchemaId] = useState(test.schemaId ?? null);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [schemaError, setSchemaError] = useState(null);
  const [savingSchema, setSavingSchema] = useState(false);
  const [schemaSaved, setSchemaSaved] = useState(false);
  const [schemaApiError, setSchemaApiError] = useState("");
  const [makingOffline, setMakingOffline] = useState(false);

  const selectSchema = (schemaId) => {
    setSchemaSaved(false);
    setSelectedSchemaId(schemaId);
  };

  const [editingRoom, setEditingRoom] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);
  const [roomApiError, setRoomApiError] = useState("");

  const handleLoadError = (err, setter, fallback) => {
    if (isNetworkError(err)) {
      setter("ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করুন।");
      onNetworkError?.();
    } else {
      setter(getErrorMessage(err, fallback));
    }
  };

  useEffect(() => {
    setSelectedSchemaId(test.schemaId ?? null);
    setSchemaApiError("");
    setSchemaSaved(false);
    setEditingRoom(false);
    setRoomApiError("");
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

  const handleSaveSchema = async (schemaId) => {
    const res = await testConfigService.updateSchema(test._id, schemaId);
    onSaved?.({ ...test, schemaId: res.data.schemaId });
  };

  const handleSubmitSelection = async () => {
    setSavingSchema(true);
    setSchemaApiError("");
    setSchemaSaved(false);
    try {
      await handleSaveSchema(selectedSchemaId);
      setSchemaSaved(true);
    } catch (err) {
      if (isNetworkError(err)) {
        setSchemaApiError("ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করুন।");
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
    setSchemaSaved(false);
    try {
      await handleSaveSchema(null);
      setSelectedSchemaId(null);
    } catch (err) {
      if (isNetworkError(err)) {
        setSchemaApiError("ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করুন।");
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

  const handleSaveRoom = async (room) => {
    setSavingRoom(true);
    setRoomApiError("");
    try {
      const res = await testConfigService.updateCollectionRoom(test._id, room);
      setEditingRoom(false);
      onSaved?.({ ...test, sampleCollectionRoom: res.data.sampleCollectionRoom });
    } catch (err) {
      if (isNetworkError(err)) {
        setRoomApiError("ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করুন।");
        onNetworkError?.();
      } else if (getErrorStatus(err) === 404) {
        onSaved?.({ ...test, __notFound: true });
        return;
      } else {
        setRoomApiError(getErrorMessage(err, "সংরক্ষণ ব্যর্থ হয়েছে।"));
      }
    } finally {
      setSavingRoom(false);
    }
  };

  const ownRoom = test.sampleCollectionRoom ?? null;
  const inheritedRoom = ownRoom === null ? (categoryRoom ?? null) : null;
  const differsFromCategory = ownRoom !== null && ownRoom !== (categoryRoom ?? null);

  return (
    <div className="px-4 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-5">
      {/* report format */}
      <div>
        <p className={`${sansCls} text-[13px] font-medium mb-2`} style={{ color: ink }}>
          রিপোর্ট ফরম্যাট
        </p>
        {loadingSchemas ? (
          <Spinner label="লোড হচ্ছে…" />
        ) : schemaError ? (
          <ErrorLine>{schemaError}</ErrorLine>
        ) : schemas.length === 0 ? (
          <p className={`${sansCls} text-[13px]`} style={{ color: sub }}>
            কোনো ফরম্যাট তৈরি করা হয়নি।
          </p>
        ) : (
          <>
            <p className={`${sansCls} text-[12px] mb-1.5`} style={{ color: sub }}>
              তালিকা থেকে একটি ফরম্যাট বেছে নিন
            </p>
            <div className="flex flex-col gap-1.5 mb-3">
              {schemas.map((schema) => (
                <Chip
                  key={schema._id}
                  label={schema.description || "নামহীন ফরম্যাট"}
                  selected={selectedSchemaId === schema._id}
                  onClick={() => selectSchema(schema._id)}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleSubmitSelection}
                disabled={savingSchema || makingOffline}
                className={`${sansCls} text-[13px] font-medium text-white rounded-lg px-4 py-2`}
                style={{ background: savingSchema ? "#9CA3AF" : accent }}
              >
                {savingSchema ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
              </button>
              <button
                type="button"
                onClick={handleMakeOffline}
                disabled={savingSchema || makingOffline || selectedSchemaId === null}
                className={`${sansCls} text-[13px] font-medium rounded-lg px-4 py-2`}
                style={{
                  border: `1px solid ${line}`,
                  color: selectedSchemaId === null ? sub : danger,
                  background: "#fff",
                }}
              >
                {makingOffline ? "অফলাইন করা হচ্ছে…" : "অফলাইন করুন"}
              </button>
              {schemaSaved && !savingSchema && (
                <span className={`${sansCls} text-[12.5px] flex items-center gap-1`} style={{ color: accent }}>
                  <Check className="w-3.5 h-3.5" /> সংরক্ষিত
                </span>
              )}
              {schemaApiError && <ErrorLine>{schemaApiError}</ErrorLine>}
            </div>
          </>
        )}
      </div>

      {/* sample collection room */}
      <div>
        <p className={`${sansCls} text-[13px] font-medium mb-2`} style={{ color: ink }}>
          নমুনা সংগ্রহ কক্ষ
        </p>
        {editingRoom ? (
          <RoomInlineEditor
            initialValue={ownRoom}
            saving={savingRoom}
            placeholder="যেমনঃ 204"
            onSave={handleSaveRoom}
            onCancel={() => setEditingRoom(false)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className={`${sansCls} text-[13px]`} style={{ color: ownRoom || inheritedRoom ? ink : sub }}>
              {ownRoom ?? inheritedRoom ?? "নির্ধারিত নয়"}
            </span>
            {inheritedRoom && (
              <span
                className={`${sansCls} text-[11px] rounded-full px-2 py-0.5`}
                style={{ background: accentSoft, color: accent }}
              >
                ক্যাটাগরির ডিফল্ট
              </span>
            )}
            {differsFromCategory && (
              <span
                className={`${sansCls} text-[11px] rounded-full px-2 py-0.5`}
                style={{ background: accentSoft, color: accent }}
              >
                ভিন্ন কক্ষ
              </span>
            )}
            <button type="button" onClick={() => setEditingRoom(true)}>
              <Pencil className="w-3.5 h-3.5" style={{ color: sub }} />
            </button>
          </div>
        )}
        {roomApiError && !editingRoom && (
          <div className="mt-1.5">
            <ErrorLine>{roomApiError}</ErrorLine>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── category group (header + its tests, both accordions) ──────────────────

const CategoryGroup = ({
  category,
  tests,
  categoryRoom,
  expandedTestId,
  onToggleTest,
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
        setRoomApiError("ইন্টারনেট সংযোগ নেই। সংযোগ পরীক্ষা করুন।");
        onNetworkError?.();
      } else {
        setRoomApiError(getErrorMessage(err, "সংরক্ষণ ব্যর্থ হয়েছে।"));
      }
    } finally {
      setSavingRoom(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl overflow-hidden" style={{ border: `1px solid ${line}` }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: accentSoft }}>
        <span className={`${sansCls} text-[14px] font-semibold`} style={{ color: ink }}>
          {category.name}
        </span>
        {editingRoom ? (
          <RoomInlineEditor
            initialValue={categoryRoom}
            saving={savingRoom}
            placeholder="যেমনঃ 204"
            onSave={handleSaveRoom}
            onCancel={() => setEditingRoom(false)}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className={`${sansCls} text-[13px]`} style={{ color: categoryRoom ? accent : sub }}>
              {categoryRoom ?? "কক্ষ নির্ধারিত নয়"}
            </span>
            <button type="button" onClick={() => setEditingRoom(true)}>
              <Pencil className="w-3.5 h-3.5" style={{ color: sub }} />
            </button>
          </div>
        )}
      </div>
      {roomApiError && (
        <div className="px-4 pt-2">
          <ErrorLine>{roomApiError}</ErrorLine>
        </div>
      )}

      {tests.map((test, i) => {
        const isOpen = expandedTestId === test._id;
        const isOnline = !!test.schemaId;
        const roomBadge = test.effectiveCollectionRoom;
        return (
          <div key={test._id} style={{ borderTop: `1px solid ${line}` }}>
            <button
              type="button"
              onClick={() => onToggleTest(test._id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ background: isOpen ? accentSoft : "#fff" }}
            >
              <span
                className={`${sansCls} flex-1 min-w-0 truncate text-[14px]`}
                style={{ color: ink, fontWeight: isOpen ? 600 : 400 }}
              >
                {test.name}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <Dot on={isOnline} />
                <span className={`${sansCls} text-[12px]`} style={{ color: sub }}>
                  {isOnline ? "অনলাইন" : "অফলাইন"}
                </span>
                {roomBadge && (
                  <span className={`${sansCls} text-[12px]`} style={{ color: sub }}>
                    · {roomBadge}
                  </span>
                )}
              </span>
              <ChevronDown
                className="w-4 h-4 shrink-0 transition-transform"
                style={{ color: sub, transform: isOpen ? "rotate(180deg)" : "none" }}
              />
            </button>
            {isOpen && (
              <div style={{ background: accentSoft }}>
                <TestEditor
                  key={test._id}
                  test={test}
                  categoryRoom={categoryRoom}
                  onSaved={onTestSaved}
                  onNetworkError={onNetworkError}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Dot = ({ on }) => <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? accent : "#D1D5DB" }} />;

// ─── page ────────────────────────────────────────────────────────────────────

const TestConfigPage = () => {
  const [categories, setCategories] = useState([]);
  const [tests, setTests] = useState([]);
  const [categoryRooms, setCategoryRooms] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedTestId, setExpandedTestId] = useState(null);
  const [offlinePopup, setOfflinePopup] = useState(false);

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

  const handleTestSaved = (updatedTest) => {
    if (updatedTest.__notFound) {
      setTests((prev) => prev.filter((t) => t._id !== updatedTest._id));
      setExpandedTestId(null);
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

  const groups = useMemo(() => {
    const q = strip(search);
    const byCategory = new Map();
    for (const test of tests) {
      const key = test.categoryId ?? "uncategorized";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(test);
    }

    const result = [];
    for (const category of categories) {
      const all = byCategory.get(category._id) ?? [];
      const list = q === "" ? all : all.filter((t) => matchesSearch(t.name, search));
      if (list.length > 0) result.push({ category, tests: list });
    }
    return result;
  }, [categories, tests, search]);

  return (
    <section className="min-h-screen bg-[#FAFAFA] font-[Noto_Sans_Bengali,sans-serif]">
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={`${sansCls} text-[22px] font-semibold`} style={{ color: ink }}>
              টেস্ট কনফিগারেশন
            </h1>
            <p className={`${sansCls} text-[13px] mt-0.5`} style={{ color: sub }}>
              রিপোর্ট ফরম্যাট ও নমুনা সংগ্রহ কক্ষ
            </p>
          </div>
          <Link to="/setup" className={`${sansCls} flex items-center gap-1.5 text-[13px]`} style={{ color: sub }}>
            <ArrowLeft className="w-3.5 h-3.5" /> ফিরে যান
          </Link>
        </div>

        <div className="relative mb-6">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: sub }} />
          <input
            type="text"
            placeholder="টেস্টের নাম খুঁজুন…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${sansCls} text-[14px] rounded-xl pl-9 ${search ? "pr-9" : "pr-4"} py-3 w-full outline-none`}
            style={fieldStyle}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4" style={{ color: sub }} />
            </button>
          )}
        </div>

        {initialLoading ? (
          <Spinner label="লোড হচ্ছে…" />
        ) : error ? (
          <ErrorLine>{error}</ErrorLine>
        ) : groups.length === 0 ? (
          <p className={`${sansCls} text-[14px]`} style={{ color: sub }}>
            কোনো টেস্ট পাওয়া যায়নি।
          </p>
        ) : (
          groups.map(({ category, tests: categoryTests }) => (
            <CategoryGroup
              key={category._id}
              category={category}
              tests={categoryTests}
              categoryRoom={categoryRooms[category._id] ?? null}
              expandedTestId={expandedTestId}
              onToggleTest={(id) => setExpandedTestId((cur) => (cur === id ? null : id))}
              onTestSaved={handleTestSaved}
              onNetworkError={handleNetworkError}
              onSetCategoryRoom={handleSetCategoryRoom}
            />
          ))
        )}
      </div>
    </section>
  );
};

export default TestConfigPage;
