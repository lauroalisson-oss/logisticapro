// Hook that drains the offline action queue automatically.
//
//  - flushes once on mount
//  - flushes on the `online` event when connectivity is restored
//  - flushes on tab visibility change (driver puts the screen back on)
//  - flushes on a 30 s safety interval
//
// Components also call the returned `flush` directly right after enqueueing
// to keep the happy path low-latency online.

import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueAction, flushActionQueue, getQueueSize } from "@/lib/actionQueue";

export function useActionQueue() {
  const flushingRef = useRef(false);
  const [pending, setPending] = useState(0);

  const refreshSize = useCallback(async () => {
    try { setPending(await getQueueSize()); } catch { /* ignore */ }
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      await flushActionQueue();
    } finally {
      flushingRef.current = false;
      refreshSize();
    }
  }, [refreshSize]);

  const enqueue = useCallback(async (action) => {
    const rec = await enqueueAction(action);
    refreshSize();
    flush();
    return rec;
  }, [flush, refreshSize]);

  useEffect(() => {
    refreshSize();
    flush();
    const onOnline = () => flush();
    const onVisible = () => { if (document.visibilityState === "visible") flush(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(flush, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [flush, refreshSize]);

  return { enqueue, flush, pending };
}
