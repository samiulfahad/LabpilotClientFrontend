import { useState, useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "./store/authStore";

import LabPilotLogin from "./pages/login";
import Home from "./pages/home";
import Layout from "./components/layout";
import Report from "./pages/report";
import ReportUpload from "./pages/reportUpload";
import ReportDownload from "./pages/reportDownload";
import HelpCenter from "./pages/helpCenter";
import Popup from "./components/popup";
import AuthLoadingScreen from "./components/AuthLoadingScreen";

// Set Password
import SetPassword from "./pages/setPassword";

// Account
import Account from "./pages/account";
import MyActivity from "./pages/myActivity";

// Billing
import Billing from "./pages/billing";

// Setup
import Setup from "./pages/setup";
import ManageTests from "./pages/setup/manageTests";
import ManageProducts from "./pages/setup/manageProducts";
import ManageStaffs from "./pages/setup/manageStaffs";
import ManageReferrers from "./pages/setup/manageReferrers";
import ManageDoctors from "./pages/setup/manageDoctors";
import ManageSpaces from "./pages/setup/manageAdmissionSpace";

// Daily Reports
import DailyReports from "./pages/dailyReports";
import CashMemo from "./pages/dailyReports/cashmemo";
import SalesReport from "./pages/dailyReports/salesReport";
import CommissionReport from "./pages/dailyReports/commissionReport";
import CollectionReport from "./pages/dailyReports/collectionReport";

// Outdoor Patient
import OutdoorPatientHub from "./pages/outdoorPatient";
import CreateInvoice from "./pages/outdoorPatient/createInvoice";
import SearchInvoice from "./pages/outdoorPatient/searchInvoice";
import InvoiceList from "./pages/outdoorPatient/invoiceList";
import DeleteInvoices from "./pages/outdoorPatient/deleteInvoice";
import PrintInvoice from "./pages/outdoorPatient/createInvoice/PrintInvoice";

// Indoor Patient
import IndoorPatientHub from "./pages/indoorPatient/index";
import AdmitPatient from "./pages/indoorPatient/AdmitPatient";
import SearchPatient from "./pages/indoorPatient/SearchPatient";
import PatientList from "./pages/indoorPatient/PatientList";
import PatientDetails from "./pages/indoorPatient/PatientDetails";
import AddItemsToPatient from "./pages/indoorPatient/AddItemsToPatient";

// Expense Hub
import ExpenseHub from "./pages/expense";
import AddExpense from "./pages/expense/AddExpense";
import ExpenseList from "./pages/expense/ExpenseList";
import DeleteExpense from "./pages/expense/DeleteExpense";
import ExpenseReport from "./pages/dailyReports/expenseReport";
import DiscountReport from "./pages/dailyReports/discountReport";
import ManageTestConfig from "./pages/setup/manageTestConfig";

// ─── Route Wrapper for Protected Pages ──────────────────────────────────────
const ProtectedRoutes = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // If not logged in, kick them to the login page
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  // If logged in, show the Layout (Sidebar/Navbar) and the requested page
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

// ─── Route Wrapper for Module-Gated Pages ───────────────────────────────────
// Mirrors the backend's `requireModule` hook: admins always pass; everyone
// else needs at least one of the listed modules in their JWT's `modules`
// array. Wraps a group of routes (a layout route with no `path`), so one
// wrapper can gate anywhere from a single page (billing) to a whole cluster
// (invoice: hub + create + search + list + delete + print).
//
// On denial, shows the "denied" Popup in place (rather than redirecting
// instantly) so the person sees why the page didn't load. Redirect to "/"
// only happens once they close it — `redirect` starts false and flips true
// in Popup's onClose, which fires after its own close animation.
const RequireModules = ({ modules }) => {
  const user = useAuthStore((s) => s.user);
  const [redirect, setRedirect] = useState(false);

  const isAdmin = user?.role === "admin";
  const hasAccess = isAdmin || modules.some((m) => user?.modules?.includes(m));

  if (!hasAccess) {
    if (redirect) {
      return <Navigate to="/" replace />;
    }
    return <Popup type="denied" message="এই মডিউলে প্রবেশের অনুমতি আপনার নেই।" onClose={() => setRedirect(true)} />;
  }

  return <Outlet />;
};

// ─── Main App Component ─────────────────────────────────────────────────────
function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const initialize = useAuthStore((s) => s.initialize);

  // Runs once per tab/mount. `user`/`token` are intentionally NOT persisted
  // (see authStore.js), so a fresh tab or a hard reload always starts with
  // those null even though `lab` is already hydrated from localStorage.
  // This exchanges the httpOnly refresh cookie for a new access token so
  // the existing session is picked up instead of bouncing to /login.
  // isInitializing starts true and flips false once this resolves (success
  // or failure) — see the gate below.
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Block rendering routes until we know the real auth state. Without this,
  // ProtectedRoutes reads isAuthenticated as false on the very first render
  // (before /refresh has had a chance to resolve) and redirects to /login
  // even though the session is actually still valid.
  if (isInitializing) {
    return <AuthLoadingScreen />;
  }

  return (
    <Routes>
      {/* ════ PUBLIC ROUTES (No login required) ════ */}
      {/* If they are already logged in, don't show them the login page again */}
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LabPilotLogin />} />

      {/* Help is now public and accessible without logging in */}
      <Route path="/set-password" element={<SetPassword />} />

      {/* ════ PROTECTED ROUTES (Login required) ════ */}
      <Route element={<ProtectedRoutes />}>
        <Route path="/" element={<Home />} />
        <Route path="/help" element={<HelpCenter />} />

        {/* Daily Reports — module: dailyReport */}
        <Route element={<RequireModules modules={["dailyReport"]} />}>
          <Route path="/daily-reports" element={<DailyReports />} />
          <Route path="/cashmemo" element={<CashMemo />} />
          <Route path="/sales-report" element={<SalesReport />} />
          <Route path="/expense-report" element={<ExpenseReport />} />
          <Route path="/commission-report" element={<CommissionReport />} />
          <Route path="/collection-report" element={<CollectionReport />} />
          <Route path="/discount-report" element={<DiscountReport />} />
        </Route>

        {/* Outdoor Patient / Invoice — module: invoice */}
        <Route element={<RequireModules modules={["invoice"]} />}>
          <Route path="/outdoor" element={<OutdoorPatientHub />} />
          <Route path="/invoice-master" element={<OutdoorPatientHub />} />
          <Route path="/outdoor/search-invoice" element={<SearchInvoice />} />
          <Route path="/outdoor/invoice/new" element={<CreateInvoice />} />
          <Route path="/outdoor/invoice/print/:invoiceId" element={<PrintInvoice />} />
          <Route path="/outdoor/invoice/all" element={<InvoiceList />} />
          <Route path="/outdoor/invoice/delete" element={<DeleteInvoices />} />
        </Route>

        {/* Indoor Patient — module: indoorPatient */}
        <Route element={<RequireModules modules={["indoorPatient"]} />}>
          <Route path="/ipd-master" element={<IndoorPatientHub />} />
          <Route path="/ipd/admit" element={<AdmitPatient />} />
          <Route path="/ipd/search" element={<SearchPatient />} />
          <Route path="/ipd/patients" element={<PatientList />} />
          <Route path="/ipd/patient/:id" element={<PatientDetails />} />
          <Route path="/ipd/add-items" element={<AddItemsToPatient />} />
        </Route>

        {/* Pathological Report — module: testReport */}
        <Route element={<RequireModules modules={["testReport"]} />}>
          <Route path="/report" element={<Report />} />
          <Route path="/report-upload" element={<ReportUpload />} />
          <Route path="/report-download" element={<ReportDownload />} />
        </Route>

        {/* Set up — module: setup (manage-staffs is admin-only, ungated here
            since staffRoutes.js on the backend already restricts it to
            role === "admin" regardless of module) */}
        <Route element={<RequireModules modules={["setup"]} />}>
          <Route path="/setup" element={<Setup />} />
          <Route path="/manage-tests" element={<ManageTests />} />
          <Route path="/manage-testConfig" element={<ManageTestConfig />} />
          <Route path="/manage-products" element={<ManageProducts />} />
          <Route path="/manage-referrers" element={<ManageReferrers />} />
          <Route path="/manage-doctors" element={<ManageDoctors />} />
          <Route path="/manage-spaces" element={<ManageSpaces />} />
          <Route path="/manage-staffs" element={<ManageStaffs />} />
        </Route>

        {/* Expense — module: expense */}
        <Route element={<RequireModules modules={["expense"]} />}>
          <Route path="/expense" element={<ExpenseHub />} />
          <Route path="/expense/new" element={<AddExpense />} />
          <Route path="/expense/all" element={<ExpenseList />} />
          <Route path="/expense/delete" element={<DeleteExpense />} />
        </Route>

        {/* Account — no module gate */}
        <Route path="/account" element={<Account />} />
        <Route path="/my-activity" element={<MyActivity />} />

        {/* Billing — module: billing (single component) */}
        <Route element={<RequireModules modules={["billing"]} />}>
          <Route path="/billing" element={<Billing />} />
        </Route>
      </Route>
      {/* Catch-all: Redirect unknown URLs to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
