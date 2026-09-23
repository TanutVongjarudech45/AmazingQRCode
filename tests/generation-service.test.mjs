import test from "node:test";
import assert from "node:assert/strict";
import {
  generateImage,
  downloadFinalImage,
  safeGenerationError,
} from "../src/server/generate-image.ts";

const payload = {
  url: "https://example.com",
  prompt: "A garden",
  negative_prompt: "",
};
const origin = "https://example-qr-studio.hf.space";
const token = "hf_" + "fake".repeat(10);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1kAAAAASUVORK5CYII=",
  "base64",
);
const signal = new AbortController().signal;
const data = [{ url: `${origin}/file=/tmp/gradio/final.png` }];

test("submits three fields, retrieves only the final private image and closes the client", async () => {
  let closed = false;
  const result = await generateImage(payload, {
    token,
    origin,
    signal,
    connect: async () => ({
      submit(endpoint, input) {
        assert.equal(endpoint, "/generate_simple");
        assert.deepEqual(input, payload);
        return {
          cancel: async () => assert.fail("Completed jobs should not cancel"),
          async *[Symbol.asyncIterator]() {
            yield { type: "status", stage: "pending" };
            yield { type: "data", data };
          },
        };
      },
      close() {
        closed = true;
      },
    }),
    fetcher: async (url, init) => {
      assert.equal(url.origin, origin);
      assert.equal(init.headers.Authorization, `Bearer ${token}`);
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      return new Response(png, { headers: { "content-type": "image/png" } });
    },
  });
  assert.deepEqual(result, {
    bytes: png,
    contentType: "image/png",
    extension: "png",
  });
  assert.equal(closed, true);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("refuses untrusted file URLs before sending credentials", async () => {
  for (const url of [
    "https://evil.example/file=image.png",
    `${origin}/config`,
    `https://user:pass@example-qr-studio.hf.space/file=a`,
    "http://example-qr-studio.hf.space/file=a",
  ]) {
    await assert.rejects(
      downloadFinalImage([{ url }], {
        origin,
        token,
        signal,
        fetcher: async () => assert.fail("Must not fetch"),
      }),
      { code: "INVALID_IMAGE" },
    );
  }
});

test("rejects non-images, malformed image bytes and excessive downloads", async () => {
  for (const [body, headers] of [
    ["<svg></svg>", { "content-type": "image/svg+xml" }],
    ["not an image", { "content-type": "image/png" }],
    [png, { "content-type": "image/png", "content-length": "20000000" }],
    [new Uint8Array(10 * 1024 * 1024 + 1), { "content-type": "image/png" }],
  ]) {
    await assert.rejects(
      downloadFinalImage(data, {
        origin,
        token,
        signal,
        fetcher: async () => new Response(body, { headers }),
      }),
    );
  }
});

test("timeout and browser cancellation cancel the job and release the connection", async () => {
  for (const mode of ["timeout", "abort"]) {
    let cancelled = false,
      closed = false;
    const controller = new AbortController();
    const result = generateImage(payload, {
      token,
      origin,
      signal: controller.signal,
      timeoutMs: 25,
      connect: async () => ({
        submit() {
          if (mode === "abort") setTimeout(() => controller.abort(), 5);
          return {
            cancel: async () => {
              cancelled = true;
            },
            async *[Symbol.asyncIterator]() {
              await new Promise(() => {});
            },
          };
        },
        close() {
          closed = true;
        },
      }),
    });
    await assert.rejects(result, {
      code: mode === "abort" ? "CANCELLED" : "TIMEOUT",
    });
    assert.equal(cancelled, true);
    assert.equal(closed, true);
  }
});

test("a connection resolving after timeout is closed without submitting", async () => {
  let resolveConnection;
  let closed = false;
  await assert.rejects(
    generateImage(payload, {
      token,
      origin,
      signal,
      timeoutMs: 10,
      connect: () =>
        new Promise((resolve) => {
          resolveConnection = resolve;
        }),
    }),
    { code: "TIMEOUT" },
  );
  resolveConnection({
    submit() {
      assert.fail("Must not submit after timeout");
    },
    close() {
      closed = true;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, true);
});

test("upstream failures return safe messages without credentials or raw tracebacks", async () => {
  for (const message of [
    `CUDA unavailable ${token}`,
    `403 ${token}`,
    `traceback /private/file ${token}`,
  ]) {
    const safe = safeGenerationError(new Error(message));
    assert.equal(safe.message.includes(token), false);
    assert.equal(safe.message.includes("traceback"), false);
  }
  assert.equal(
    safeGenerationError(new Error("CUDA unavailable")).code,
    "GPU_UNAVAILABLE",
  );
  await assert.rejects(
    generateImage(payload, {
      token,
      origin,
      signal,
      connect: async () => ({
        submit() {
          return {
            cancel: async () => {},
            async *[Symbol.asyncIterator]() {
              yield {
                type: "status",
                stage: "error",
                message: `CUDA unavailable ${token}`,
              };
            },
          };
        },
        close() {},
      }),
    }),
    { code: "GPU_UNAVAILABLE" },
  );
});
