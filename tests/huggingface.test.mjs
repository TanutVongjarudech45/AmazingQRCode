import test from "node:test";
import assert from "node:assert/strict";
import { getHuggingFaceConfig } from "../src/server/env.ts";
import {
  buildSpacePayload,
  parseGenerationInput,
} from "../src/lib/generation.ts";

const input = {
  url: "https://example.com",
  prompt: "A green garden",
  negative_prompt: "blurry",
};
const fakeToken = "hf_" + "test".repeat(10);

test("requires a server-only token and rejects a public token variable", () => {
  assert.throws(() => getHuggingFaceConfig({}), /Configure HF_TOKEN/);
  assert.throws(
    () =>
      getHuggingFaceConfig({
        HF_TOKEN: fakeToken,
        NEXT_PUBLIC_HF_TOKEN: fakeToken,
      }),
    /server-only/,
  );
  assert.throws(
    () => getHuggingFaceConfig({ HF_TOKEN: fakeToken }),
    /owner\/space/,
  );
  const config = getHuggingFaceConfig({
    HF_TOKEN: fakeToken,
    HF_SPACE_ID: "example/qr-studio",
  });
  assert.equal(config.spaceId, "example/qr-studio");
  assert.equal(config.token, fakeToken);
  assert.throws(
    () =>
      getHuggingFaceConfig({
        HF_TOKEN: fakeToken,
        HF_SPACE_ID: "https://untrusted.example",
      }),
    /owner\/space/,
  );
});

test("sends exactly three text inputs and drops client-side parameter overrides", () => {
  assert.deepEqual(buildSpacePayload(input), input);
  assert.deepEqual(
    buildSpacePayload({
      ...input,
      unsupported_option: "ignored",
      token: fakeToken,
      spaceId: "attacker/space",
    }),
    input,
  );
  assert.deepEqual(Object.keys(buildSpacePayload(input)), [
    "url",
    "prompt",
    "negative_prompt",
  ]);
  assert.equal(
    buildSpacePayload({ ...input, negative_prompt: "" }).negative_prompt,
    "",
  );
});

test("rejects invalid text requests before connecting to the Space", () => {
  for (const change of [
    { url: "javascript:alert(1)" },
    { url: "not-a-url" },
    { prompt: " " },
    { prompt: "x".repeat(1501) },
    { negative_prompt: null },
    { negative_prompt: 123 },
    { negative_prompt: "x".repeat(1501) },
  ]) {
    assert.throws(() => parseGenerationInput({ ...input, ...change }));
  }
  assert.deepEqual(
    parseGenerationInput({
      url: " https://example.com ",
      prompt: " A green garden ",
      negative_prompt: " blurry ",
    }),
    input,
  );
});
