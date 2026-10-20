import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Closet from "./pages/Closet";
import Build from "./pages/Build";
import Rooms from "./pages/Rooms";
import Stylist from "./pages/Stylist";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import { AuthProvider } from "./contexts/AuthContext";
import RequireAuth from "./components/RequireAuth";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public auth routes */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Redirect root to /closet */}
          <Route path="/" element={<Navigate to="/closet" replace />} />

          {/* Protected routes */}
          <Route path="/closet" element={<RequireAuth><Closet /></RequireAuth>} />
          <Route path="/build" element={<RequireAuth><Build /></RequireAuth>} />
          <Route path="/rooms" element={<RequireAuth><Rooms /></RequireAuth>} />
          <Route path="/stylist" element={<RequireAuth><Stylist /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/closet" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
