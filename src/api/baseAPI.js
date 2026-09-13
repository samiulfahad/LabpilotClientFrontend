import axios from "axios";
import { useAuthStore } from "../store/authStore";

const ip = "http://10.155.23.187:3000/v1";
const local = "http://localhost:3000/v1";
const cloud = "https://client-api.labpilotpro.com/v1"
const api = axios.create({
  baseURL: cloud,
  timeout: 15000,
  withCredentials: true, // ✅ sends cookies cross-origin
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const resetRefreshState = (error = null, token = null) => {
  processQueue(error, token);
  isRefreshing = false;
};

// ── Piggyback billing status off any response header ───────────────────────
// The backend stamps X-Billing-Due / X-Billing-Overdue / X-Billing-Due-Date
// on every authenticated response (cached server-side, 5-min TTL). This lets
// any staff session pick up a status change on their very next ordinary API
// call, without a dedicated polling request.
const syncBillingStatusFromHeaders = (response) => {
  const due = response.headers["x-billing-due"];
  if (due === undefined) return; // route not authenticated / hook didn't run

  useAuthStore.getState().setBillingStatus({
    hasUnpaidBill: due === "true",
    isOverdue: response.headers["x-billing-overdue"] === "true",
    dueDate: response.headers["x-billing-due-date"] ? Number(response.headers["x-billing-due-date"]) : null,
  });
};

// ── Request interceptor: attach access token ──────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor ──────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => {
    syncBillingStatusFromHeaders(response);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // ── No response = pure network error / timeout — DO NOT logout ─────────
    if (!error.response) {
      if (originalRequest?.url?.includes("/refresh")) {
        resetRefreshState(error);
      }
      return Promise.reject(error);
    }

    // ── 445: refresh token dead → hard logout, never retry ────────────────
    if (status === 445) {
      resetRefreshState(error);
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    // ── 444: access token expired → attempt silent refresh ────────────────
    if (status === 444 && !originalRequest._retry) {
      // /refresh itself came back 444 — treat as fatal
      if (originalRequest.url.includes("/refresh")) {
        resetRefreshState(error);
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }

      // Another request is already refreshing — queue and wait
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers["Authorization"] = "Bearer " + token;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post("/refresh");
        const newAccessToken = data.accessToken;
        useAuthStore.getState().setToken(newAccessToken);
        resetRefreshState(null, newAccessToken);
        originalRequest.headers["Authorization"] = "Bearer " + newAccessToken;
        return api(originalRequest);
      } catch (refreshError) {
        // Only hard-logout if refresh explicitly failed with 445
        // Network errors during refresh should NOT logout the user
        if (refreshError.response?.status === 445) {
          useAuthStore.getState().logout();
        }
        resetRefreshState(refreshError);
        return Promise.reject(refreshError);
      }
    }

    // All other errors (400, 403, 500 …) pass through untouched
    return Promise.reject(error);
  },
);

export default api;
