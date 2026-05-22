/**
 * Incoming typed market message envelope.
 *
 * The `type` determines how the base64 protobuf payload should be decoded.
 * Each message type may have a completely different protobuf schema.
 *
 * Example:
 *
 * ```ts
 * {
 *   type: "pricing",
 *   message: "CgRBQVBMFUjhmEMY4Jbi68lnKgNOTVMwCDgARTxEgT5lACBFP9gBBA=="
 * }
 * ```
 */
export interface EncodedMarketMessage {
  /** Message type, e.g. "pricing". */
  type: string;

  /** Base64-encoded protobuf payload. */
  message: string;
}

/**
 * Options for decoding typed market messages.
 */
export interface DecodeMarketMessageOptions {
  /**
   * Include raw parsed protobuf fields in the returned object.
   *
   * Defaults to false.
   *
   * Modes:
   *
   * - Omitted / false:
   *   The returned object contains only the clean semantic fields, such as
   *   `symbol`, `price`, `change`, etc. No `rawFields` property is present.
   *
   * - true:
   *   The returned object includes an additional `rawFields` property containing
   *   the low-level parsed protobuf fields.
   *
   * This is useful while reverse-engineering unknown fields, debugging schema
   * changes, or adding support for new message types. For normal application
   * output, leaving this false keeps the decoded result much cleaner.
   */
  includeRawFields?: boolean;
}

/**
 * Base decoded message without raw protobuf fields.
 *
 * Type-specific decoded interfaces extend this.
 */
export interface DecodedMarketMessageBase {
  /** Original outer message type. */
  type: string;

  /** Original base64 protobuf payload. */
  originalBase64: string;
}

/**
 * Adds raw protobuf fields to a decoded message.
 *
 * This is applied only when `includeRawFields: true` is passed to
 * `decodeTypedMarketMessage`.
 */
export type WithRawFields<T> = T & {
  /**
   * Raw parsed protobuf fields.
   *
   * Useful while reverse-engineering unknown fields or future schema changes.
   */
  rawFields: ParsedProtobufField[];
};

/**
 * Decoded message when raw fields are omitted.
 *
 * This is the default return shape of `decodeTypedMarketMessage(input)`.
 */
export type DecodedMarketMessage =
  | DecodedPricingMessage
  | DecodedUnknownMarketMessage;

/**
 * Decoded message when raw fields are included.
 *
 * This is the return shape of:
 *
 * ```ts
 * decodeTypedMarketMessage(input, { includeRawFields: true })
 * ```
 */
export type DecodedMarketMessageWithRawFields =
  | WithRawFields<DecodedPricingMessage>
  | WithRawFields<DecodedUnknownMarketMessage>;

/**
 * Fallback result when no decoder is registered for the given message type.
 *
 * We still parse the protobuf generically inside the top-level dispatcher, so
 * callers can inspect `rawFields` by passing `{ includeRawFields: true }`.
 */
export interface DecodedUnknownMarketMessage extends DecodedMarketMessageBase {
  type: "unknown";

  /** The actual unrecognised type value from the input envelope. */
  originalType: string;
}

/**
 * Decoded pricing protobuf message.
 *
 * This interface is based on observed data, not an official schema.
 *
 * Known mapping from observed samples:
 *
 * - field 1  = symbol, e.g. "AAPL"
 * - field 2  = current/regular/pre-market price, float32
 * - field 3  = timestamp in milliseconds, encoded as sint64 / zig-zag varint
 * - field 5  = exchange or market code, e.g. "NMS"
 * - field 6  = unknown varint
 * - field 7  = unknown varint
 * - field 8  = change percent, float32
 * - field 12 = absolute change, float32
 * - field 27 = price hint / decimal precision hint, likely varint
 */
export interface DecodedPricingMessage extends DecodedMarketMessageBase {
  type: "pricing";

  /** Stock/security symbol, e.g. "AAPL". */
  symbol?: string;

  /** Exchange or market code, e.g. "NMS". Exact meaning not confirmed. */
  marketCode?: string;

  /** Main displayed price. */
  price?: number;

  /** Absolute price change, e.g. +0.73. */
  change?: number;

  /** Percentage price change, e.g. +0.24. */
  changePercent?: number;

  /**
   * Timestamp in Unix epoch milliseconds.
   *
   * In observed samples, this is encoded as protobuf sint64, meaning the varint
   * value must be zig-zag decoded.
   */
  timestampMs?: number;

  /** ISO string derived from timestampMs, when timestampMs is present. */
  timestampIso?: string;

