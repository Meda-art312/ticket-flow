import { useEffect, useRef, useState } from "react";
import { ApiError } from "./client";
import { onClearCommands } from "./session";

type Command = { key: string; body: string; uncertain: boolean };
const pending = new Map<string, Command>();
onClearCommands(() => pending.clear());
export function useCommand(scope: string) {
  const busy = useRef(false);
  const active = useRef(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [uncertain, setUncertain] = useState(
    pending.get(scope)?.uncertain || false,
  );
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
  async function execute<T>(
    body: unknown,
    operation: (key: string) => Promise<T>,
  ): Promise<T | undefined> {
    if (busy.current) return;
    const serialized = JSON.stringify(body);
    const previous = pending.get(scope);
    if (previous && previous.body !== serialized) {
      setError(
        new Error(
          "An earlier request has an uncertain outcome. Restore the original input and retry, or refresh its status first.",
        ),
      );
      return;
    }
    const command = previous || {
      key: crypto.randomUUID(),
      body: serialized,
      uncertain: false,
    };
    pending.set(scope, command);
    busy.current = true;
    setRunning(true);
    setError(null);
    try {
      const result = await operation(command.key);
      pending.delete(scope);
      if (active.current) setUncertain(false);
      return result;
    } catch (failure) {
      const problem =
        failure instanceof Error ? failure : new Error("Request failed");
      command.uncertain = failure instanceof ApiError && failure.ambiguous;
      if (!command.uncertain) pending.delete(scope);
      if (active.current) {
        setError(problem);
        setUncertain(command.uncertain);
      }
    } finally {
      busy.current = false;
      if (active.current) setRunning(false);
    }
  }
  return {
    execute,
    running,
    error,
    uncertain,
    clearError: () => setError(null),
  };
}
