import api from "./baseAPI";

const billingService = {
  getStatus: () => api.get("/billing/status"),
  getHistory: () => api.get("/billing/history"),
};

export default billingService;
