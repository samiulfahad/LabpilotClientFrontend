import api from "./baseAPI";

const invoiceService = {
  getRequiredData: () => api.get("/invoice/required-data"),
  getDoctors: () => api.get("/invoice/doctors"),
  createInvoice: (data) => api.post("/invoice/add", data),
  getInvoices: ({ cursor = null, limit = 20, startDate = null, endDate = null } = {}) => {
    const params = new URLSearchParams({ limit });
    if (cursor) params.append("cursor", cursor);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    return api.get(`/invoice/all?${params}`);
  },
  // DB-side aggregation for the ledger totals (মোট বিলকৃত / আদায় / বাকি) and
  // invoice count over the FULL selected date range — independent of
  // whatever single page of `getInvoices` happens to be loaded in the UI.
  getInvoiceSummary: ({ startDate = null, endDate = null } = {}) => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    return api.get(`/invoice/summary?${params}`);
  },
  getInvoiceByInvoiceId: (_id) => api.get(`/invoice/${_id}`),
  // Lean fetch for the Reports page — patient info, amounts, and per-test
  // status + dates only. No report body, no referrer, no schema details.
  updatePatientInfo: (invoiceId, data) => api.patch(`/invoice/${invoiceId}/patient-info`, data),
  // Pass { amount, paymentMode } — amount is optional (omit to collect the
  // full due amount); the backend always re-clamps it to (0, due] anyway.
  collectDue: (invoiceId, data = {}) => api.patch(`/invoice/${invoiceId}/collect-due`, data),
  markDelivered: (invoiceId) => api.patch(`/invoice/${invoiceId}/mark-delivered`),
  deleteInvoice: (invoiceId) => api.patch(`/invoice/${invoiceId}/delete`),
  getDeletedInvoices: ({ cursor = null, limit = 20, startDate = null, endDate = null } = {}) => {
    const params = new URLSearchParams({ limit });
    if (cursor) params.append("cursor", cursor);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    return api.get(`/invoice/deleted?${params}`);
  },

  searchInvoices: (query) => api.get(`/invoice/search?q=${encodeURIComponent(query)}`),
};

export default invoiceService;
