import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Demo from "./Demo";
import { Privacy, Terms } from "./pages/Legal";
import MvpApp from "./mvp/MvpApp";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/app" element={<MvpApp />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
    </Routes>
  );
}