import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { QueryClient } from "@tanstack/react-query";
import {
  api,
  onSessionExpired,
  refreshSession,
  resetTransport,
  setAccessToken,
  type Model,
} from "./client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, error) =>
        count < 1 && "status" in error && Number(error.status) >= 500,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
let clearCommands = () => {};
export function onClearCommands(fn: () => void) {
  clearCommands = fn;
}
type Session = {
  user: Model<"User"> | null;
  restoring: boolean;
  login: (
    body: { email: string; password: string; display_name?: string },
    register?: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Session | null>(null);
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("ticketflow-session")
    : null;
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Model<"User"> | null>(null);
  const [restoring, setRestoring] = useState(true);
  const clear = useCallback(() => {
    resetTransport();
    void queryClient.cancelQueries();
    queryClient.clear();
    clearCommands();
    setUser(null);
  }, []);
  useEffect(() => {
    onSessionExpired(clear);
    let active = true;
    void refreshSession()
      .then(async (ok) => {
        if (ok) {
          const current = await api("/me", "get");
          if (active) setUser(current);
        }
      })
      .catch(() => {
        if (active) clear();
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    if (channel) channel.onmessage = () => clear();
    return () => {
      active = false;
      if (channel) channel.onmessage = null;
    };
  }, [clear]);
  const login: Session["login"] = async (body, register) => {
    clear();
    channel?.postMessage("account-changed");
    if (register)
      await api("/auth/register", "post", {
        body: { ...body, display_name: body.display_name || "" },
        anonymous: true,
      });
    const response = await api("/auth/login", "post", {
      body: { email: body.email, password: body.password },
      anonymous: true,
    });
    setAccessToken(response.access_token);
    setUser(await api("/me", "get"));
  };
  const logout = async () => {
    try {
      await api("/auth/logout", "post", { body: {}, anonymous: true });
    } finally {
      clear();
      channel?.postMessage("logout");
    }
  };
  return (
    <Context.Provider value={{ user, restoring, login, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error("Missing session");
  return session;
}
