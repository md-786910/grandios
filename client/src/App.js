import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { UnsavedChangesProvider } from "./context/UnsavedChangesContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Bonus from "./pages/Bonus";
import BonusDetail from "./pages/BonusDetail";
import BonusTilgen from "./pages/BonusTilgen";
import Bestellungen from "./pages/Bestellungen";
import Kunden from "./pages/Kunden";
import Einstellungen from "./pages/Einstellungen";

function App() {
  return (
    <AuthProvider>
      <UnsavedChangesProvider>
        <Router>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                background: "#111827",
                color: "#F9FAFB",
                borderRadius: "12px",
                padding: "12px 16px",
                fontSize: "13px",
              },
              success: {
                style: {
                  background: "#16A34A",
                  color: "#F9FAFB",
                },
              },
              error: {
                style: {
                  background: "#DC2626",
                  color: "#F9FAFB",
                },
              },
            }}
          />
          <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bonus"
            element={
              <ProtectedRoute>
                <Bonus />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bonus/:id"
            element={
              <ProtectedRoute>
                <BonusDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bonus/:id/tilgen"
            element={
              <ProtectedRoute>
                <BonusTilgen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bestellungen"
            element={
              <ProtectedRoute>
                <Bestellungen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bestellungen/:id"
            element={
              <ProtectedRoute>
                <Bestellungen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kunden"
            element={
              <ProtectedRoute>
                <Kunden />
              </ProtectedRoute>
            }
          />
          <Route
            path="/einstellungen"
            element={
              <ProtectedRoute>
                <Einstellungen />
              </ProtectedRoute>
            }
          />
        </Routes>
        </Router>
      </UnsavedChangesProvider>
    </AuthProvider>
  );
}

export default App;
