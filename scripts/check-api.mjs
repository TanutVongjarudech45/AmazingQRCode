// Run against a local dev or production server. No valid GPU job is submitted.
import assert from "node:assert/strict";

const base = "http://127.0.0.1:3000";
const json = { "content-type": "application/json", origin: base };
const checks = [
  [{ method: "GET" }, 405],
  [
    {
      method: "POST",
      headers: { ...json, origin: "https://other.example" },
      body: "{}",
    },
    403,
  ],
  [
    {
      method: "POST",
      headers: { ...json, "content-type": "text/plain" },
      body: "{}",
    },
    415,
  ],
  [
    {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        url: "javascript:alert(1)",
        prompt: "garden",
        negative_prompt: "",
      }),
    },
    400,
  ],
  [{ method: "POST", headers: json, body: "invalid JSON" }, 400],
  [{ method: "POST", headers: json, body: "x".repeat(17000) }, 413],
];
for (const [init, expected] of checks) {
  const response = await fetch(`${base}/api/generate`, {
    ...init,
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, expected);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
}
console.log(
  "API smoke checks passed: method, origin, content type, URL, JSON, body limit, and private response headers.",
);
