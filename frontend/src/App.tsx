import { Route, Routes, useLocation } from "react-router";
import { BuildingFormPage } from "./admin/BuildingFormPage";
import { BuildingsPage } from "./admin/BuildingsPage";
import { RequireAuth } from "./auth/RequireAuth";
import { TopBar } from "./components";
import { ListingsPage } from "./listings/ListingsPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RegisterPage } from "./pages/RegisterPage";
import { StatusPage } from "./pages/StatusPage";

// These pages have their own header (the landing hero and the two-column auth pages).
const NO_TOP_BAR = ["/login", "/register", "/onboarding"];

export function App() {
  const { pathname } = useLocation();
  return (
    <>
      {!NO_TOP_BAR.includes(pathname) && <TopBar />}
      <Routes>
        <Route path="/" element={<ListingsPage />} />
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
        <Route path="*" element={<ListingsPage />} />
      </Routes>
    </>
  );
}
