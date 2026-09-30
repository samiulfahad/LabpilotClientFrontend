import { useState, useEffect, useRef, forwardRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { useNavigate } from "react-router-dom";
import api from "../../api/baseAPI";
import {
  Hash,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import Popup from "../../components/popup"; // new import
import LabPilotLogo from "../../components/LabPilotLogo"; // adjust path to wherever the logo file lives

// ── Axios‑native network error detection (same as other pages) ───────
const isNetworkError = (err) => err?.isAxiosError === true && !err.response;

// Mirrors the backend's LOGIN_LAB_KEY_PATTERN (authRoutes.js) — digits for a
// normal login ("1112"), or digits followed by a letters-only suffix for a
// temporary support-admin login ("1112SAK"). Kept in sync with the server
// pattern intentionally; if one changes, the other should too.
const LOGIN_LAB_KEY_PATTERN = /^\d{1,5}[A-Za-z]{0,5}$/;

// Force the focused field above the virtual keyboard. Native scroll-into-view
// behavior on focus is inconsistent across iOS Safari / Android Chrome / in-app
// webviews — some auto-scroll, some don't, some scroll to the wrong place.
// Driving it ourselves after a short delay (letting the keyboard animate in
// first) gives the same behavior everywhere.
const scrollFieldIntoView = (e) => {
  const target = e.target;
  setTimeout(() => {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
};

/* ─── Icon input — placeholder doubles as the label ──────────────────────── */
const IconInput = forwardRef(({ icon: Icon, error, rightSlot, className = "", onFocus, ...props }, ref) => {
  const handleFocus = (e) => {
    onFocus?.(e);
    scrollFieldIntoView(e);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Icon
          size={15}
          className="absolute left-4 sm:left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10"
        />
        <input
          ref={ref}
          onFocus={handleFocus}
          className={`w-full bg-gray-50/70 border rounded-2xl py-3.5 text-base text-slate-800 outline-none transition-all duration-200 placeholder:text-gray-400 placeholder:font-normal focus:bg-white sm:py-2.5 sm:text-sm ${
            error
              ? "border-red-300 ring-4 ring-red-100/60 focus:border-red-400 focus:ring-red-100/60"
              : "border-gray-200/80 focus:border-blue-400 focus:ring-4 focus:ring-blue-100/60"
          } ${className}`}
          style={{ paddingLeft: "45px", paddingRight: rightSlot ? "55px" : "16px" }}
          {...props}
        />
        {rightSlot}
      </div>
      {error && (
        <p
          className="flex items-center gap-1 text-[11.5px] text-red-400 font-medium pl-1"
          style={{ animation: "lpFadeUp 0.25s cubic-bezier(.22,1,.36,1) both" }}
        >
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  );
});
IconInput.displayName = "IconInput";

/* ─── OTP Box Input ───────────────────────────────────────────────────────── */
const OtpInput = ({ value, onChange, onComplete }) => {
  const setDigit = (i, val, refs) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const arr = value.split("");
    arr[i] = digit;
    const next = arr.join("");
    onChange(next);
    if (digit && i < 5) refs[i + 1]?.focus();
    else if (digit && i === 5) onComplete?.();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          id={`otp-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          autoFocus={i === 0}
          onFocus={scrollFieldIntoView}
          onChange={(e) => {
            const refs = Array.from({ length: 6 }, (_, j) => document.getElementById(`otp-${j}`));
            setDigit(i, e.target.value, refs);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              document.getElementById(`otp-${i - 1}`)?.focus();
            }
          }}
          className="w-11 h-12 text-center text-lg font-bold font-mono border border-gray-200 rounded-xl bg-gray-50 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all text-slate-800"
        />
      ))}
    </div>
  );
};

/* ─── Main Login Component ───────────────────────────────────────────────── */
export default function Login() {
  const [view, setView] = useState("login"); // login | reset | otp | success
  const [mounted, setMounted] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  // Login state
  const [loginError, setLoginError] = useState("");
  const [labKey, setLabKey] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // Reset state
  const [resetLabKey, setResetLabKey] = useState("");
  const [resetPhone, setResetPhone] = useState("");
  const [resetError, setResetError] = useState("");

  // OTP + new password state
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [otpError, setOtpError] = useState("");

  // Resend timer
  const [resendTimer, setResendTimer] = useState(0);

  // Offline popup state
  const [offlinePopup, setOfflinePopup] = useState(false);

  // Focus-chain refs — Enter moves field → field → submit
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const resetPhoneRef = useRef(null);
  const newPasswordRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Tick the resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [resendTimer]);

  // ── Login ──
  const validateLogin = () => {
    const e = {};
    // Digits for a normal login, or digits + a letters-only suffix for a
    // temporary support-admin login (e.g. "1112SAK") — see
    // LOGIN_LAB_KEY_PATTERN above.
    if (!LOGIN_LAB_KEY_PATTERN.test(labKey)) e.labKey = "1-5 digit Lab ID";
    if (!/^01\d{9}$/.test(phone)) e.phone = "Enter valid 11-digit number";
    if (password.length < 6) e.password = "Short password";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleLogin = async () => {
    if (!validateLogin()) return;
    setLoginError("");
    setLoading(true);
    try {
      const result = await login(labKey, phone, password);
      setLoading(false);
      if (result.success) navigate("/");
      else setLoginError(result.message);
    } catch (err) {
      setLoading(false);
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        setLoginError("Login failed. Please try again.");
      }
    }
  };

  // ── Forgot password — request OTP ──
  const handleRequestOtp = async () => {
    if (!/^\d{1,5}$/.test(resetLabKey)) return setResetError("Lab Key must be 1 to 5 digits");
    if (!/^01\d{9}$/.test(resetPhone)) return setResetError("Enter valid 11-digit phone number");
    setResetError("");
    setLoading(true);
    try {
      await api.post("/forgot-password", {
        phone: resetPhone,
        labKey: resetLabKey,
      });
      setResendTimer(120);
      setView("otp");
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        const msg = err?.response?.data?.error;
        setResetError(msg || "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Resend OTP ──
  const handleResendOtp = async () => {
    setOtpError("");
    setLoading(true);
    try {
      await api.post("/forgot-password", {
        phone: resetPhone,
        labKey: resetLabKey,
      });
      setResendTimer(120);
      setOtp("");
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
      } else {
        const msg = err?.response?.data?.error;
        setOtpError(msg || "Failed to resend OTP.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── OTP — verify + set new password ──
  const handleResetPassword = async () => {
    if (otp.length < 6) return setOtpError("Enter the 6-digit OTP");
    if (newPassword.length < 6) return setOtpError("Password must be at least 6 characters");
    setOtpError("");
    setLoading(true);
    try {
      await api.post("/reset-password", {
        phone: resetPhone,
        labKey: resetLabKey,
        otp,
        newPassword,
      });
      setView("success");
    } catch (err) {
      if (isNetworkError(err)) {
        setOfflinePopup(true);
        return;
      }
      const status = err?.response?.status;
      const msg = err?.response?.data?.error;
      const attemptsLeft = err?.response?.data?.attemptsLeft;

      if (status === 429) {
        // OTP is dead server-side — don't leave a live-looking form up.
        setOtp("");
        setNewPassword("");
        setResendTimer(0);
        setResetError(msg || "Too many incorrect attempts. Please request a new OTP.");
        setView("reset");
        return;
      }

      setOtpError(
        typeof attemptsLeft === "number"
          ? `${msg || "Invalid or expired OTP"} — ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left`
          : msg || "Invalid or expired OTP. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    setView("login");
    setResetLabKey("");
    setResetPhone("");
    setOtp("");
    setNewPassword("");
    setResetError("");
    setOtpError("");
    setResendTimer(0);
  };

  return (
    <div
      className="fixed inset-0 h-[100dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain"
      style={{
        background: "linear-gradient(145deg, #f0f4ff 0%, #f0f1f7 40%, #e8f5ff 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Offline popup */}
      {offlinePopup && <Popup type="offline" onClose={() => setOfflinePopup(false)} />}

      {/* Background blobs — fixed, not absolute, so they never expand the
          now-scrollable outer container's scroll height */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-48 -left-48 w-[560px] h-[560px] rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "radial-gradient(circle, #818cf8, transparent 70%)" }}
        />
        <div
          className="absolute top-1/2 -right-48 w-[420px] h-[420px] rounded-full opacity-[0.12] blur-3xl"
          style={{ background: "radial-gradient(circle, #34d399, transparent 70%)" }}
        />
      </div>
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.035) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      {/* min-h-full lets this wrapper grow past the viewport (and become
          scrollable) once the keyboard shrinks the visible area, instead of
          clipping content that can't be reached */}
      <div className="relative z-10 min-h-full w-full flex items-center justify-center px-2 py-6 sm:p-6">
        <div
          className="w-full max-w-[420px]"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.5s, transform 0.5s",
          }}
        >
          {/* Brand Header */}
          <div
            className="flex items-center gap-3 px-4 sm:px-6 py-4 rounded-t-3xl border-b border-slate-200"
            style={{ background: "linear-gradient(135deg, #dbeafe 0%, #e2e8f0 100%)" }}
          >
            {/* Light theme (header bg is light). showPulse → animated heartbeat line under the wordmark. */}
            <LabPilotLogo theme="light" iconClassName="w-12 h-12" showPulse showTagline className="min-w-0" />

            <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-600">Online</span>
            </div>
          </div>

          {/* Card Body */}
          <div
            className="bg-white/85 backdrop-blur-md border border-gray-200/80 border-t-0 shadow-lg"
            style={{ borderRadius: "0 0 24px 24px" }}
          >
            <div className="px-4 sm:px-7 pt-6 pb-6">
              {/* ── LOGIN VIEW ── */}
              {view === "login" && (
                <div className="flex flex-col gap-4">
                  <div className="mb-2 text-center">
                    <h1 className="text-[26px] sm:text-[22px] font-black text-gray-900 tracking-tight leading-tight mb-0.5">
                      Welcome back<span className="text-blue-600">.</span>
                    </h1>
                    <p className="text-sm sm:text-[13px] text-gray-400 font-light">
                      Sign in to access your lab workspace
                    </p>
                  </div>

                  <IconInput
                    icon={Hash}
                    error={errors.labKey}
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Lab ID"
                    value={labKey}
                    onChange={(e) => setLabKey(e.target.value.replace(/[^0-9a-zA-Z]/g, "").slice(0, 11))}
                    onKeyDown={(e) => e.key === "Enter" && phoneRef.current?.focus()}
                  />

                  <IconInput
                    ref={phoneRef}
                    icon={Phone}
                    error={errors.phone}
                    type="tel"
                    inputMode="numeric"
                    placeholder="Phone Number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    onKeyDown={(e) => e.key === "Enter" && passwordRef.current?.focus()}
                  />

                  <IconInput
                    ref={passwordRef}
                    icon={Lock}
                    error={errors.password}
                    type={showPw ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    rightSlot={
                      <button
                        type="button"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-all active:scale-90"
                        onClick={() => setShowPw((p) => !p)}
                      >
                        {showPw ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
                      </button>
                    }
                  />

                  <div className="flex justify-center -mt-1">
                    <button
                      type="button"
                      className="text-[12.5px] font-semibold text-blue-600"
                      onClick={() => setView("reset")}
                    >
                      Forgot password?
                    </button>
                  </div>

                  {loginError && (
                    <div className="flex items-center gap-2 justify-center px-3 py-2.5 rounded-2xl text-[12.5px] text-red-600 bg-red-50 border border-red-200">
                      <AlertCircle size={13} />
                      {loginError}
                    </div>
                  )}

                  <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="group w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl font-semibold text-white transition-all hover:-translate-y-0.5"
                    style={{
                      background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
                      boxShadow: "0 4px 16px rgba(37,99,235,0.28)",
                    }}
                  >
                    {loading ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* ── RESET VIEW — enter lab key + phone ── */}
              {view === "reset" && (
                <div className="flex flex-col gap-4">
                  <div className="text-center">
                    <h1 className="text-[22px] font-black text-gray-900">Forgot password?</h1>
                    <p className="text-sm text-gray-400 mt-1">Enter your Lab ID and phone — we'll send an OTP</p>
                  </div>

                  <IconInput
                    icon={Hash}
                    type="text"
                    inputMode="numeric"
                    placeholder="Lab ID"
                    value={resetLabKey}
                    onChange={(e) => setResetLabKey(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    onKeyDown={(e) => e.key === "Enter" && resetPhoneRef.current?.focus()}
                    autoFocus
                  />

                  <IconInput
                    ref={resetPhoneRef}
                    icon={Phone}
                    type="tel"
                    inputMode="numeric"
                    placeholder="Phone Number"
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
                  />

                  {resetError && (
                    <div className="flex items-center gap-2 justify-center px-3 py-2.5 rounded-2xl text-[12.5px] text-red-600 bg-red-50 border border-red-200">
                      <AlertCircle size={13} />
                      {resetError}
                    </div>
                  )}

                  <button
                    onClick={handleRequestOtp}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={17} className="animate-spin" /> : "Send OTP"}
                  </button>

                  <button
                    onClick={goBackToLogin}
                    className="flex items-center justify-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <ChevronLeft size={15} /> Back to Sign In
                  </button>
                </div>
              )}

              {/* ── OTP VIEW — enter OTP + new password ── */}
              {view === "otp" && (
                <div className="flex flex-col gap-5">
                  <div className="text-center">
                    <h1 className="text-[22px] font-black text-gray-900">Enter OTP</h1>
                    <p className="text-sm text-gray-400 mt-1">
                      Sent to <span className="font-semibold text-gray-600">{resetPhone}</span>
                    </p>
                  </div>

                  <OtpInput value={otp} onChange={setOtp} onComplete={() => newPasswordRef.current?.focus()} />

                  <IconInput
                    ref={newPasswordRef}
                    icon={Lock}
                    type={showNewPw ? "text" : "password"}
                    placeholder="New Password (min 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                    rightSlot={
                      <button
                        type="button"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-all"
                        onClick={() => setShowNewPw((p) => !p)}
                      >
                        {showNewPw ? <EyeOff size={18} strokeWidth={2.2} /> : <Eye size={18} strokeWidth={2.2} />}
                      </button>
                    }
                  />

                  {otpError && (
                    <div className="flex items-center gap-2 justify-center px-3 py-2.5 rounded-2xl text-[12.5px] text-red-600 bg-red-50 border border-red-200">
                      <AlertCircle size={13} />
                      {otpError}
                    </div>
                  )}

                  {/* ── Resend OTP ── */}
                  <div className="flex items-center justify-center gap-2 text-sm">
                    {resendTimer > 0 ? (
                      <span className="text-gray-400">
                        Resend OTP in{" "}
                        <span className="font-bold tabular-nums text-blue-500">
                          {String(Math.floor(resendTimer / 60)).padStart(2, "0")}:
                          {String(resendTimer % 60).padStart(2, "0")}
                        </span>
                      </span>
                    ) : (
                      <button
                        onClick={handleResendOtp}
                        disabled={loading}
                        className="text-blue-600 font-semibold hover:underline disabled:opacity-50 transition-opacity"
                      >
                        Resend OTP
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleResetPassword}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all disabled:opacity-60"
                  >
                    {loading ? <Loader2 size={17} className="animate-spin" /> : "Reset Password"}
                  </button>

                  <button
                    onClick={() => setView("reset")}
                    className="flex items-center justify-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <ChevronLeft size={15} /> Back
                  </button>
                </div>
              )}

              {/* ── SUCCESS VIEW ── */}
              {view === "success" && (
                <div className="flex flex-col items-center gap-6 py-4">
                  <div className="w-16 h-16 rounded-3xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
                    <CheckCircle2 size={28} color="#16a34a" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-lg font-black text-gray-900">Password Reset!</h2>
                    <p className="text-sm text-slate-500 mt-1">You've been logged out of all devices.</p>
                    <p className="text-sm text-slate-500">Please sign in with your new password.</p>
                  </div>
                  <button
                    onClick={goBackToLogin}
                    className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all"
                  >
                    Back to Sign In
                  </button>
                </div>
              )}
            </div>

            {/* Card Footer */}
            <div className="flex items-center justify-between px-4 sm:px-7 py-3.5 rounded-b-3xl border-t border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-blue-400" />
                <span className="text-[11px] text-gray-400 font-medium">256-bit encrypted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-gray-400">Authorized access</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes lpFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
