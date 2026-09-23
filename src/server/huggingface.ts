import "server-only";

import { Client } from "@gradio/client";
import { buildSpacePayload } from "../lib/generation";
import { getHuggingFaceConfig } from "./env";
import { generateImage, GenerationError } from "./generate-image";

/** Only called by the API route. Never connect during imports or builds. */
export async function createQrImage(value: unknown, signal: AbortSignal) {
  const payload = buildSpacePayload(value);
  let config;
  try {
    config = getHuggingFaceConfig();
  } catch {
    throw new GenerationError(
      "NOT_CONFIGURED",
      "Image generation is not configured on the server yet.",
      503,
    );
  }
  const { token, spaceId } = config;
  return generateImage(payload, {
    token,
    origin: `https://${spaceId.replace("/", "-").replaceAll("_", "-").toLowerCase()}.hf.space`,
    signal,
    connect: () =>
      Client.connect(spaceId, { hf_token: token, events: ["data", "status"] }),
  });
}
