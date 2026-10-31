import { Route, Routes } from "react-router";
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
        <Route path="*" element={<HomePage />} />
      </Routes>
    </>
  );
}
