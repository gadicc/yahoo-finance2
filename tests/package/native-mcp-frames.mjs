/** Newline-delimited MCP JSON, preserving partial frames and split UTF-8. */
export class McpFrames {
  #decoder = new TextDecoder("utf-8", { fatal: true });
  #pending = "";
  #ended = false;
  /** @type {Array<ReturnType<typeof JSON.parse>>} */
  messages = [];

  /** @param {Uint8Array} chunk */
  write(chunk) {
    if (this.#ended) throw new Error("MCP data after stream end");
    this.#accept(this.#decoder.decode(chunk, { stream: true }));
  }

  end() {
    this.#ended = true;
    this.#accept(this.#decoder.decode());
    if (this.#pending !== "") throw new Error("Unterminated MCP frame");
  }

  /** @param {string} text */
  #accept(text) {
    this.#pending += text;
    while (true) {
      const newline = this.#pending.indexOf("\n");
      if (newline === -1) break;
      const line = this.#pending.slice(0, newline);
      this.#pending = this.#pending.slice(newline + 1);
      if (line.trim()) this.messages.push(JSON.parse(line));
    }
  }
}
