import "server-only";

/** Read at request time; importing this module never exposes or logs a token. */
export function getHuggingFaceConfig(env: NodeJS.ProcessEnv = process.env) {
  if (
    Object.keys(env).some((key) =>
      /^NEXT_PUBLIC_.*(?:HF|HUGGING).*TOKEN/i.test(key),
    )
  ) {
    throw new Error(
      "Hugging Face tokens must use server-only environment variables.",
    );
  }
  const token = env.HF_TOKEN?.trim();
  const spaceId = env.HF_SPACE_ID?.trim();
  if (!token || !/^hf_[A-Za-z0-9]{20,}$/.test(token)) {
    throw new Error("Configure HF_TOKEN in the server environment.");
  }
  if (!spaceId || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(spaceId)) {
    throw new Error("HF_SPACE_ID must be an owner/space identifier.");
  }
  return { token: token as `hf_${string}`, spaceId };
}
