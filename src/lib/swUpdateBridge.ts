type SwUpdateListener = (available: boolean) => void;

let updateAvailable = false;
let applyUpdateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<SwUpdateListener>();

export function reportSwUpdateAvailable(
  applyFn: (reloadPage?: boolean) => Promise<void>
): void {
  updateAvailable = true;
  applyUpdateFn = applyFn;
  for (const cb of listeners) {
    cb(true);
  }
}

export function isSwUpdateAvailable(): boolean {
  return updateAvailable;
}

export function subscribeSwUpdate(listener: SwUpdateListener): () => void {
  listeners.add(listener);
  listener(updateAvailable);
  return () => {
    listeners.delete(listener);
  };
}

export async function applySwUpdateAndReload(): Promise<void> {
  if (applyUpdateFn) {
    await applyUpdateFn(true);
  } else if (typeof window !== 'undefined') {
    window.location.reload();
  }
}
