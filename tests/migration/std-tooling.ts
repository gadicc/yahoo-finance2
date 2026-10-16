/** Imported by deferred Deno tooling, never called by the replay tests.
 * Fail explicitly if the experiment unexpectedly reaches these runtime paths.
 */
export function walk(..._args: unknown[]): AsyncIterable<{ path: string }> {
  throw new Error("Deno fixture traversal is outside the runner experiment");
}
export function parseArgs(..._args: unknown[]): {
  help?: boolean;
  _: string[];
  country?: string;
  profile?: string;
} {
  throw new Error("Deno capture CLI is outside the runner experiment");
}
