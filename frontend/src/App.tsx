import { Route, Routes, useLocation } from "react-router";
import { BuildingFormPage } from "./admin/BuildingFormPage";
import { BuildingsPage } from "./admin/BuildingsPage";
import { RequireAuth } from "./auth/RequireAuth";
import { TopBar } from "./components";
import { LandingPage } from "./landing/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RegisterPage } from "./pages/RegisterPage";
import { BookingPage } from "./residences/BookingPage";
import { BookingsPage } from "./residences/BookingsPage";
import { BookingStatusPage } from "./residences/BookingStatusPage";
import { ResidenceDetailsPage } from "./residences/ResidenceDetailsPage";
import { ResidencesPage } from "./residences/ResidencesPage";
import { ScrollManager } from "./ScrollManager";
import { StatusPage } from "./pages/StatusPage";

// These pages have their own header: the home page hero, the public site pages (SiteHeader) and the two-column auth pages.
const NO_TOP_BAR = ["/", "/login", "/register", "/onboarding"];
const SITE_PAGES = ["/residences", "/book/", "/bookings"];
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
        <Route path="/admin/buildings" element={<RequireAuth roles={["admin"]}><BuildingsPage /></RequireAuth>} />
        <Route path="/admin/buildings/new" element={<RequireAuth roles={["admin"]}><BuildingFormPage /></RequireAuth>} />
        <Route path="/admin/buildings/:id" element={<RequireAuth roles={["admin"]}><BuildingFormPage /></RequireAuth>} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </>
  );
}
