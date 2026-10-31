import { Route, Routes } from "react-router";
import { BuildingFormPage } from "./admin/BuildingFormPage";
import { BuildingsPage } from "./admin/BuildingsPage";
import { RequireAuth } from "./auth/RequireAuth";
import { Ambient, TopBar } from "./components";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { RegisterPage } from "./pages/RegisterPage";

export function App() {
  return (
    <>
      <Ambient />
      <TopBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
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
        <Route path="*" element={<HomePage />} />
      </Routes>
    </>
  );
}
