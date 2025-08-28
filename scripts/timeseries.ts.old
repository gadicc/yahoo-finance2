/**
 * Timeseries script extracts keys from requests in a HAR file.
 * It reads the HAR file as input to update the timeseries.json.
 * A HAR file can be saved from the Network tab (see Developer tools).
 * Filter the results on the time-series API url to create the HAR file.
 * See: INPUT_PATH for the location.
 */
import fs from "fs/promises";
import type { PathLike } from "fs";
import type { Har } from "har-format";

const INPUT_PATH = "timeseries.har";
const OUTPUT_PATH = "../src/lib/timeseries.json";
const STRIP_REGEX = new RegExp("annual|quarterly|trailing");

async function fileExists(path: PathLike): Promise<boolean> {
  return await fs
    .access(INPUT_PATH)
    .then(() => true)
    .catch(() => {
      console.log(`File not found: ${path}`);
      process.exit(1);
    });
}

/* Read the HAR file. */
async function getTimeseriesHAR(): Promise<Har> {
  await fileExists(INPUT_PATH);
  const fileBuffer = await fs.readFile(INPUT_PATH, "utf8");
  return JSON.parse(fileBuffer) as Har;
}

/* Read the timeseries JSON file. */
async function getTimeseriesJSON(): Promise<Record<string, string[]>> {
  await fileExists(OUTPUT_PATH);
  const fileBuffer = await fs.readFile(OUTPUT_PATH, "utf8");
  return JSON.parse(fileBuffer);
}

/* Main async script function. */
async function main() {
  const har = await getTimeseriesHAR();

  for (const entry of har.log.entries) {
    const json = await getTimeseriesJSON();
    const refererHeader = entry.request.headers.find(
      (header) => header.name === "Referer",
    );
    const typeParam = entry.request.queryString.find(
      (header) => header.name === "type",
    );

    if (!refererHeader) {
      throw new Error("Referer header not found.");
    } else if (!typeParam) {
      throw new Error("Type query parameter not found.");
    } else {
      console.log(`Entry: ${entry.startedDateTime}: ${refererHeader.value}`);
    }

    /* Extract the type of request from the referer. */
    const module = refererHeader.value.split("/").pop();
    const keysArray = module ? json[module] : undefined;

    /* Use the first key to confirm the module. */
    if (keysArray && !typeParam.value.includes(keysArray[0])) {
      console.log(`${module} does not contain key: ${keysArray[0]}`);
      console.log("Referer most likely does not contain the right module.");
      continue;
    } else if (keysArray && module) {
      const keySet = new Set(keysArray);
      const paramKeys = typeParam.value.split(",");
      console.log(`Module: ${module} with ${keySet.size} keys.`);
      console.log(`Query param includes ${paramKeys.length} keys.`);

      for (const key of paramKeys) {
        const stripped = key.replace(STRIP_REGEX, "");
        keySet.add(stripped);
      }
      json[module] = Array.from(keySet);

      try {
        await fs.writeFile(OUTPUT_PATH, JSON.stringify(json, null, 2));
      } catch (err: any) {
        console.error(err);
        process.exit(1);
      } finally {
        const counter = keySet.size - keysArray.length;
        console.log(`Updated ${module} with ${counter} new keys.`);
      }
    } else throw new Error(`Keys array not found for module: ${module}`);
  }
}

main();
