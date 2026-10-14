import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Ticket } from "lucide-react";
import { useSession } from "../api/session";
import { ErrorNotice, Loading } from "../components/ui";
function safeNext(value: string | null) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/login") &&
    !value.startsWith("/register")
    ? value
    : "/events";
}
export function Auth({ register = false }: { register?: boolean }) {
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  if (session.restoring) return <Loading>Restoring your session…</Loading>;
  if (session.user) return <Navigate to={next} replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await session.login(
        {
          email: String(data.get("email")),
          password: String(data.get("password")),
          display_name: String(data.get("display_name") || ""),
        },
        register,
      );
      navigate(next, { replace: true });
    } catch (failure) {
      setError(failure as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-layout">
      <div className="auth-art">
        <Ticket size={64} strokeWidth={1} />
        <h1>
          {register ? (
            <>
              Your next
              <br />
              good story.
            </>
          ) : (
            <>
              More moments.
              <br />
              Less missing out.
            </>
          )}
        </h1>
        <p>
          Your plans, tickets, and little things to look forward to. All in one
          place.
        </p>
        <span className="auth-art-note">TICKETFLOW / GO MAKE A MEMORY</span>
      </div>
      <div className="auth-form">
        <h2>{register ? "Make yourself at home." : "Good to see you."}</h2>
        <p>
          {register
            ? "Create an account to save your place."
            : "Sign in to pick up your plans."}
        </p>
        <ErrorNotice error={error} />
        <form onSubmit={submit}>
          {register && (
            <label>
              Your name
              <input
                name="display_name"
                autoComplete="name"
                maxLength={200}
                required
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              aria-label="Password"
              aria-describedby={register ? "password-hint" : undefined}
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={12}
              maxLength={128}
              required
            />
            {register && (
              <small id="password-hint">At least 12 characters.</small>
            )}
          </label>
          <button className="button full" disabled={busy}>
            {busy ? "One moment…" : register ? "Create account" : "Sign in"}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Already have an account?" : "New around here?"}{" "}
          <Link
            to={`${register ? "/login" : "/register"}?next=${encodeURIComponent(next)}`}
          >
            {register ? "Sign in" : "Create an account"}
          </Link>
        </p>
        <details className="demo-help">
          <summary>Using the local demo?</summary>
          <p>
            Use the account and password from your backend setup. Customer:
            customer@ticketflow.local. Organizer: organizer@ticketflow.local.
            Passwords are never included in this app.
          </p>
        </details>
      </div>
    </section>
  );
}