  /**
   * Likely decimal precision hint.
   *
   * In Yahoo-style quote data this often exists as `priceHint`.
   * The exact field meaning is inferred, not confirmed from an official schema.
   */
  priceHint?: number;

  /**
   * Unknown field 6.
   *
   * In observed samples this was 8. It may represent market state, quote type,
   * trading period, or another enum-like value, but this is not confirmed.
   */
  unknownField6?: number | bigint;

  /**
   * Unknown field 7.
   *
   * In observed samples this was 0. Meaning not confirmed.
   */
  unknownField7?: number | bigint;
}

/**
 * Type-specific decoder function.
 *
 * Each decoder receives:
 *
 * - the full envelope
 * - the already-decoded binary payload bytes
 * - the already-parsed raw protobuf fields
 *
 * The decoder should return the clean semantic object without `rawFields`.
 * The top-level dispatcher attaches `rawFields` only when requested via
 * `{ includeRawFields: true }`.
 */
export type MarketMessageDecoder<TDecoded extends DecodedMarketMessageBase> = (
  input: EncodedMarketMessage,
  payloadBytes: Uint8Array,
  rawFields: ParsedProtobufField[],
) => TDecoded;

/**
 * Registry of message decoders.
 *
 * Add future decoders here, for example:
 *
 * ```ts
 * const marketMessageDecoders = {
 *   pricing: decodePricingMessage,
 *   trades: decodeTradesMessage,
 *   news: decodeNewsMessage,
 * };
 * ```
 *
 * You can also register decoders at runtime using
 * `registerMarketMessageDecoder`.
 */
const marketMessageDecoders: Record<
  string,
  MarketMessageDecoder<DecodedMarketMessageBase>
> = {
  pricing: decodePricingMessage,
};

/**
 * Decode an incoming typed market message.
 *
 * Default mode: raw protobuf fields are omitted.
 *
 * TypeScript knows that the result does not have a `rawFields` property.
 *
 * Example:
 *
 * ```ts
 * const decoded = decodeTypedMarketMessage(input);
 *
 * if (decoded.type === "pricing") {
 *   console.log(decoded.price);
 * }
 *
 * // decoded.rawFields; // TypeScript error, as expected.
 * ```
 */
export function decodeTypedMarketMessage(
  input: EncodedMarketMessage,
): DecodedMarketMessage;

/**
 * Decode an incoming typed market message, including raw protobuf fields.
 *
 * Debug/reverse-engineering mode: raw protobuf fields are included.
 *
 * TypeScript knows that the result has a `rawFields` property.
 *
 * Example:
 *
 * ```ts
 * const decoded = decodeTypedMarketMessage(input, {
 *   includeRawFields: true,
 * });
 *
 * console.log(decoded.rawFields);
 * ```
 */
export function decodeTypedMarketMessage(
  input: EncodedMarketMessage,
  options: DecodeMarketMessageOptions & { includeRawFields: true },
): DecodedMarketMessageWithRawFields;

/**
 * Decode an incoming typed market message using a dynamic options object.
 *
 * Dynamic mode: if `includeRawFields` is a runtime boolean, TypeScript cannot
 * know at compile time whether `rawFields` will be present, so the return type
 * is a union of both possibilities.
 *
 * Example:
 *
 * ```ts
 * const decoded = decodeTypedMarketMessage(input, {
 *   includeRawFields: shouldDebug,
 * });
 *
 * if ("rawFields" in decoded) {
 *   console.log(decoded.rawFields);
 * }
 * ```
 */
export function decodeTypedMarketMessage(
  input: EncodedMarketMessage,
  options: DecodeMarketMessageOptions,
): DecodedMarketMessage | DecodedMarketMessageWithRawFields;

/**
 * Decode an incoming typed market message.
 *
 * This is the main entry point.
 *
 * It:
 *
 * 1. Validates the outer envelope.
 * 2. Base64-decodes the inner protobuf payload.
 * 3. Parses the protobuf payload into raw fields.
 * 4. Finds a registered decoder based on `input.type`.
 * 5. Falls back to a generic unknown-message result when no decoder exists.
 * 6. Attaches `rawFields` only when `options.includeRawFields === true`.
 */
