import { dirname, delimiter, isAbsolute } from "node:path";

/**
 * Capture test code receives no ambient credentials or runtime/loader controls.
 * The checker binary path is a narrowly retained nonsecret tool-selection input;
 * arbitrary PATH directories and the rest of the parent's environment are not.
 */
export function captureEnvironment(
  temporary: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: [dirname(process.execPath), "/usr/local/bin", "/usr/bin", "/bin"].join(delimiter),
    TMPDIR: temporary,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC",
    NO_COLOR: "1",
    TERM: "dumb",
    NODE_ENV: "test",
  };
  if (source.YF_EXPERIMENT_NODE && isAbsolute(source.YF_EXPERIMENT_NODE)) {
    environment.YF_EXPERIMENT_NODE = source.YF_EXPERIMENT_NODE;
    environment.PATH = [dirname(process.execPath), dirname(source.YF_EXPERIMENT_NODE),
      "/usr/local/bin", "/usr/bin", "/bin"].join(delimiter);
  }
  return environment;
}
