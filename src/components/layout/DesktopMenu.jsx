import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LogOut, AlertTriangle } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getMenuForLabType } from "./menu";
import LoadingScreen from "../loadingPage";
import Modal from "../modal";
import LabPilotLogo from "../LabPilotLogo"; // put LabPilotLogo.jsx in src/components/

const DesktopMenu = () => {
  const logout = useAuthStore((s) => s.logout);
  const lab = useAuthStore((s) => s.lab);
  const user = useAuthStore((s) => s.user);

  const [showConfirm, setShowConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const visibleMenu = getMenuForLabType(lab?.type, user);

  const handleLogoutConfirm = async () => {
    setShowConfirm(false);
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
  };

  return (
    <>
      <nav className="hidden font-anek lg:flex w-64 fixed left-0 top-0 h-screen flex-col bg-sky-200/10 backdrop-blur-md border-r border-gray-200/80 shadow-lg z-40">
        {/* ── Brand Header ─────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 py-4 bg-gradient-to-br from-blue-200 to-slate-200 border-b border-slate-200">
          <LabPilotLogo iconClassName="w-10 h-10" />
        </div>

        {/* ── Scrollable Menu ───────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden bg-gray-50/50">
          <div className="h-full overflow-y-auto px-3 py-4">
            <div className="space-y-0.2">
              {visibleMenu.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end
                    className={({ isActive }) =>
                      `flex items-center gap-1 px-3 py-1 rounded-xl transition-all duration-200 group ${
                        isActive
                          ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200/80 shadow-sm"
                          : "text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm border border-transparent"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div
                          className={`
                            w-9 h-9 rounded-lg flex items-center justify-center
                            transition-all duration-200 flex-shrink-0
                            ${
                              isActive
                                ? "bg-blue-100 text-blue-600"
                                : "bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-600"
                            }
                          `}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-[15px] flex-1">{item.label}</span>
                        {isActive && <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse" />}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Footer – Logout ───────────────────────────────────────── */}
        <div className="flex-shrink-0 p-4 border-t border-gray-200/80 bg-white/50 backdrop-blur-sm">
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl
              text-gray-700 hover:text-red-600 hover:bg-red-50
              border border-transparent hover:border-red-200
              transition-all duration-200 group"
          >
            <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span className="text-red-600 font-medium">লগ আউট</span>
          </button>
        </div>
      </nav>

      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} size="sm">
        <div className="p-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-4 border border-red-100">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Logout</h3>
            <p className="text-md text-gray-500 mb-8 px-2 leading-relaxed">
              Are you sure you want to sign out of <strong>LabPilot Pro</strong>?
            </p>

            <div className="flex w-full gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogoutConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-all active:scale-95"
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

export default DesktopMenu;
