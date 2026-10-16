/** Internal preload state. Normal replay never reads a capture environment path. */
export interface CaptureSession {
  fixtureRoot: string;
  mode: "recache" | "nocache" | "geo-record" | "geo-replay";
  interval: number;
  profile?: string;
}

const key = Symbol.for("yahoo-finance2.capture-session");

export function captureSession(): CaptureSession | undefined {
  return (globalThis as Record<symbol, unknown>)[key] as
    | CaptureSession
    | undefined;
}

export function installCaptureSession(session: CaptureSession): void {
  if (captureSession()) throw new Error("Capture session already installed");
  Object.defineProperty(globalThis, key, { value: Object.freeze(session) });
}
