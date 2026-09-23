import "server-only";
import type { GenerationInput } from "../lib/generation";

type Job = AsyncIterable<{
  type: string;
  stage?: string;
  message?: string;
  data?: unknown;
}> & {
  cancel(): Promise<void>;
};
type Connection = {
  submit(endpoint: string, payload: GenerationInput): Job;
  close(): void;
};
export type ImageResult = {
  bytes: Buffer;
  contentType: string;
  extension: string;
};

export class GenerationError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Only these messages may cross the API boundary. Never echo upstream errors. */
export function safeGenerationError(error: unknown): GenerationError {
  if (error instanceof GenerationError) return error;
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
  if (/quota|exceeded.*GPU|GPU.*exceeded/i.test(message)) {
    return new GenerationError(
      "GPU_QUOTA",
      "GPU quota is temporarily exhausted. Please try again later.",
      503,
    );
  }
  if (
    /CUDA|ZeroGPU|GPU.*(?:unavailable|required|not available)|requires.*GPU|NVIDIA driver/i.test(
      message,
    )
  ) {
    return new GenerationError(
      "GPU_UNAVAILABLE",
      "The image service needs an available GPU. Check the Space hardware, then try again.",
      503,
    );
  }
  if (/unauthorized|forbidden|401|403|invalid.*token/i.test(message)) {
    return new GenerationError(
      "SPACE_ACCESS",
      "The server could not access the private Space. Check its token permissions.",
    );
  }
  return new GenerationError(
    "GENERATION_FAILED",
    "The image service could not finish this request. Please try again shortly.",
  );
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** A private file must stay on this Space, including redirects, before adding credentials. */
export async function downloadFinalImage(
  data: unknown,
  options: {
    origin: string;
    token: string;
    signal: AbortSignal;
    fetcher: typeof fetch;
  },
): Promise<ImageResult> {
  const file = Array.isArray(data) ? data[0] : undefined;
  if (!file || typeof file !== "object" || typeof file.url !== "string") {
    throw new GenerationError(
      "INVALID_IMAGE",
      "The image service returned no final image.",
    );
  }
  const url = new URL(file.url, options.origin);
  if (
    url.origin !== options.origin ||
    url.username ||
    url.password ||
    !/^\/(?:gradio_api\/)?file=/.test(url.pathname)
  ) {
    throw new GenerationError(
      "INVALID_IMAGE",
      "The image service returned an unexpected image location.",
    );
  }
  const response = await options.fetcher(url, {
    headers: { Authorization: `Bearer ${options.token}` },
    signal: options.signal,
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok || !response.body)
    throw new Error(`Image fetch failed: ${response.status}`);
  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  if (
    !extensions[contentType] ||
    Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES
  ) {
    await response.body.cancel();
    throw new GenerationError(
      "INVALID_IMAGE",
      "The image service returned an unsupported image.",
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_IMAGE_BYTES)
        throw new GenerationError(
          "IMAGE_TOO_LARGE",
          "The generated image is too large to download.",
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = Buffer.concat(chunks);
  const valid =
    contentType === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : contentType === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid)
    throw new GenerationError(
      "INVALID_IMAGE",
      "The image service returned an invalid image.",
    );
  return { bytes, contentType, extension: extensions[contentType] };
}

export async function generateImage(
  payload: GenerationInput,
  options: {
    connect: () => Promise<Connection>;
    token: string;
    origin: string;
    signal: AbortSignal;
    timeoutMs?: number;
    fetcher?: typeof fetch;
  },
): Promise<ImageResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new GenerationError(
          "TIMEOUT",
          "Image generation took too long. Please try again later.",
          504,
        ),
      ),
    options.timeoutMs ?? 240_000,
  );
  const abort = () =>
    controller.abort(
      new GenerationError("CANCELLED", "Generation was cancelled.", 499),
    );
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) abort();
  let client: Connection | undefined;
  let job: Job | undefined;
  let finished = false;
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  const work = async () => {
    controller.signal.throwIfAborted();
    client = await options.connect();
    if (controller.signal.aborted) {
      client.close();
      controller.signal.throwIfAborted();
    }
    job = client.submit("/generate_simple", payload);
    let finalData: unknown;
    for await (const event of job) {
      controller.signal.throwIfAborted();
      if (event.type === "status" && event.stage === "error")
        throw new Error(event.message || "Generation failed");
      if (event.type === "data") finalData = event.data;
    }
    finished = true;
    return downloadFinalImage(finalData, {
      ...options,
      signal: controller.signal,
      fetcher: options.fetcher ?? fetch,
    });
  };
  try {
    return await Promise.race([aborted, work()]);
  } catch (error) {
    throw safeGenerationError(error);
  } finally {
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectAbort);
    // Gradio cancellation is best effort; an already running GPU call may still finish.
    if (job && !finished) void job.cancel().catch(() => {});
    client?.close();
  }
}
