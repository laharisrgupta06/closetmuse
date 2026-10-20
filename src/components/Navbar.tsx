import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  Shirt,
  Sparkles,
  Users,
  Wand2,
  UserRound,
  Plus,
} from "lucide-react";
import "../App.css";

const NAV_ITEMS = [
  { to: "/closet", label: "My Closet" },
  { to: "/build", label: "Build" },
  { to: "/rooms", label: "Rooms" },
  { to: "/stylist", label: "AI Stylist" },
];

const MOBILE_NAV_ITEMS = [
  { to: "/closet", label: "Closet", icon: Shirt },
  { to: "/build", label: "Build", icon: Plus },
  { to: "/rooms", label: "Rooms", icon: Users },
  { to: "/stylist", label: "Stylist", icon: Sparkles },
  { to: "/profile", label: "Profile", icon: UserRound },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      <header className="navbar">
        <NavLink to="/closet" className="navbar-logo">
          Closet<span>Muse</span>
        </NavLink>

        <nav className="navbar-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `navbar-link${isActive ? " active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar-actions">
          <button
            className="icon-btn"
            aria-label="AI Stylist"
            onClick={() => navigate("/stylist")}
          >
            <Wand2 size={16} />
          </button>

          <button
            className="icon-btn"
            aria-label="Profile"
            onClick={() => navigate("/profile")}
          >
            <UserRound size={16} />
          </button>
        </div>
      </header>

      {/* Mobile bottom navigation */}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {MOBILE_NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname.startsWith(to);
          return (
            <button
              key={to}
              className={`mobile-nav-item${isActive ? " active" : ""}`}
              onClick={() => navigate(to)}
              aria-label={label}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}