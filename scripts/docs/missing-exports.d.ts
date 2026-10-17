/** Pinned 4.1.4 exports one loader and ships no declaration file. */
declare module "typedoc-plugin-missing-exports" {
  export function load(app: import("typedoc").Application): void;
}
