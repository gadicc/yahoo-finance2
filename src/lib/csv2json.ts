// Partial implementation that covers everything we need
const DELIMITER = ",";

function camelize(str: string): string {
  return str
    .split(" ")
    .map((str, i) =>
      i === 0
        ? str.toLowerCase()
        : str[0].toUpperCase() + str.substr(1).toLowerCase()
    )
    .join("");
}

function convert(input: unknown) {
  if (typeof input === "string") {
    if (input.match(/\d{4,4}-\d{2,2}-\d{2,2}/)) return new Date(input);
    if (input.match(/^[0-9\.]+$/)) return parseFloat(input);
    if (input === "null") return null;
  }
  return input;
}

export default function csv2json(csv: string): Array<Record<string, unknown>> {
  const lines = csv.split("\n");

  // Actually we should handle this case, i.e. headers but no data.
  // if (lines.length === 1)
  //  throw new Error("No newlines in: " + csv);

  const headers = (lines.shift() as string).split(DELIMITER).map(camelize);
  const out = new Array(lines.length);

  for (let i = 0; i < lines.length; i++) {
    const inRow = lines[i].split(DELIMITER);
    const outRow: Record<string, unknown> = (out[i] = {});
    for (let j = 0; j < inRow.length; j++) {
      outRow[headers[j]] = convert(inRow[j]);
    }
  }

  return out;
}
