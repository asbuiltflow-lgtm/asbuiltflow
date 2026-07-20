import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import { Privacy, Terms } from "./pages/Legal";
import Demo from "./Demo";
import ProtectedWorkspace from "./auth/ProtectedWorkspace";
import SetupPasswordPage from "./auth/SetupPasswordPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/app/setup-password" element={<SetupPasswordPage />} />
      <Route path="/app/*" element={<ProtectedWorkspace />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
    </Routes>
  );
}