export function decodeTypedMarketMessage(
  input: EncodedMarketMessage,
  options: DecodeMarketMessageOptions = {},
): DecodedMarketMessage | DecodedMarketMessageWithRawFields {
  validateEncodedMarketMessage(input);

  const payloadBytes = base64ToBytes(input.message);
  const rawFields = parseProtobufFields(payloadBytes);
  const decoder = marketMessageDecoders[input.type];

  const decoded = decoder !== undefined
    ? decoder(input, payloadBytes, rawFields)
    : decodeUnknownMarketMessage(input, payloadBytes, rawFields);

  if (options.includeRawFields === true) {
    return {
      ...decoded,
      rawFields,
    } as DecodedMarketMessageWithRawFields;
  }

  return decoded as DecodedMarketMessage;
}

/**
 * Register or replace a decoder for a message type.
 *
 * This gives you an easy extension point for future message types without
 * changing the top-level dispatch function.
 *
 * Example:
 *
 * ```ts
 * registerMarketMessageDecoder("trades", decodeTradesMessage);
 * ```
 */
export function registerMarketMessageDecoder<
  TDecoded extends DecodedMarketMessageBase,
>(
  type: string,
  decoder: MarketMessageDecoder<TDecoded>,
): void {
  if (type.trim() === "") {
    throw new Error("Cannot register decoder for an empty message type");
  }

  marketMessageDecoders[type] = decoder as MarketMessageDecoder<
    DecodedMarketMessageBase
  >;
}

/**
 * Decode a `pricing` message.
 *
 * This is currently the only known type-specific decoder.
 *
 * It returns the clean semantic object. The top-level dispatcher can attach
 * `rawFields` separately when requested.
 */
export function decodePricingMessage(
  input: EncodedMarketMessage,
  _payloadBytes = base64ToBytes(input.message),
  rawFields = parseProtobufFields(_payloadBytes),
): DecodedPricingMessage {
  const result: DecodedPricingMessage = {
    type: "pricing",
    originalBase64: input.message,
  };

  for (const field of rawFields) {
    switch (field.fieldNumber) {
      case 1:
        // Observed sample: "AAPL"
        result.symbol = field.stringValue;
        break;

      case 2:
        // Observed sample: approximately 305.72
        result.price = field.float32Value;
        break;

      case 3: {
        /**
         * Observed sample:
         *
         * raw varint    = 3558874314000
         * zig-zag value = 1779437157000
         *
         * This strongly suggests protobuf `sint64`, not plain `int64`.
         */
        const timestampMs = bigintToSafeNumber(
          field.zigZagValue,
          "timestampMs",
        );

        if (timestampMs !== undefined) {
          result.timestampMs = timestampMs;
          result.timestampIso = new Date(timestampMs).toISOString();
        }

        break;
      }

      case 5:
        // Observed sample: "NMS"
        result.marketCode = field.stringValue;
        break;

      case 6:
        // Observed sample: 8. Meaning not yet confirmed.
        result.unknownField6 = bigintToNumberWhenSafe(field.varintValue);
        break;

      case 7:
        // Observed sample: 0. Meaning not yet confirmed.
        result.unknownField7 = bigintToNumberWhenSafe(field.varintValue);
        break;

      case 8:
        // Observed sample: approximately 0.24, displayed as +0.24%
        result.changePercent = field.float32Value;
        break;

      case 12:
        // Observed sample: approximately 0.73
        result.change = field.float32Value;
        break;

      case 27:
        // Observed sample: 4. Likely priceHint / decimal precision.
        result.priceHint = bigintToSafeNumber(field.varintValue, "priceHint");
        break;

      default:
        // Unknown pricing field. Inspect with includeRawFields: true.
        break;
    }
  }

  return result;
}

/**
 * Decode a message with an unrecognised outer `type`.
 *
 * We do not know the semantic schema, so this returns only the basic envelope
 * metadata. Use `{ includeRawFields: true }` to inspect parsed protobuf fields.
 */
export function decodeUnknownMarketMessage(
  input: EncodedMarketMessage,
  _payloadBytes = base64ToBytes(input.message),
  _rawFields = parseProtobufFields(_payloadBytes),
): DecodedUnknownMarketMessage {
  return {
    type: "unknown",
    originalType: input.type,
    originalBase64: input.message,
  };
}

/**
 * Validate the outer message envelope before decoding.
 */
function validateEncodedMarketMessage(input: EncodedMarketMessage): void {
  if (typeof input !== "object" || input === null) {
    throw new Error("Expected input to be an object");
  }

  if (typeof input.type !== "string" || input.type.trim() === "") {
    throw new Error("Expected input.type to be a non-empty string");
  }

  if (typeof input.message !== "string" || input.message.trim() === "") {
    throw new Error("Expected input.message to be a non-empty base64 string");
  }
}

