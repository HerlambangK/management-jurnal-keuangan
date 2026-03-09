const TRANSACTION_SYNC_EVENT = "budget-tracker:transaction-sync";
const TRANSACTION_SYNC_STORAGE_KEY = "budget-tracker:transaction-sync-ts";

export type TransactionSyncPayload = {
  source: string;
  timestamp: number;
};

const toPayload = (source: string): TransactionSyncPayload => ({
  source,
  timestamp: Date.now(),
});

export const emitTransactionSync = (source = "transaction-page") => {
  if (typeof window === "undefined") return;

  const payload = toPayload(source);
  window.dispatchEvent(new CustomEvent<TransactionSyncPayload>(TRANSACTION_SYNC_EVENT, { detail: payload }));

  try {
    localStorage.setItem(TRANSACTION_SYNC_STORAGE_KEY, String(payload.timestamp));
  } catch {
    // ignore localStorage failures
  }
};

export const subscribeTransactionSync = (
  onSync: (payload: TransactionSyncPayload) => void
): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<TransactionSyncPayload>;
    const payload = customEvent.detail;
    if (!payload?.timestamp) return;
    onSync(payload);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== TRANSACTION_SYNC_STORAGE_KEY || !event.newValue) return;

    const timestamp = Number(event.newValue);
    if (!Number.isFinite(timestamp)) return;

    onSync({
      source: "storage",
      timestamp,
    });
  };

  window.addEventListener(TRANSACTION_SYNC_EVENT, handleEvent as EventListener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(TRANSACTION_SYNC_EVENT, handleEvent as EventListener);
    window.removeEventListener("storage", handleStorage);
  };
};

