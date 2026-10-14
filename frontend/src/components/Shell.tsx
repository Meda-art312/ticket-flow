import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight, LogOut, Ticket } from "lucide-react";
import { useSession } from "../api/session";
import { ErrorNotice } from "./ui";
export function Shell() {
  const { user, restoring, logout } = useSession();
  const [error, setError] = useState<Error | null>(null);
  const [leaving, setLeaving] = useState(false);
  const location = useLocation();
  useEffect(() => {
    document.getElementById("main-content")?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="header">
        <Link to="/events" className="brand" aria-label="TicketFlow home">
          <span className="brand-mark">
            <Ticket size={22} strokeWidth={2} />
          </span>
          ticketflow<span className="brand-dot">.</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/events">Discover</NavLink>
          {user && <NavLink to="/bookings">My bookings</NavLink>}
          {user?.roles.includes("organizer") && (
            <NavLink to="/organizer">Organizer</NavLink>
          )}
        </nav>
        <div className="account-nav">
          {restoring ? (
            <span className="muted">Connecting…</span>
          ) : user ? (
            <>
              <span className="account-name">{user.display_name}</span>
              <button
                className="icon-button"
                aria-label="Log out"
                disabled={leaving}
                onClick={() => {
                  setLeaving(true);
                  void logout()
                    .catch(() =>
                      setError(
                        new Error(
                          "You are signed out in this page, but the service could not clear your cookie. Reconnect and log out again before sharing this browser.",
                        ),
                      ),
                    )
                    .finally(() => setLeaving(false));
                }}
              >
                <LogOut size={19} />
              </button>
            </>
          ) : (
            <Link to="/login" className="button compact">
              Sign in <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="main">
        <ErrorNotice error={error} />
        <Outlet />
      </main>
      <footer className="footer">
        <Link className="brand footer-brand" to="/events">
          ticketflow.
        </Link>
        <span>Good plans start here.</span>
        <span className="footer-end">A place for your next experience.</span>
      </footer>
    </>
  );
}
