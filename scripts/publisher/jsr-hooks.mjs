/** semantic-release integration: all JSR activity targets an isolated stage. */
import assert from "node:assert/strict";
import {
  acquirePublisherLock,
  freezePublisherLock,
  assertPublisherTemporaryPath,
} from "./runtime.mjs";
import { tmpdir } from "node:os";
import * as upstream from "@sebbo2002/semantic-release-jsr";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import {
  createJsrStage,
  hashFile,
  removeStage,
  validateVersion,
  verifyStage,
} from "./stage.mjs";

/** Injectable lifecycle boundary for ordinary tests; the default is publisher-only.
 * @param {{ api?: Pick<typeof upstream,'verifyConditions'|'prepare'|'publish'|'success'|'fail'>, stage?: typeof createJsrStage, acquireLock?: typeof acquirePublisherLock }} [services]
 */
export function createJsrHooks(services = {}) {
  const api = services.api ?? upstream;
  const makeStage = services.stage ?? createJsrStage;
  const acquireLock = services.acquireLock ?? acquirePublisherLock;
  /** @type {ReturnType<typeof createJsrStage> | undefined} */ let state;
  /** @type {string | undefined} */ let lockHash;
  /** @type {string | undefined} */ let preparedVersion;
  /** @type {string | undefined} */ let sourceRoot;
  /** @type {Record<string,string>} */ let roots = {};
  /** @param {{cwd?:string}} context */
  const ensure = (context) => {
    assert(context.cwd, "Publisher lifecycle requires an explicit checkout");
    const root = realpathSync(context.cwd);
    if (!state) {
      state = makeStage(root);
      sourceRoot = root;
      roots = Object.fromEntries(
        ["package.json", "bun.lock", "deno.json"].map((name) => [
          name,
          hashFile(join(root, name)),
        ]),
      );
      if (process.env.GITHUB_ACTIONS === "true")
        assert.equal(
          state.head,
          process.env.GITHUB_SHA,
          "Publisher source must match GitHub provenance SHA",
        );
    }
    assert.equal(root, sourceRoot, "Publisher lifecycle changed checkout");
    for (const [name, expected] of Object.entries(roots))
      assert.equal(
        hashFile(join(root, name)),
        expected,
        `Publisher modified root ${name}`,
      );
    verifyStage(state);
    for (const [name, expected] of Object.entries(state.sourceHashes))
      assert.equal(
        hashFile(join(root, name)),
        expected,
        `Publisher checkout changed after staging: ${name}`,
      );
    return state;
  };
  /** @param {object} config */
  const policy = (config) => {
    assertPublisherTemporaryPath(tmpdir());
    assert.equal(
      Object.keys(config).length,
      0,
      "JSR stage policy does not accept cwd/pkgJsonPath/verification overrides",
    );
    assert(
      !process.env.DENO_BIN_PATH &&
        !process.env.DENO_BIN_CANARY &&
        !process.env.DISABLE_JSR_PROVENANCE &&
        !process.env.DISABLE_JSR_MANIFEST_VERIFICATION_FOR_TESTING,
      "Publisher binary/provenance overrides are forbidden",
    );
  };
  /** @param {ReturnType<typeof createJsrStage>} stage */
  const configuration = (stage) => ({
    cwd: stage.stage,
    allowDirty: true,
    publishArgs: [],
  });
  return {
    /** @param {object} config @param {import('semantic-release').VerifyConditionsContext} context */
    async verifyConditions(config, context) {
      policy(config);
      const current = ensure(context);
      const lock = join(current.stage, "deno.lock");
      if (lockHash)
        assert.equal(
          hashFile(lock),
          lockHash,
          "Publisher resolution lock changed",
        );
      await api.verifyConditions(configuration(current), context);
      verifyStage(current);
      if (!lockHash) {
        acquireLock(current);
        freezePublisherLock(current);
      }
      assert(
        existsSync(lock),
        "JSR verification must retain an isolated publisher lock",
      );
      const verifiedHash = hashFile(lock);
      if (lockHash)
        assert.equal(
          verifiedHash,
          lockHash,
          "Publisher resolution lock changed",
        );
      lockHash = verifiedHash;
    },
    /** @param {object} config @param {import('semantic-release').PrepareContext} context */
    async prepare(config, context) {
      policy(config);
      const current = ensure(context);
      assert(lockHash, "Publisher verification must precede prepare");
      assert.equal(
        hashFile(join(current.stage, "deno.lock")),
        lockHash,
        "Publisher resolution lock changed",
      );
      const version = validateVersion(context.nextRelease.version);
      await api.prepare(configuration(current), context);
      current.metadata.version = version;
      verifyStage(current);
      preparedVersion = version;
    },
    /** @param {object} config @param {import('semantic-release').PublishContext} context */
    async publish(config, context) {
      policy(config);
      const current = ensure(context);
      assert(
        preparedVersion && preparedVersion === context.nextRelease.version,
        "Publisher prepare must match release version",
      );
      assert.equal(
        hashFile(join(current.stage, "deno.lock")),
        lockHash,
        "Publisher resolution lock changed",
      );
      return api.publish(configuration(current), context);
    },
    /** @param {object} config @param {import('semantic-release').SuccessContext} context */
    async success(config, context) {
      try {
        await api.success(config, context);
      } finally {
        if (state) {
          removeStage(state);
          state = undefined;
        }
      }
    },
    /** @param {object} config @param {import('semantic-release').FailContext} context */
    async fail(config, context) {
      try {
        await api.fail(config, context);
      } finally {
        if (state) {
          removeStage(state);
          state = undefined;
        }
      }
    },
  };
}
export default createJsrHooks();
