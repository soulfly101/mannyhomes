import { Route, Routes, useLocation } from "react-router";
import { AdminDashboardPage } from "./admin/AdminDashboardPage";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminAgreementPage, AgreementsPage } from "./admin/AgreementsPage";
import { AgreementPage } from "./agreements/AgreementPage";
import { AllocatePage } from "./admin/AllocatePage";
import { AllocationsPage } from "./admin/AllocationsPage";
import { BuildingFormPage } from "./admin/BuildingFormPage";
import { BuildingsPage } from "./admin/BuildingsPage";
import { SignaturePage } from "./admin/SignaturePage";
import { RequireAuth } from "./auth/RequireAuth";
import { TopBar } from "./components";
import { LandingPage } from "./landing/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RegisterPage } from "./pages/RegisterPage";
import { BillPayPage } from "./residences/BillPayPage";
import { BookingPage } from "./residences/BookingPage";
import { BookingsPage } from "./residences/BookingsPage";
import { BookingStatusPage } from "./residences/BookingStatusPage";
import { ResidenceDetailsPage } from "./residences/ResidenceDetailsPage";
import { ResidencesPage } from "./residences/ResidencesPage";
import { TenantDashboardPage } from "./residences/TenantDashboardPage";
import { ScrollManager } from "./ScrollManager";
import { StatusPage } from "./pages/StatusPage";

// These pages have their own header: the home page hero, the public site pages (SiteHeader), the admin sidebar and the two-column auth pages.
const NO_TOP_BAR = ["/", "/login", "/register", "/onboarding"];
const SITE_PAGES = ["/residences", "/book/", "/bookings", "/dashboard", "/agreements", "/bills", "/admin"];
const usesTopBar = (path: string) => !NO_TOP_BAR.includes(path) && !SITE_PAGES.some((p) => path.startsWith(p));

export function App() {
  const { pathname } = useLocation();
  return (
    <>
      <ScrollManager />
      {usesTopBar(pathname) && <TopBar />}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/residences" element={<ResidencesPage />} />
        <Route path="/residences/:roomTypeId" element={<ResidenceDetailsPage />} />
        <Route
          path="/book/:roomTypeId"
          element={
            <RequireAuth roles={["tenant"]}>
              <BookingPage />
            </RequireAuth>
          }
        />
        <Route path="/agreements/:agreementId" element={<RequireAuth roles={["tenant"]}><AgreementPage /></RequireAuth>} />
        <Route path="/bills/:billId/pay" element={<RequireAuth roles={["tenant"]}><BillPayPage /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth roles={["tenant"]}><TenantDashboardPage /></RequireAuth>} />
        <Route path="/bookings" element={<RequireAuth roles={["tenant"]}><BookingsPage /></RequireAuth>} />
        <Route path="/bookings/:bookingId" element={<RequireAuth roles={["tenant"]}><BookingStatusPage /></RequireAuth>} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth roles={["admin"]}>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/buildings" element={<BuildingsPage />} />
          <Route path="/admin/buildings/new" element={<BuildingFormPage />} />
          <Route path="/admin/buildings/:id" element={<BuildingFormPage />} />
          <Route path="/admin/agreements" element={<AgreementsPage />} />
          <Route path="/admin/agreements/:agreementId" element={<AdminAgreementPage />} />
          <Route path="/admin/signature" element={<SignaturePage />} />
          <Route path="/admin/allocations" element={<AllocationsPage />} />
          <Route path="/admin/allocations/:bookingId" element={<AllocatePage />} />
        </Route>
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </>
  );
}
