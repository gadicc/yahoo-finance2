import FSStore from "fetch-mock-cache/stores/fs.ts";
import type { FMCCacheContent } from "fetch-mock-cache/store";
import type { FetchCacheOptions } from "fetch-mock-cache";
import { basename, join } from "node:path";
import { rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fixtureRejectionReason } from "../check-recache-rate-limits.ts";
import type { CaptureSession } from "./session.ts";

/** Keep fire-and-forget FMC promise writes observable until the after hook. */
export function captureStore(session: CaptureSession) {
  const pending = new Set<Promise<void>>();
  let failure = false;
  class CaptureStore extends FSStore {
    constructor(options: ConstructorParameters<typeof FSStore>[0]) {
      super(options);
      this._location = session.fixtureRoot;
    }
    override async idFromRequest(
      request: FMCCacheContent["request"],
      options?: FetchCacheOptions,
    ) {
      const name = await super.idFromRequest(request, options);
      if (
        basename(name) !== name || name.includes("\\") || !name.endsWith(".json") ||
        name === ".json"
      ) throw new Error("Capture fixture id must be a plain filename");
      return name;
    }
    override storeContent(content: FMCCacheContent, options?: FetchCacheOptions): Promise<void> {
      const operation = (async () => {
        const name = await this.idFromRequest(content.request, options);
        if (
          session.mode === "nocache" || /\.(?:static|fake)\.json$/.test(name) ||
          (session.mode === "recache" && name.startsWith("getCrumb-geo-")) ||
          (session.mode !== "recache" &&
            !name.startsWith(`getCrumb-geo-${session.profile}-`))
        ) throw new Error("Protected capture fixture cannot be replaced");
        const reason = fixtureRejectionReason(content, session.mode === "geo-record");
        if (reason) throw new Error(`Capture response rejected: ${reason}`);
        const temporary = join(this._location, `.capture-${randomUUID()}`);
        try {
          await writeFile(temporary, JSON.stringify(content, null, 2), { mode: 0o600, flag: "wx" });
          await rename(temporary, join(this._location, name));
        } finally {
          await rm(temporary, { force: true });
        }
      })();
      pending.add(operation);
      operation.then(() => pending.delete(operation), () => {
        pending.delete(operation);
        failure = true;
      });
      return operation;
    }
  }
  return {
    Store: CaptureStore,
    async drain() {
      // onFinish resolves FMC's writeCache promise. Let its .then callback
      // register the actual store operation before checking the pending set.
      await Promise.resolve();
      while (pending.size) await Promise.allSettled([...pending]);
      if (failure) throw new Error("Capture fixture writes failed validation or storage");
    },
  };
}
