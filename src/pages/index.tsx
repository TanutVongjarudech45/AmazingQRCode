import Head from "next/head";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type SyntheticEvent,
} from "react";
import { parseGenerationInput } from "@/lib/generation";

type IconName =
  | "sparkles"
  | "arrow"
  | "link"
  | "expand"
  | "close"
  | "check"
  | "leaf"
  | "building"
  | "moon"
  | "grid";
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    sparkles: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
        <path d="m20 2 .7 1.8L23 5l-2.3.7L20 8l-.7-2.3L17 5l2.3-1.2L20 2Z" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </>
    ),
    link: (
      <>
        <path
          d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
          transform="translate(1 1)"
        />
      </>
    ),
    expand: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    leaf: (
      <>
        <path d="M19 4C4 2 3 10 6 15s14 6 13-11Z" />
        <path d="m5 20 10-11" />
      </>
    ),
    building: (
      <>
        <path d="M3 21h18M5 21V8h6V3h8v18M8 12v2m0 3v2m6-12h2m-2 4h2m-2 4h2" />
      </>
    ),
    moon: (
      <>
        <path d="M20 14A8 8 0 0 1 10 4 8 8 0 1 0 20 14Z" />
        <path d="M18 3v4m-2-2h4" />
      </>
    ),
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const styles: {
  name: string;
  icon: IconName;
  prompt: string;
  color: string;
}[] = [
  {
    name: "Botanical",
    icon: "leaf",
    color: "sage",
    prompt:
      "An enchanting botanical garden, moss-covered stone pathways, lush green foliage, soft natural light, intricate details, viewed from above",
  },
  {
    name: "Architecture",
    icon: "building",
    color: "sand",
    prompt:
      "An ornate baroque palace interior, gilded details, graceful arches, chandeliers, warm volumetric light, cinematic, ultra detailed",
  },
  {
    name: "Dreamscape",
    icon: "moon",
    color: "lilac",
    prompt:
      "A surreal moonlit dreamscape, floating islands, lavender clouds, glowing celestial details, ethereal atmosphere, intricate fantasy art",
  },
  {
    name: "Minimal",
    icon: "grid",
    color: "stone",
    prompt:
      "Minimal geometric architecture, warm ivory stone, sculptural shapes, clean lines, soft shadows, calm and elegant composition",
  },
];
const inspirations = [
  "A secret Japanese garden, emerald moss, ivory stepping stones, miniature bonsai trees, tranquil water, beautifully detailed overhead view",
  "An enchanted forest library, winding oak shelves, glowing amber lights, climbing ivy, magical atmosphere, intricate details",
  "A Mediterranean village, terracotta rooftops, cream limestone streets, olive trees, golden afternoon light, viewed from above",
];

// Discourage ordinary image copying without blocking text or page gestures.
const preventArtworkAction = (event: SyntheticEvent) => event.preventDefault();
const artworkProtection = {
  onContextMenu: preventArtworkAction,
  onDragStart: preventArtworkAction,
  onCopy: preventArtworkAction,
};

