/**
 * The native Bun registration surface used by this repository. These are module
 * types, not a runtime adapter or global Bun environment. In particular, do not
 * load @types/bun: its fetch.preconnect requirement changes standard fetch mocks.
 * Bun passes done callbacks when a test body has parameters; project context and
 * onFinish belong to runner.ts rather than to this zero-argument native surface.
 */
export type NativeBody = () => unknown;
export interface TestRegistration {
  (name: string, body: NativeBody, timeout?: number): void;
  skip(name: string, body: NativeBody, timeout?: number): void;
}
export const it: TestRegistration;
export const test: TestRegistration;
export function describe(name: string, body: () => void): void;
export function beforeAll(body: NativeBody, timeout?: number): void;
export function afterAll(body: NativeBody, timeout?: number): void;
export function beforeEach(body: NativeBody, timeout?: number): void;
export function afterEach(body: NativeBody, timeout?: number): void;
