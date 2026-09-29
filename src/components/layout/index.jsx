import DesktopMenu from "./DesktopMenu";
import MobileMenu from "./MobileMenu";
import BillingBanner from "../../components/billingBanner";

const Layout = ({ children }) => {
  return (
    <div className="flex min-h-screen w-full max-w-full bg-slate-50 overflow-x-clip">
      <div className="print:hidden">
        <MobileMenu />
      </div>
      <div className="print:hidden">
        <DesktopMenu />
      </div>

      {/* min-w-0 lets this column shrink below its content's width */}
      <div className="flex-1 min-w-0 flex flex-col lg:ml-64 pb-16 lg:pb-0 print:pb-0 print:ml-0 overflow-x-clip">
        <BillingBanner />

        <main className="flex-1 min-w-0 bg-white/80 backdrop-blur-sm relative print:pt-0">{children}</main>

        {/* Global Footer – hide on print */}
        <footer className="print:hidden border-t border-gray-200/80 bg-white/50 backdrop-blur-sm relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-gray-500 order-2 sm:order-1">
                © {new Date().getFullYear()} LabPilot Pro. All rights reserved.
              </p>
              <p className="text-xs text-gray-400 order-1 sm:order-2">Designed & Developed by Samiul Fahad</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
