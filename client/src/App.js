import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Rabatt from "./pages/Rabatt";
import RabattDetail from "./pages/RabattDetail";
import RabattTilgen from "./pages/RabattTilgen";
import Bestellungen from "./pages/Bestellungen";
import Kunden from "./pages/Kunden";
import Einstellungen from "./pages/Einstellungen";

function App() {
  return (
    <AuthProvider>
      <Router>
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
            path="/rabatt"
            element={
              <ProtectedRoute>
                <Rabatt />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rabatt/:id"
            element={
              <ProtectedRoute>
                <RabattDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rabatt/:id/tilgen"
            element={
              <ProtectedRoute>
                <RabattTilgen />
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
    </AuthProvider>
  );
}

export default App;
