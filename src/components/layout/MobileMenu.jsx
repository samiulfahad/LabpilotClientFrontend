import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import {
  LogOut,
  Menu,
  X,
  ChevronRight,
  AlertTriangle,
  Home as HomeIcon,
  ClipboardList,
  CalendarClock,
  Activity,
  Plus,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getMenuForLabType } from "./menu";
import LoadingScreen from "../loadingPage";
import Modal from "../modal";
import LabPilotLogo from "../LabPilotLogo"; // adjust path to wherever the logo file lives

// Same admin-bypass + `modules.includes` rule as hasModuleAccess in Home.jsx,
// RequireModules in App.jsx, and getMenuForLabType in menu.js — kept local
// so the bottom quick-access bar only ever shows buttons this user's
// modules actually grant.
const hasModuleAccess = (user, moduleKey) => {
  if (moduleKey === null) return true;
  const isAdmin = user?.role === "admin";
  return isAdmin || !!user?.modules?.includes(moduleKey);
};

// Small helper so each bottom-bar item can carry its own accent color and
// active-state pill background, instead of one flat color for the whole bar.
const NavItem = ({ to, end, icon: Icon, label, activeText, activeBg, onClick }) => (
  <NavLink to={to} end={end} onClick={onClick} className="flex-1 h-full flex items-center justify-center">
    {({ isActive }) => (
      <div className={`flex flex-col items-center justify-center gap-1 ${isActive ? activeText : "text-gray-400"}`}>
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
            isActive ? activeBg : ""
          }`}
        >
          <Icon className="w-5 h-5" strokeWidth={isActive ? 2.4 : 2} />
        </div>
        <span className={`text-[10px] font-anek ${isActive ? "font-bold" : "font-medium"}`}>{label}</span>
      </div>
    )}
  </NavLink>
);

const MobileMenu = () => {
  const logout = useAuthStore((s) => s.logout);
  const lab = useAuthStore((s) => s.lab);
  const user = useAuthStore((s) => s.user);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lastScroll, setLastScroll] = useState(0);
  const [scrollDirection, setScrollDirection] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const visibleMenu = getMenuForLabType(lab?.type, user);

  const isAdmin = user?.role === "admin";

  // Quick-access slots for the bottom bar. Home/My Activity/Menu are
  // `module: null` in menu.js (always visible); Report/Invoice only render
  // if this user's modules grant them — same rule as the full drawer menu,
  // so nothing here ever 404s. Admins get a fixed 5-slot layout instead
  // (see isAdmin branch below), so these module checks only matter for
  // non-admin users.
  const hasReportAccess = hasModuleAccess(user, "testReport");
  const hasInvoiceAccess = hasModuleAccess(user, "invoice");

  // A raised, centered FAB only reads as intentional when it's the true
  // middle item of an odd-length row (3 or 5 total: equal items on each
  // side). If Invoice were added as a FAB on top of an odd side-item count,
  // the total would land on an even number and the "center" button would
  // sit off-center — so in that case it renders as a normal flat icon
  // instead, keeping the row visually balanced either way.
  const sideItemCount = 3 + (hasReportAccess ? 1 : 0); // Home + Activity + Menu, +Report if granted
  const totalWithInvoiceFab = hasInvoiceAccess ? sideItemCount + 1 : sideItemCount;
  const showInvoiceAsFab = hasInvoiceAccess && totalWithInvoiceFab % 2 === 1;
  const showInvoiceFlat = hasInvoiceAccess && !showInvoiceAsFab;

  useEffect(() => {
    const handleScroll = () => {
      const currentScroll = window.pageYOffset;
      if (currentScroll <= 0) {
        setScrollDirection("");
        return;
      }
      if (currentScroll > lastScroll && scrollDirection !== "down") {
        setScrollDirection("down");
      } else if (currentScroll < lastScroll && scrollDirection === "down") {
        setScrollDirection("up");
      }
      setLastScroll(currentScroll);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScroll, scrollDirection]);

  const toggleMenu = () => setIsMenuOpen((v) => !v);
  const closeMenu = () => setIsMenuOpen(false);

  useEffect(() => {
    const locked = isMenuOpen || showConfirm;
    document.body.style.overflow = locked ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMenuOpen, showConfirm]);

  const handleLogoutClick = () => {
    closeMenu();
    setTimeout(() => setShowConfirm(true), 150);
  };

  const handleLogoutConfirm = async () => {
    setShowConfirm(false);
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
  };

  return (
    <>
      {/* ─── Mobile Navbar (bottom, quick-access) ──────────────────────── */}
      <div className="lg:hidden font-anek">
        {/* Spacer — matches the bar's floating offset (16 height + margins) */}
        <div className="h-20" />

        <nav
          className={`
            fixed bottom-0 left-0 right-0 z-50
            px-3 pb-3
            transition-transform duration-300
            ${scrollDirection === "down" ? "translate-y-[150%]" : "translate-y-0"}
          `}
        >
          <div className="relative mx-auto max-w-md h-16 px-1 flex items-center rounded-3xl bg-gradient-to-br from-white via-indigo-50/70 to-purple-50/70 backdrop-blur-xl border border-indigo-100/70 shadow-[0_10px_30px_rgba(79,70,229,0.15)]">
            <NavItem to="/" end icon={HomeIcon} label="হোম" activeText="text-indigo-600" activeBg="bg-indigo-50" />

            {isAdmin ? (
              <>
                {/* Left of the center FAB — Sales Report.
                   Flat route, matching the single-segment style used
                   throughout Setup.jsx (/manage-tests, /manage-staffs, etc). */}
                <NavItem
                  to="/sales-report"
                  icon={TrendingUp}
                  label="সেলস রিপোর্ট"
                  activeText="text-emerald-600"
                  activeBg="bg-emerald-50"
                  onClick={closeMenu}
                />

                {/* Elevated FAB — Daily Reports hub, admin-only center slot.
                   Route confirmed against menu.js (dailyReport module). */}
                <div className="flex-1 flex items-center justify-center">
                  <Link
                    to="/daily-reports"
                    onClick={closeMenu}
                    aria-label="ডেইলি রিপোর্টস"
                    className="-mt-8 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/40 ring-4 ring-white active:scale-95 transition-transform duration-150"
                  >
                    <CalendarClock className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </Link>
                </div>

                {/* Right of the center FAB — Cashmemo Report.
                   Flat route, matching the single-segment style confirmed by
                   Setup.jsx. Still not in menu.js, so double-check this
                   against your router if CashMemo.jsx lives elsewhere. */}
                <NavItem
                  to="/cashmemo"
                  icon={Receipt}
                  label="ক্যাশমেমো"
                  activeText="text-amber-600"
                  activeBg="bg-amber-50"
                  onClick={closeMenu}
                />
              </>
            ) : (
              <>
                {hasReportAccess && (
                  <NavItem
                    to="/report"
                    icon={ClipboardList}
                    label="রিপোর্টস"
                    activeText="text-emerald-600"
                    activeBg="bg-emerald-50"
                  />
                )}

                {/* Elevated FAB — only when it lands as the true center of an
                   odd-length row (see showInvoiceAsFab above). Otherwise the
                   same action renders as a flat icon further down. */}
                {showInvoiceAsFab && (
                  <div className="flex-1 flex items-center justify-center">
                    <Link
                      to="/outdoor/invoice/new"
                      onClick={closeMenu}
                      aria-label="নতুন ইনভয়েস"
                      className="-mt-8 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/40 ring-4 ring-white active:scale-95 transition-transform duration-150"
                    >
                      <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </Link>
                  </div>
                )}

                {showInvoiceFlat && (
                  <NavItem
                    to="/outdoor/invoice/new"
                    end
                    icon={Plus}
                    label="নতুন"
                    activeText="text-indigo-600"
                    activeBg="bg-indigo-50"
                    onClick={closeMenu}
                  />
                )}

                <NavItem
                  to="/my-activity"
                  icon={Activity}
                  label="এক্টিভিটি"
                  activeText="text-amber-600"
                  activeBg="bg-amber-50"
                />
              </>
            )}

            <button
              onClick={toggleMenu}
              className="flex-1 h-full flex items-center justify-center"
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            >
              <div
                className={`flex flex-col items-center justify-center gap-1 ${
                  isMenuOpen ? "text-slate-700" : "text-gray-400"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    isMenuOpen ? "bg-slate-100" : ""
                  }`}
                >
                  {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </div>
                <span className={`text-[10px] font-anek ${isMenuOpen ? "font-bold" : "font-medium"}`}>মেনু</span>
              </div>
            </button>
          </div>
        </nav>
      </div>

      {isMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      <div
        className={`
          lg:hidden font-anek fixed top-0 right-0 h-full w-80 max-w-[85vw]
          bg-white/95 backdrop-blur-xl z-50 shadow-2xl
          transform transition-transform duration-300 ease-out
          ${isMenuOpen ? "translate-x-0" : "translate-x-full"}
        `}
        aria-hidden={!isMenuOpen}
      >
        <div className="flex flex-col h-full">
          {/* Drawer Header */}
          <div className="relative flex-shrink-0 overflow-hidden p-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 border-b border-white/10">
            {/* Soft colored glows + top sheen for depth (decorative) */}
            <div className="pointer-events-none absolute -top-16 -left-10 w-56 h-56 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -right-10 w-56 h-56 rounded-full bg-violet-500/25 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

            <div className="relative flex items-center justify-between">
              <LabPilotLogo theme="dark" iconClassName="w-10 h-10" showPulse={false} className="min-w-0" />
              <button
                onClick={closeMenu}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 hover:bg-white/20 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Menu Content */}
          <div className="flex-1 overflow-y-auto px-3 py-4 bg-gray-50/50">
            <div className="space-y-0.5">
              {visibleMenu.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end
                    onClick={closeMenu}
                    className={({ isActive }) =>
                      `flex items-center gap-1 px-4 py-1 rounded-xl transition-all duration-200 group ${
                        isActive
                          ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200/80 shadow-sm"
                          : "text-gray-600 hover:bg-white hover:text-gray-900 border border-transparent"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div
                          className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                            isActive
                              ? "bg-blue-100 text-blue-600"
                              : "bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-medium text-base flex-1 truncate">{item.label}</span>
                        <ChevronRight
                          className={`w-5 h-5 shrink-0 ${
                            isActive ? "text-blue-600" : "text-gray-400 group-hover:translate-x-0.5"
                          } transition-transform`}
                        />
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="flex-shrink-0 p-4 border-t border-gray-200/80 bg-white/50">
            <button
              onClick={handleLogoutClick}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-gray-700 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all duration-200 group"
            >
              <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span className="text-red-600 font-medium text-base">লগ আউট</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Logout confirm modal ────────────────────────────────────────── */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} size="sm">
        <div className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 border border-red-100">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Logout</h3>
            <p className="text-base text-gray-500 mb-8 px-4">
              Are you sure you want to sign out of <strong>LabPilot Pro</strong>?
            </p>

            <div className="flex w-full gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl text-base font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogoutConfirm}
                className="flex-1 px-4 py-3 rounded-xl text-base font-semibold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-all active:scale-95"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {loggingOut && <LoadingScreen message="Signing you out" />}
    </>
  );
};

export default MobileMenu;