/**
 * Generic parsed protobuf field.
 *
 * This stores the low-level wire-format interpretation before we apply
 * type-specific field names like `price` or `symbol`.
 */
export interface ParsedProtobufField {
  /** Protobuf field number. */
  fieldNumber: number;

  /** Protobuf wire type. */
  wireType: ProtobufWireType;

  /** Byte offset where the field tag started. */
  startOffset: number;

  /** Byte offset immediately after this field. */
  endOffset: number;

  /** Raw bytes belonging to the field payload, excluding the tag. */
  rawValueBytes: Uint8Array;

  /** Decoded varint value, when wireType is varint. */
  varintValue?: bigint;

  /** Decoded signed zig-zag value, when wireType is varint. */
  zigZagValue?: bigint;

  /** Decoded UTF-8 string, when wireType is length-delimited and valid text. */
  stringValue?: string;

  /** Decoded float32 value, when wireType is fixed32. */
  float32Value?: number;

  /** Decoded unsigned fixed32 integer, when wireType is fixed32. */
  fixed32Value?: number;

  /** Decoded float64 value, when wireType is fixed64. */
  float64Value?: number;

  /** Decoded unsigned fixed64 integer, when wireType is fixed64. */
  fixed64Value?: bigint;
}

/**
 * Protobuf wire types.
 *
 * Only the common wire types are supported here.
 */
export enum ProtobufWireType {
  Varint = 0,
  Fixed64 = 1,
  LengthDelimited = 2,
  Fixed32 = 5,
}

/**
 * Parse protobuf fields from a binary message.
 *
 * This parser handles:
 *
 * - varint
 * - fixed32
 * - fixed64
 * - length-delimited
 *
 * It does not recursively parse nested messages. Length-delimited values are
 * exposed as raw bytes and also decoded as UTF-8 when they appear text-like.
 */
export function parseProtobufFields(bytes: Uint8Array): ParsedProtobufField[] {
  const fields: ParsedProtobufField[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const startOffset = offset;

    const tagResult = readVarint(bytes, offset);
    offset = tagResult.nextOffset;

    const tag = tagResult.value;
    const fieldNumber = Number(tag >> 3n);
    const wireType = Number(tag & 0b111n) as ProtobufWireType;

    if (fieldNumber <= 0) {
      throw new Error(
        `Invalid protobuf field number ${fieldNumber} at offset ${startOffset}`,
      );
    }

    switch (wireType) {
      case ProtobufWireType.Varint: {
        const valueStartOffset = offset;
        const valueResult = readVarint(bytes, offset);
        offset = valueResult.nextOffset;

        const rawValueBytes = bytes.slice(valueStartOffset, offset);

        fields.push({
          fieldNumber,
          wireType,
          startOffset,
          endOffset: offset,
          rawValueBytes,
          varintValue: valueResult.value,
          zigZagValue: decodeZigZag64(valueResult.value),
        });

        break;
      }

      case ProtobufWireType.Fixed64: {
        const valueStartOffset = offset;
        ensureAvailable(bytes, offset, 8);

        const view = dataViewFor(bytes, offset, 8);

        offset += 8;

        fields.push({
          fieldNumber,
          wireType,
          startOffset,
          endOffset: offset,
          rawValueBytes: bytes.slice(valueStartOffset, offset),
          fixed64Value: readUnsignedLittleEndianBigInt(
            bytes,
            valueStartOffset,
            8,
          ),
          float64Value: view.getFloat64(0, true),
        });

        break;
      }

      case ProtobufWireType.LengthDelimited: {
        const lengthResult = readVarint(bytes, offset);
        offset = lengthResult.nextOffset;

        const length = bigintToSafeNumber(
          lengthResult.value,
          "length-delimited length",
        );

        if (length === undefined) {
          throw new Error("Length-delimited field length was undefined");
        }

        ensureAvailable(bytes, offset, length);

        const rawValueBytes = bytes.slice(offset, offset + length);
        offset += length;

        fields.push({
          fieldNumber,
          wireType,
          startOffset,
          endOffset: offset,
          rawValueBytes,
          stringValue: decodeUtf8IfTextLike(rawValueBytes),
        });

        break;
      }

      case ProtobufWireType.Fixed32: {
        const valueStartOffset = offset;
        ensureAvailable(bytes, offset, 4);

        const view = dataViewFor(bytes, offset, 4);

        offset += 4;

        fields.push({
          fieldNumber,
          wireType,
          startOffset,
          endOffset: offset,
          rawValueBytes: bytes.slice(valueStartOffset, offset),
          fixed32Value: view.getUint32(0, true),
          float32Value: view.getFloat32(0, true),
        });

        break;
      }

      default:
        throw new Error(
          `Unsupported protobuf wire type ${wireType} for field ${fieldNumber} at offset ${startOffset}`,
        );
    }
  }

  return fields;
}

