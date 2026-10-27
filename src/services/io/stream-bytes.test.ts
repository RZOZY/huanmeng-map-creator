import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectStreamBytes } from "./stream-bytes";

function byteStream<Bytes extends Uint8Array>(chunks: readonly Bytes[]): ReadableStream<Bytes> {
  let index = 0;
  return new ReadableStream<Bytes>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    }
  });
}

function gzipStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < bytes.length; offset += 7)
    chunks.push(Uint8Array.from(bytes.subarray(offset, offset + 7)));
  return byteStream(chunks).pipeThrough(new DecompressionStream("gzip"));
}

afterEach(() => vi.restoreAllMocks());

describe("native stream byte collection", () => {
  it("preserves arbitrary bytes and nonzero-offset views without including backing-buffer edges", async () => {
    const expected = Uint8Array.from({ length: 1027 }, (_, index) => index % 256);
    const backing = new Uint8Array(expected.length + 6).fill(91);
    backing.set(expected, 3);
    const chunks = [
      backing.subarray(3, 4),
      backing.subarray(4, 260),
      backing.subarray(260, 260),
      backing.subarray(260, 1026),
      backing.subarray(1026, backing.length - 3)
    ];
    const result = await collectStreamBytes(byteStream(chunks));
    expect(result).toEqual(expected);
    expect(result.buffer.byteLength).toBe(expected.byteLength);
  });

  it("keeps UTF-8 sequences intact when each byte arrives in a separate chunk", async () => {
    const text = "\0汉字 🗺️ café\r\n";
    const expected = new TextEncoder().encode(text);
    const chunks = Array.from(expected, (_, index) => expected.subarray(index, index + 1));
    const result = await collectStreamBytes(byteStream(chunks));
    expect(result).toEqual(expected);
    expect(new TextDecoder().decode(result)).toBe(text);
  });

  it("returns an empty typed array for an empty stream", async () => {
    expect(await collectStreamBytes(byteStream([]))).toEqual(new Uint8Array());
  });

  it("collects an actual gzip stream fed in multiple compressed chunks", async () => {
    const expected = Uint8Array.from({ length: 65539 }, (_, index) => (index * 73 + (index % 251)) % 256);
    const result = await collectStreamBytes(gzipStream(gzipSync(expected)));
    expect(result).toEqual(expected);
  });

  it("collects a valid empty gzip payload", async () => {
    expect(await collectStreamBytes(gzipStream(gzipSync(new Uint8Array())))).toEqual(new Uint8Array());
  });

  it.each(["invalid", "truncated", "corrupt"])("rejects %s gzip instead of returning partial bytes", async kind => {
    let bytes: Uint8Array = gzipSync(new TextEncoder().encode("decoded bytes must not escape a bad gzip trailer"));
    if (kind === "invalid") bytes = new Uint8Array([0, 1, 2, 3]);
    if (kind === "truncated") bytes = bytes.subarray(0, bytes.length - 1);
    if (kind === "corrupt") bytes[bytes.length - 8] ^= 1;
    await expect(collectStreamBytes(gzipStream(bytes))).rejects.toBeDefined();
  });

  it("propagates a stream error after a byte chunk has been read", async () => {
    const error = new Error("stream failed after partial output");
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(new Uint8Array([0, 128, 255]));
        else controller.error(error);
      }
    });
    await expect(collectStreamBytes(stream)).rejects.toBe(error);
    expect(pulls).toBe(2);
  });

  it("propagates native Response consumption rejection unchanged", async () => {
    const error = new Error("Response arrayBuffer failed");
    const consume = vi.spyOn(Response.prototype, "arrayBuffer").mockRejectedValueOnce(error);
    await expect(collectStreamBytes(byteStream([]))).rejects.toBe(error);
    expect(consume).toHaveBeenCalledOnce();
  });
});
