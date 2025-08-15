import type { YahooFinanceOptions } from "./options.js";
import type { ModuleThis } from "./moduleCommon.js";
import validateAndCoerceTypes from "./validateAndCoerceTypes.js";
import { ExtendedCookieJar } from "./cookieJar.js";

export default function setGlobalConfig(
  this: ModuleThis,
  _config: YahooFinanceOptions,
): void {
  // Instances (e.g. cookieJar) don't validate well :)
  const { cookieJar, logger, ...config } = _config;

  validateAndCoerceTypes({
    object: config,
    source: "setGlobalConfig",
    type: "options",
    options: this._opts.validation,
    schemaKey: "#/definitions/YahooFinanceOptions",
  });
  mergeObjects(this._opts, config);

  if (cookieJar) {
    if (!(cookieJar instanceof ExtendedCookieJar)) {
      throw new Error("cookieJar must be an instance of ExtendedCookieJar");
    }
    this._opts.cookieJar = cookieJar;
  }
  if (logger) {
    if (typeof logger.info !== "function") {
      throw new Error("logger.info must be a function");
    }
    if (typeof logger.warn !== "function") {
      throw new Error("logger.warn must be a function");
    }
    if (typeof logger.error !== "function") {
      throw new Error("logger.error must be a function");
    }
    if (typeof logger.debug !== "function") {
      throw new Error("logger.debug must be a function");
    }
    this._opts.logger = logger;
  }
}

type Obj = Record<string, any>;
function mergeObjects(original: Obj, objToMerge: Obj) {
  const ownKeys: (keyof typeof objToMerge)[] = Reflect.ownKeys(
    objToMerge,
  ) as string[];
  for (const key of ownKeys) {
    if (typeof objToMerge[key] === "object") {
      mergeObjects(original[key] as Obj, objToMerge[key] as Obj);
    } else {
      original[key] = objToMerge[key];
    }
  }
}
