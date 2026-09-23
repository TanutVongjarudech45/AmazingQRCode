import { parseGenerationInput } from "@/lib/generation";
import { createQrImage } from "@/server/huggingface";
import { safeGenerationError } from "@/server/generate-image";

// A Route Handler supports server-only imports alongside the existing Pages UI.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const privateHeaders = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff",
};
function errorResponse(error: string, status: number, code?: string) {
  return Response.json(
    { error, ...(code ? { code } : {}) },
    { status, headers: privateHeaders },
  );
}

// Local/portfolio guard only. Public hosting needs authentication and a shared limiter.
let active = false;
export async function POST(req: Request) {
  let sameOrigin = false;
  try {
    const origin = req.headers.get("origin");
    sameOrigin = !!origin && new URL(origin).host === req.headers.get("host");
  } catch {
    /* invalid origin */
  }
  if (!sameOrigin || req.headers.get("sec-fetch-site") === "cross-site") {
    return errorResponse("Submit this request from the studio page.", 403);
  }
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return errorResponse("Send a JSON request.", 415);
  }
  if (Number(req.headers.get("content-length")) > 16384)
    return errorResponse("Request is too large.", 413);
  let payload;
  // Bound streamed bodies too, including requests without Content-Length.
  const reader = req.body?.getReader();
  if (!reader) return errorResponse("Send your generation inputs.", 400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        return errorResponse("Request is too large.", 413);
      }
      chunks.push(value);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return errorResponse("Send valid JSON inputs.", 400);
    }
    try {
      payload = parseGenerationInput(body);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : "Invalid inputs.",
        400,
      );
    }
  } catch {
    return errorResponse("Could not read the request.", 400);
  } finally {
    reader.releaseLock();
  }
  if (active) {
    const response = errorResponse(
      "The studio is already creating an image. Please try again shortly.",
      429,
    );
    response.headers.set("Retry-After", "15");
    return response;
  }
  active = true;
  try {
    const image = await createQrImage(payload, req.signal);
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": image.contentType,
        "Content-Disposition": `inline; filename="speakcode-qr.${image.extension}"`,
      },
    });
  } catch (error) {
    const safe = safeGenerationError(error);
    return errorResponse(safe.message, safe.status, safe.code);
  } finally {
    active = false;
  }
}

export function GET() {
  const response = errorResponse("Use POST to generate an image.", 405);
  response.headers.set("Allow", "POST");
  return response;
}
