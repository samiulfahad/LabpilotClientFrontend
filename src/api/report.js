import api from "./baseAPI";

const reportService = {
  // ── Outdoor ──────────────────────────────────────────────────────────────────
  // Newest-first, 40 per page. Pass the previous response's nextCursor to get the next page.
  getOutdoorList: (cursor) => api.get("/outdoorReport", { params: cursor ? { cursor } : undefined }),
  getOutdoorPatient: (invoiceId) => api.get(`/outdoorReport/${invoiceId}`),
  addReport: (data) => api.post("/outdoorReport/add", data),
  updateReport: (data) => api.put("/outdoorReport/update", data),
  updateDates: (data) => api.put("/outdoorReport/dates", data), // fixed: was /outdoorRepot/dates (typo, 404'd)
  getReport: (invoiceId, testId) => api.get(`/outdoorReport/${invoiceId}/${testId}`),
  getTestSchema: (schemaId) => api.get("/outdoorReport/testSchema/" + schemaId), // ← moved from testService

  // ── Indoor ───────────────────────────────────────────────────────────────────
  getIndoorPatient: (admissionId) => api.get(`/indoorReport/${admissionId}`),
  addIndoorReport: (data) => api.post("/indoorReport/add", data),
  updateIndoorReport: (data) => api.put("/indoorReport/update", data),
  updateIndoorDates: (data) => api.put("/indoorReport/dates", data),
  getIndoorReport: (patientId, testId, addedAt) =>
    api.get(`/indoorReport/${patientId}/${testId}`, { params: addedAt ? { addedAt } : undefined }),
};

export default reportService;
