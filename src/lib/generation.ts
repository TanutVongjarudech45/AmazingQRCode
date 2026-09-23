/** Browser-safe contract. Credentials and SDK imports belong in src/server only. */
export type GenerationInput = {
  url: string;
  prompt: string;
  negative_prompt: string;
};

/** Validate again on the server before requesting any GPU time. */
export function parseGenerationInput(value: unknown): GenerationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid generation request.");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.url !== "string" || input.url.length > 2048) {
    throw new Error("Enter a valid HTTP or HTTPS URL.");
  }
  let destination: URL;
  try {
    destination = new URL(input.url.trim());
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(destination.protocol) ||
    !destination.hostname
  ) {
    throw new Error("Enter a valid HTTP or HTTPS URL.");
  }
  if (
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > 1500
  ) {
    throw new Error("Enter a prompt between 1 and 1500 characters.");
  }
  if (
    typeof input.negative_prompt !== "string" ||
    input.negative_prompt.length > 1500
  ) {
    throw new Error("Negative prompt must be text up to 1500 characters.");
  }
  return {
    url: input.url.trim(),
    prompt: input.prompt.trim(),
    negative_prompt: input.negative_prompt.trim(),
  };
}

/** The Space owns all model and sampling defaults. Send only these three fields. */
export function buildSpacePayload(value: unknown): GenerationInput {
  return parseGenerationInput(value);
}
