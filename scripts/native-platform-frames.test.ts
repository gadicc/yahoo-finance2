import { test } from "../tests/helpers/runner.ts";
import { expect } from "../tests/helpers/assertions.ts";
import { McpFrames } from "../tests/package/native-mcp-frames.mjs";

const encoder = new TextEncoder();

test("MCP frames wait for newline and preserve coalesced responses", () => {
  const frames = new McpFrames();
  frames.write(encoder.encode('{"id":1,"result":'));
  expect(frames.messages).toEqual([]);
  frames.write(encoder.encode('{"name":"first"}}\n{"id":2}\r\n\n'));
  frames.end();
  expect(frames.messages).toEqual([
    { id: 1, result: { name: "first" } },
    { id: 2 },
  ]);
});

test("MCP frames preserve every possible byte split, including multibyte UTF-8", () => {
  const message = { id: 1, result: "€ café 東京 🐉" };
  const bytes = encoder.encode(JSON.stringify(message) + "\n");
  for (let at = 1; at < bytes.length; at++) {
    const frames = new McpFrames();
    frames.write(bytes.subarray(0, at));
    expect(frames.messages).toEqual([]);
    frames.write(bytes.subarray(at));
    frames.end();
    expect(frames.messages).toEqual([message]);
  }
  const frames = new McpFrames();
  for (const byte of bytes) frames.write(Uint8Array.of(byte));
  frames.end();
  expect(frames.messages).toEqual([message]);
});

test("MCP frames reject malformed complete messages, invalid UTF-8 and unfinished EOF", () => {
  for (const text of ['{"id":1,}\n', '{"id":\n']) {
    const frames = new McpFrames();
    expect(() => frames.write(encoder.encode(text))).toThrow();
  }
  const unfinished = new McpFrames();
  unfinished.write(encoder.encode('{"id":1}'));
  expect(unfinished.messages).toEqual([]);
  expect(() => unfinished.end()).toThrow("Unterminated");
  const unicode = new McpFrames();
  unicode.write(Uint8Array.of(0xe2));
  expect(() => unicode.end()).toThrow();
  expect(() => new McpFrames().write(Uint8Array.of(0xff))).toThrow();
});
