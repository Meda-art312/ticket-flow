import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/manrope";
import "@fontsource-variable/bricolage-grotesque";
import "./styles.css";
import { queryClient, SessionProvider, useSession } from "./api/session";
import { Shell } from "./components/Shell";
import { Empty, Loading } from "./components/ui";
import { Events, EventDetail } from "./pages/Events";
import { Auth } from "./pages/Auth";
import { Bookings, BookingDetail } from "./pages/Bookings";
import { TicketDetail } from "./pages/Tickets";
import { DemoCheckout } from "./pages/DemoCheckout";
import { Organizer, OrganizerEvent } from "./pages/Organizer";
function Protected({ organizer = false }: { organizer?: boolean }) {
  const session = useSession();
  const location = useLocation();
  if (session.restoring) return <Loading>Restoring your session…</Loading>;
  if (!session.user)
    return (
      <Navigate
        replace
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  if (organizer && !session.user.roles.includes("organizer"))
    return (
      <Empty title="This space is for organizers.">
        <p>Your account does not have organizer access.</p>
      </Empty>
    );
  return <Outlet />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Navigate to="/events" replace />} />
            <Route path="events" element={<Events />} />
            <Route path="events/:id" element={<EventDetail />} />
            <Route path="login" element={<Auth />} />
            <Route path="register" element={<Auth register />} />
            <Route element={<Protected />}>
              <Route path="bookings" element={<Bookings />} />
              <Route path="bookings/:id" element={<BookingDetail />} />
              <Route path="tickets/:id" element={<TicketDetail />} />
              <Route
                path="demo/checkout/:sessionId"
                element={<DemoCheckout />}
              />
              <Route
                path="checkout/return"
                element={<BookingDetail returned />}
              />
            </Route>
            <Route element={<Protected organizer />}>
              <Route path="organizer" element={<Organizer />} />
              <Route path="organizer/events/:id" element={<OrganizerEvent />} />
            </Route>
            <Route
              path="*"
              element={
                <Empty title="This page took a different route.">
                  <a href="/events">Back to events</a>
                </Empty>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  </QueryClientProvider>,
);