export default function Home() {
  const [style, setStyle] = useState("Botanical");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState(styles[0].prompt);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<{
    src: string;
    url: string;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  const [modal, setModal] = useState<"help" | "image" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const inspirationIndex = useRef(0);

  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);

  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.src);
    },
    [result],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    setFailed(false);
    let payload;
    try {
      payload = parseGenerationInput({
        url,
        prompt,
        negative_prompt: negativePrompt,
      });
    } catch (error) {
      setFailed(true);
      setNotice(error instanceof Error ? error.message : "Check your inputs.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setNotice(
      "Creating your artwork. Connecting, waiting for a GPU, and rendering can take a few minutes.",
    );
    const timeout = setTimeout(() => controller.abort("timeout"), 255_000);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || "Generation could not finish. Please try again.",
        );
      }
      const blob = await response.blob();
      const extension = (
        {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
        } as Record<string, string>
      )[blob.type];
      if (!extension || !blob.size)
        throw new Error("No valid image was received. Please try again.");
      controller.signal.throwIfAborted();
      setResult({
        src: URL.createObjectURL(blob),
        url: payload.url,
      });
      setNotice(
        "Your final artwork is ready. Enlarge it and test the QR with your phone before sharing.",
      );
    } catch (error) {
      setFailed(
        !controller.signal.aborted || controller.signal.reason === "timeout",
      );
      setNotice(
        controller.signal.aborted
          ? controller.signal.reason === "timeout"
            ? "Generation took too long. Please try again later."
            : "Request cancelled. A generation already running on the Space may still finish."
          : error instanceof Error
            ? error.message
            : "Could not reach the image service. Please try again.",
      );
    } finally {
      clearTimeout(timeout);
      request.current = null;
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>SpeakCode — A little link. A work of art.</title>
        <meta
          name="description"
          content="Give your links a little character. Explore a creative studio for turning URLs into beautiful AI QR artwork."
        />
        <meta name="theme-color" content="#f7f8f2" />
        <link rel="icon" href="/brand.svg" type="image/svg+xml" />
      </Head>
      <a className="skip-link" href="#studio">
        Skip to the studio
      </a>
      <div className="site-shell">
        <header className="site-header">
          <a
            className="brand"
            href="https://mybirdfire.com/"
            aria-label="Tana, home"
          >
            tana
            <span className="brand-mark" aria-hidden="true" />
          </a>
          <nav aria-label="Main navigation">
            <a className="active-nav" href="#studio">
              The studio
            </a>
            <button onClick={() => setModal("help")}>
              How it works <span>↗</span>
            </button>
          </nav>
          <span className="preview-pill">
            <span />
            QR art studio
          </span>
        </header>

        <main>
          <section className="intro" aria-labelledby="intro-title">
            <div>
              <p className="eyebrow">
                <span className="tiny-line" /> SMALL SQUARE. ENDLESS
                POSSIBILITIES.
              </p>
              <h1 id="intro-title">
                A little link.
                <br />A <em>work of art.</em>
                <span className="title-spark">
                  <Icon name="sparkles" size={37} />
                </span>
              </h1>
            </div>
            <div className="intro-aside">
              <p>
                Give your links a little character. <br />
                Turn an everyday QR code into something
                <br className="desktop-break" /> worth looking at.
              </p>
              <div className="model-caption">
                <span className="model-icon">
                  <Icon name="sparkles" size={14} />
                </span>{" "}
                Created with imagination. Powered by AI.
              </div>
            </div>
          </section>

          <section className="studio" id="studio" aria-label="QR art studio">
            <div className="studio-bar">
              <span>
                <Icon name="grid" size={17} /> Your creative workspace
              </span>
              <span className="studio-bar-right">
                <span className="status-dot" /> DREAMSHAPER 8
              </span>
            </div>
            <div className="workspace">
              <form className="create-panel" onSubmit={submit} aria-busy={busy}>
                <div className="panel-heading">
                  <h2>Let’s make it yours.</h2>
                  <p>A destination, a little imagination, and you.</p>
                </div>
                <div className="field-section">
                  <label htmlFor="destination">
                    <span className="step-number">01</span>Your destination
                  </label>
                  <div className="url-field">
                    <Icon name="link" size={18} />
                    <input
                      id="destination"
                      name="url"
                      type="url"
                      maxLength={2048}
                      disabled={busy}
                      autoComplete="url"
                      placeholder="https://your-website.com"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setNotice("");
                      }}
                      required
                      aria-describedby="url-hint"
                    />
                  </div>
                  <p className="field-hint" id="url-hint">
                    Where should your QR code take someone?
                  </p>
                </div>
                <fieldset className="field-section style-section">
                  <legend>
                    <span className="step-number">02</span>Find your aesthetic
                  </legend>
                  <div className="style-options">
                    {styles.map((item) => (
                      <button
                        key={item.name}
                        className={`style-option ${item.color} ${style === item.name ? "selected" : ""}`}
                        type="button"
                        disabled={busy}
                        aria-pressed={style === item.name}
                        onClick={() => {
                          setStyle(item.name);
                          setPrompt(item.prompt);
                          setNotice("");
                        }}
                      >
                        <span className="style-art">
                          <Icon name={item.icon} size={27} />
                          {style === item.name && (
                            <span className="selection-tick">
                              <Icon name="check" size={10} />
                            </span>
                          )}
                        </span>
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="field-section">
                  <div className="label-row">
                    <label htmlFor="prompt">
                      <span className="step-number">03</span>Describe your
                      vision
                    </label>
                    <button
                      type="button"
                      className="inspire-button"
                      disabled={busy}
                      onClick={() => {
                        setPrompt(
                          inspirations[
                            inspirationIndex.current++ % inspirations.length
                          ],
                        );
                        setStyle("");
                        setNotice("");
                      }}
                    >
                      <Icon name="sparkles" size={14} />
                      Inspire me
                    </button>
                  </div>
                  <textarea
                    id="prompt"
                    disabled={busy}
                    name="prompt"
                    rows={4}
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value);
                      setNotice("");
                    }}
                    required
                    maxLength={1500}
                  />
                  <p className="field-hint">
                    Think mood, textures, colors, and all the little details.
                  </p>
                </div>
                <div className="field-section">
                  <label htmlFor="negative-prompt">
                    <span className="step-number">04</span>
                    Negative prompt
                    <span className="optional-label">Optional</span>
                  </label>
                  <textarea
                    id="negative-prompt"
                    disabled={busy}
                    name="negative_prompt"
                    rows={2}
                    value={negativePrompt}
                    onChange={(event) => {
                      setNegativePrompt(event.target.value);
                      setNotice("");
                    }}
                    placeholder="e.g. blurry, low contrast, text, watermark"
                    maxLength={1500}
                    aria-describedby="negative-hint"
                  />
                  <p className="field-hint" id="negative-hint">
                    Anything you’d like to leave out of the image.
                  </p>
                </div>
                <button
                  className="generate-button"
                  type="submit"
                  disabled={busy}
                >
                  <Icon name="sparkles" size={19} />
                  <span>
                    {busy ? "Creating your artwork…" : "Generate QR art"}
                  </span>
                  <Icon name="arrow" size={18} />
                </button>
                <p className="generation-note">
                  {busy
                    ? "Please keep this page open while your artwork is created."
                    : "DreamShaper 8 · crafted from your link and imagination"}
                </p>
                {busy && (
                  <button
                    className="cancel-generation"
                    type="button"
                    onClick={() => request.current?.abort()}
                  >
                    Cancel request
                  </button>
                )}
                {notice && (
                  <p
                    className={`form-notice ${failed ? "error-notice" : ""}`}
                    role={failed ? "alert" : "status"}
                  >
                    {notice}
                  </p>
                )}
              </form>
              <div className="result-panel">
                <div className="result-heading">
                  <span>
                    <span className="status-dot" />{" "}
                    {result ? "YOUR FINAL ARTWORK" : "A LITTLE INSPIRATION"}
                  </span>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={
                      result
                        ? "Enlarge final artwork"
                        : "Enlarge example artwork"
                    }
                    onClick={() => setModal("image")}
                  >
                    <Icon name="expand" size={18} />
                  </button>
                </div>
                <div className="art-stage">
                  <div className="corner-mark top-left" />
                  <div className="corner-mark top-right" />
                  <div className="corner-mark bottom-left" />
                  <div className="corner-mark bottom-right" />
                  <button
                    type="button"
                    className="artwork-button protected-artwork"
                    {...artworkProtection}
                    draggable={false}
                    aria-label={
                      result
                        ? "View final QR artwork"
                        : "View botanical QR artwork example"
                    }
                    onClick={() => setModal("image")}
                  >
                    <Image
                      src={result?.src ?? "/images/botanical-qr.png"}
                      alt={
                        result
                          ? "Your generated final QR artwork"
                          : "Illustrative QR-inspired botanical garden made of emerald hedges and ivory stone paths"
                      }
                      unoptimized={!!result}
                      width={1024}
                      height={1024}
                      priority
                      sizes="(max-width: 760px) 90vw, 48vw"
                      className="artwork"
                      draggable={false}
                    />
                  </button>
                  <span className="art-label">
                    <Icon name={result ? "sparkles" : "leaf"} size={13} />{" "}
                    {result ? "Your creation" : "Botanical garden"}{" "}
                    <span>{result ? "FINAL" : "01"}</span>
                  </span>
                </div>
                <div className="art-caption">
                  <div>
                    <h3>
                      {result
                        ? "Your link, reimagined."
                        : "Nature, with a hidden message."}
                    </h3>
                    <p className="result-destination">
                      {result
                        ? result.url
                        : "A little structure. A little wilderness."}
                    </p>
                  </div>
                  <span className="example-badge">
                    {result ? "FINAL" : "EXAMPLE"}
                  </span>
                </div>
                <div className="preview-note">
                  <span>
                    {result
                      ? "Test the QR with your phone before sharing"
                      : "Illustrative artwork · not a scannable QR code"}
                  </span>
                </div>
              </div>
            </div>
          </section>
          <div className="under-studio">
            <p>
              <Icon name="sparkles" size={15} /> Every link has a story. Make
              yours visual.
            </p>
            <span>YOUR LINK. YOUR IMAGINATION.</span>
          </div>
        </main>
        <footer className="site-footer">
          <a className="footer-brand" href="#">
            SpeakCode
          </a>
          <p>A small experiment in art & connection.</p>
          <span>
            MADE WITH CURIOSITY <span className="footer-star">✳</span>
          </span>
        </footer>
      </div>
      <dialog
        ref={dialog}
        aria-label={
          modal === "image"
            ? result
              ? "Final artwork"
              : "Example artwork"
            : "How SpeakCode works"
        }
        className={`dialog ${modal === "image" ? "image-dialog" : ""}`}
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setModal(null);
        }}
      >
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label="Close dialog"
          onClick={() => setModal(null)}
        >
          <Icon name="close" />
        </button>
        {modal === "image" ? (
          <>
            <Image
              {...artworkProtection}
              className="protected-artwork"
              draggable={false}
              src={result?.src ?? "/images/botanical-qr.png"}
              alt={
                result
                  ? "Enlarged final QR artwork"
                  : "Enlarged botanical QR art example"
              }
              unoptimized={!!result}
              width={1024}
              height={1024}
              sizes="90vw"
            />
            <p>
              {result
                ? "Final artwork — test with your phone before sharing."
                : "Illustrative example — not a scannable QR code."}
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">FROM LINK TO LITTLE MASTERPIECE</p>
            <h2>Three little steps.</h2>
            <ol className="help-steps">
              <li>
                <span>01</span>
                <div>
                  <h3>Start with your link.</h3>
                  <p>
                    A portfolio, a favorite place, or something you want to
                    share.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>Set the scene.</h3>
                  <p>
                    Pick an aesthetic and describe the world you want your QR to
                    live in.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>Make something worth sharing.</h3>
                  <p>
                    Generate your art, then test the final image with your phone
                    before using it.
                  </p>
                </div>
              </li>
            </ol>
            <p className="help-note">
              Creating an image can take a few minutes. Enlarge the final
              artwork when it is ready, and check that scanning opens your
              intended link.
            </p>
          </>
        )}
      </dialog>
    </>
  );
}
