"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

export function useLiveRefresh<T>({
  url,
  onData,
  urgent = false,
}: {
  url: string;
  onData: (data: T) => void;
  urgent?: boolean;
}) {
  const onDataRef = useRef(onData);
  const requestRef = useRef<Promise<void> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState("");

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  const refresh = useCallback(async () => {
    if (requestRef.current) return requestRef.current;
    const work = (async () => {
      setRefreshing(true);
      try {
        const response = await fetch(url, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Could not refresh information.");
        }
        onDataRef.current(payload as T);
        setLastUpdated(new Date());
        setRefreshError("");
      } catch {
        setRefreshError("Live update paused. We’ll try again shortly.");
      } finally {
        setRefreshing(false);
        requestRef.current = null;
      }
    })();
    requestRef.current = work;
    return work;
  }, [url]);

  useEffect(() => {
    const interval = window.setInterval(refresh, urgent ? 4_000 : 15_000);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, urgent]);

  return { refresh, refreshing, lastUpdated, refreshError };
}

export function RefreshButton({
  refreshing,
  lastUpdated,
  onRefresh,
}: {
  refreshing: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
}) {
  return (
    <button
      type="button"
      className="live-refresh-button"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={refreshing ? "Refreshing information" : "Refresh information"}
      title={lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : "Refresh information"}
    >
      <RefreshCw className={refreshing ? "spinning" : ""} size={16} />
      <span>{refreshing ? "Refreshing" : lastUpdated ? "Updated just now" : "Refresh"}</span>
    </button>
  );
}
