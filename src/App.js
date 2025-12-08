import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Rabatt from "./pages/Rabatt";
import RabattDetail from "./pages/RabattDetail";
import RabattTilgen from "./pages/RabattTilgen";
import Bestellungen from "./pages/Bestellungen";
import Kunden from "./pages/Kunden";
import Einstellungen from "./pages/Einstellungen";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/rabatt" element={<Rabatt />} />
        <Route path="/rabatt/:id" element={<RabattDetail />} />
        <Route path="/rabatt/:id/tilgen" element={<RabattTilgen />} />
        <Route path="/bestellungen" element={<Bestellungen />} />
        <Route path="/kunden" element={<Kunden />} />
        <Route path="/einstellungen" element={<Einstellungen />} />
      </Routes>
    </Router>
  );
}

export default App;
