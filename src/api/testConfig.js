import api from "./baseAPI";

// Scoped to test-config concerns only: report format (schema) selection,
// sample collection room assignment, and per-lab reference range / unit
// overrides. Everything else (catalog, price, commission, manual add, etc.)
// stays in testService.
//
// All paths carry the /test-config prefix inline (see testConfigRoutes.js —
// routes are self-prefixed rather than registered with a fastify prefix
// option), so no separate base path constant is needed here.
//
// There's no "rooms" entity — a sample collection room is just a short label
// (e.g. "204") stored directly on a test as `sampleCollectionRoom`. A
// category's default room IS persisted, per lab, in its own
// categoryRoomDefaults collection — set/cleared via
// updateCategoryCollectionRoom below, and read back via getCategoryRooms.
const testConfigService = {
  // Lab-scoped list of tests for the config list/search panel — each test
  // carries its own `sampleCollectionRoom` plus a computed
  // `effectiveCollectionRoom` (own room, else this lab's category default).
  // (GET /test-config/tests)
  getTestList: () => api.get("/test-config/tests"),

  // Global category taxonomy, used to group the test list.
  // (GET /test-config/categories)
  getCategories: () => api.get("/test-config/categories"),

  // This lab's category → default room mappings (GET /test-config/category-rooms)
  getCategoryRooms: () => api.get("/test-config/category-rooms"),

  // Set (or clear, with sampleCollectionRoom: null) this lab's persisted
  // default room for a category.
  // (PUT /test-config/category/:categoryId/collection-room)
  updateCategoryCollectionRoom: (categoryId, sampleCollectionRoom) =>
    api.put(`/test-config/category/${categoryId}/collection-room`, { sampleCollectionRoom }),

  // ── Report format ────────────────────────────────────────────────────────
  // Formats available for a given test (GET /test-config/test/schema/:testId)
  getSchemasByTestId: (testId) => api.get(`/test-config/test/schema/${testId}`),

  // A single format/schema by its own id (GET /test-config/schema/:schemaId)
  getSchemaBySchemaId: (schemaId) => api.get(`/test-config/schema/${schemaId}`),

  // Set (or clear, with schemaId: null) the single format attached to a
  // test.
  // (PATCH /test-config/:testId/schema)
  updateSchema: (testId, schemaId) => api.patch(`/test-config/${testId}/schema`, { schemaId }),

  // ── Reference range / unit overrides ─────────────────────────────────────
  // Stored on the test at test.schema.overrides, one entry per field, keyed by
  // sectionName + fieldName (tied to the test's attached format).
  // payload: { sectionName, fieldName, standardRange? | referenceValue?, unit? } —
  // only the keys that differ from the admin default. Sending none removes
  // the field's entry.
  // (PUT /test-config/:testId/range-override)
  saveRangeOverride: (testId, payload) => api.put(`/test-config/${testId}/range-override`, payload),

  // ── Sample collection room ───────────────────────────────────────────────
  // Set (or clear, with sampleCollectionRoom: null) a single test's own room
  // — used when a test needs to deviate from its category's default.
  // (PATCH /test-config/:testId/collection-room)
  updateCollectionRoom: (testId, sampleCollectionRoom) =>
    api.patch(`/test-config/${testId}/collection-room`, { sampleCollectionRoom }),
};

export default testConfigService;