/**
 * Read a protobuf varint from `bytes` at `offset`.
 *
 * Protobuf varints use seven data bits per byte. The high bit indicates whether
 * more bytes follow.
 */
function readVarint(
  bytes: Uint8Array,
  offset: number,
): { value: bigint; nextOffset: number } {
  let value = 0n;
  let shift = 0n;
  let currentOffset = offset;

  while (currentOffset < bytes.length) {
    const byte = bytes[currentOffset];
    currentOffset += 1;

    value |= BigInt(byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) {
      return {
        value,
        nextOffset: currentOffset,
      };
    }

    shift += 7n;

    // A valid 64-bit protobuf varint should not need more than 10 bytes.
    if (shift > 70n) {
      throw new Error(`Varint is too long at offset ${offset}`);
    }
  }

  throw new Error(
    `Unexpected end of input while reading varint at offset ${offset}`,
  );
}

/**
 * Decode protobuf sint64 zig-zag encoding.
 *
 * Zig-zag maps signed integers to unsigned varints:
 *
 * - 0  -> 0
 * - -1 -> 1
 * - 1  -> 2
 * - -2 -> 3
 */
function decodeZigZag64(value: bigint): bigint {
  return (value >> 1n) ^ -(value & 1n);
}

/**
 * Convert a base64 string to bytes.
 *
 * Deno provides `atob` globally, like browsers do.
 *
 * This intentionally avoids Node's `Buffer`, so it type-checks cleanly in Deno.
 *
 * `atob` returns a binary string where each character code is one byte.
 */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

/**
 * Create a DataView over a section of a Uint8Array.
 *
 * This avoids copying the underlying bytes.
 */
function dataViewFor(
  bytes: Uint8Array,
  offset: number,
  length: number,
): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, length);
}

/**
 * Ensure that `length` bytes are available from `offset`.
 */
function ensureAvailable(
  bytes: Uint8Array,
  offset: number,
  length: number,
): void {
  if (offset + length > bytes.length) {
    throw new Error(
      `Unexpected end of input: needed ${length} bytes at offset ${offset}, ` +
        `but message length is ${bytes.length}`,
    );
  }
}

/**
 * Decode bytes as UTF-8 only when the result looks like ordinary text.
 *
 * Length-delimited protobuf fields can be strings, bytes, or nested messages.
 * Since we do not have the official schema, this function avoids pretending
 * that every length-delimited field is definitely a string.
 */
function decodeUtf8IfTextLike(bytes: Uint8Array): string | undefined {
  let decoded: string;

  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }

  // Simple printable-text heuristic.
  // Good enough for values like "AAPL" and "NMS".
  for (const char of decoded) {
    const codePoint = char.codePointAt(0);

    if (codePoint === undefined) {
      return undefined;
    }

    const isTabOrNewline = codePoint === 0x09 || codePoint === 0x0a ||
      codePoint === 0x0d;
    const isPrintableAscii = codePoint >= 0x20 && codePoint <= 0x7e;
    const isLikelyUnicodeText = codePoint >= 0xa0;

    if (!isTabOrNewline && !isPrintableAscii && !isLikelyUnicodeText) {
      return undefined;
    }
  }

  return decoded;
}

/**
 * Read an unsigned little-endian integer as bigint.
 *
 * Used for fixed64 fields. JavaScript cannot safely represent all uint64
 * values as regular numbers.
 */
function readUnsignedLittleEndianBigInt(
  bytes: Uint8Array,
  offset: number,
  byteLength: number,
): bigint {
  let value = 0n;

  for (let i = 0; i < byteLength; i += 1) {
    value |= BigInt(bytes[offset + i]) << BigInt(i * 8);
  }

  return value;
}

/**
 * Convert bigint to number only if it is safely representable.
 */
function bigintToSafeNumber(
  value: bigint | undefined,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(
      `${fieldName} is outside JavaScript's safe integer range: ${value.toString()}`,
    );
  }

  return Number(value);
}

/**
 * Convert a bigint to number when safe; otherwise keep it as bigint.
 *
 * Useful for unknown varint fields where we do not yet know whether the field
 * can exceed JavaScript's safe integer range.
 */
function bigintToNumberWhenSafe(
  value: bigint | undefined,
): number | bigint | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return value;
  }

  return Number(value);
}
