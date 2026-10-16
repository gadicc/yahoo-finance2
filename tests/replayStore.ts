import FSStore from "fetch-mock-cache/stores/fs.ts";
import type { FMCCacheContent } from "fetch-mock-cache/store";
import type { FetchCacheOptions } from "fetch-mock-cache";
import { lstatSync, realpathSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

function plainFilename(name: string): void {
  // Windows device aliases remain reserved with extensions or stem-ending spaces.
  const stem = name.split(".", 1)[0].replace(/ +$/, "");
  if (
    basename(name) !== name ||
    /[\\/:<>"|?*]/.test(name) ||
    [...name].some((character) => character.charCodeAt(0) < 32) ||
    !name.endsWith(".json") ||
    name === ".json" ||
    /[. ]$/.test(name) ||
    /^(?:con|prn|aux|nul|conin\$|conout\$|(?:com|lpt)[1-9¹²³])$/i.test(stem)
  )
    throw new Error("Replay fixture id must be a portable plain filename");
}

/** FMC-compatible reads without mkdir, writes, or a writable-store fallback. */
export default class ReplayStore extends FSStore {
  constructor(options: ConstructorParameters<typeof FSStore>[0]) {
    super(options);
    this._location = resolve(
      options.location ?? join("tests", "fixtures", "http"),
    );
    try {
      if (lstatSync(this._location).isSymbolicLink()) {
        throw new Error("Replay fixture roots must not be symlinks");
      }
      // macOS commonly reaches a real temp directory through /var -> /private/var.
      this._location = realpathSync(this._location);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  override async idFromRequest(
    request: FMCCacheContent["request"],
    options?: FetchCacheOptions,
  ): Promise<string> {
    const name = await super.idFromRequest(request, options);
    plainFilename(name);
    return name;
  }

  override async cache_dir(filename: string): Promise<string> {
    plainFilename(filename);
    // Refuse aliased fixture roots/files. Missing paths remain missing: no mkdir.
    for (const path of [this._location, join(this._location, filename)]) {
      try {
        if (
          lstatSync(path).isSymbolicLink() ||
          relative(realpathSync(path), path) !== ""
        ) {
          throw new Error("Replay fixture paths must not use symlinks");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return join(this._location, filename);
  }

  override storeContent(
    _content: FMCCacheContent,
    _options?: FetchCacheOptions,
  ): Promise<void> {
    return Promise.reject(new Error("Replay fixture store is read-only"));
  }
}
