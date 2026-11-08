
"use client";

import {
  useEffect, useRef, useState,
  type CSSProperties, type PointerEvent,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import { toCanvas } from "html-to-image";
import { createRearRaster } from "./rearCardRaster";

// @ts-ignore - JavaScript renderer beside this file
import {
  createGlassRenderer,
  paintRearGlassScene,
} from "./liquidGlass";

const profile = {
  name: "Kurt Alejandro",
  initials: "KA",
  studio: "bolimgfx",
  role: "Graphic Designer & Visual Creator",
  intro: "I craft bold visuals and digital experiences that leave a lasting impression.",
  aboutTeaser:
    "I create bold posters, branding, and digital visuals that tell stories. Explore my portfolio to discover the work behind each concept.",
  specialties: [
    "Graphic Design",
    "Poster Design",
    "Branding",
    "Social Media Visuals",
  ],
  phone: "+63 924 117 2360",
  email: "kurtbolim07@gmail.com",
  behance: "https://www.behance.net/kurtalejandro",
  facebook: "https://www.facebook.com/kurtbolim",
  instagram: "https://www.instagram.com/bolimgfx/",
  linkedin:
    "https://www.linkedin.com/in/kurt-alejandro-683639395/",
  website: "https://bolimgfx.vercel.app/",
  location: "Lipa, Batangas, Philippines",
};

const OPTICS = {
  surface: "convex-squircle",
  refraction: 60,
  refractionScale: 1.5,
  bezel: 3,
  thickness: 150,
  refractiveIndex: 1.5,
  curvature: 9,
  chroma: 6,
  blur: 2,
  specular: 1,
};

const REAR_FOCUS = {
  blur: [1.5, 2, 3.5, 4],
  opacity: 0.26,
};

const TOTAL = 5;
const TURN_MS = 850;
const ORBIT_SAMPLES = 64;
const GLASS_FLIGHT_INTERVAL = 34;
const GLASS_IDLE_INTERVAL = 20;
const SNAPSHOT_DPR_CAP = 1.15;


// BOLIM_MOBILE_GLASS_V40

function mobileGlassDevice() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(
      "(max-width: 600px) and (pointer: coarse)"
    ).matches
  );
}

type Direction = 1 | -1;
type DragStart = {
  x: number;
  y: number;
  pointerId: number;
};

// V3.7: Presentation styling lives in globals.css.

// =======================================
// LOCAL SVG BRAND ICONS
// =======================================

type IconType =
  | "behance"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "gmail"
  | "globe";

function Icon({ type }: { type: IconType }) {
  if (type === "behance") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fillRule="evenodd"
          d="M2 5h6.5c3.2 0 5 1.5 5 4 0 1.6-.7 2.7-2 3.2 1.6.5 2.4 1.8 2.4 3.6 0 2.8-2 4.2-5.2 4.2H2V5Zm3.1 2.8v3.1h3.2c1.4 0 2.1-.5 2.1-1.55 0-1.05-.7-1.55-2.1-1.55H5.1Zm0 5.8v3.6h3.4c1.5 0 2.25-.6 2.25-1.8s-.75-1.8-2.25-1.8H5.1Z"
        />
        <path
          fillRule="evenodd"
          d="M18 8.6c3.15 0 5 2.15 5 5.25 0 .26-.02.55-.05.8h-6.6c.12 1.3.7 2.05 1.84 2.05.82 0 1.37-.4 1.55-1.1h2.94c-.4 2.4-2.07 3.8-4.57 3.8-3.02 0-4.9-2.08-4.9-5.4 0-3.35 1.93-5.4 4.79-5.4Zm-1.61 4.02h3.49c-.13-1.08-.73-1.73-1.75-1.73-1.04 0-1.61.64-1.74 1.73Z"
        />
        <path d="M15 5.55h6.5v1.5H15v-1.5Z" />
      </svg>
    );
  }

  if (type === "instagram") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="5.1"
          stroke="currentColor"
          strokeWidth="2.3"
        />
        <circle
          cx="12"
          cy="12"
          r="4.1"
          stroke="currentColor"
          strokeWidth="2.3"
        />
        <circle
          cx="17.3"
          cy="6.7"
          r="1.35"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (type === "facebook") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M13.46 21v-7.67h2.57l.38-2.99h-2.95V8.44c0-.87.24-1.45 1.48-1.45H16.5V4.31c-.27-.04-1.18-.11-2.24-.11-2.21 0-3.72 1.35-3.72 3.82v2.32H8.04v2.99h2.5V21h2.92Z" />
      </svg>
    );
  }

  if (type === "linkedin") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M6.2 8.8H3.2V21h3V8.8Zm.2-3.78C6.39 4 5.56 3.2 4.72 3.2S3.05 4 3.05 5.02c0 1 .8 1.8 1.63 1.8h.02c.86 0 1.7-.8 1.7-1.8ZM21 13.45c0-3.18-1.7-4.66-3.98-4.66-1.83 0-2.65 1.01-3.1 1.72V8.8h-3c.04 1.14 0 12.2 0 12.2h3v-6.82c0-.36.03-.72.13-.97.28-.72.91-1.47 1.96-1.47 1.38 0 1.93 1.05 1.93 2.59V21h3v-7.55Z" />
      </svg>
    );
  }

  if (type === "gmail") {
    return (
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden="true"
        focusable="false"
      >
        <path fill="#4285F4" d="M18.5 8.8 22 6.1V19h-3.5V8.8Z" />
        <path fill="#34A853" d="M2 6.1 5.5 8.8V19H2V6.1Z" />
        <path
          fill="#EA4335"
          d="M2 6.1c0-1.9 2.3-2.8 3.8-1.7L12 9l6.2-4.6c1.5-1.1 3.8-.2 3.8 1.7l-3.5 2.7L12 13.6 5.5 8.8 2 6.1Z"
        />
        <path fill="#C5221F" d="M2 6.1v2.1l3.5 2.6v-2L2 6.1Z" />
        <path fill="#FBBC04" d="M18.5 8.8v2l3.5-2.6V6.1l-3.5 2.7Z" />
      </svg>
    );
  }

  
  // Portfolio Website — Bolim Logo
  return (
    <img
      src="/bolim.svg"
      alt=""
      width={40}
      height={40}
      draggable={false}
      loading="eager"
      decoding="async"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "inherit",
      }}
    />
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 18 18 6M8 6h10v10" />
    </svg>
  );
}

// =======================================
// STABLE THREE-COLUMN LINK COMPONENT
// =======================================

function LinkRow({
  title,
  caption,
  href,
  type,
  color,
  background,
  external = true,
}: {
  title: string;
  caption: string;
  href: string;
  type: IconType;
  color: string;
  background: string;
  external?: boolean;
}) {
  return (
    <a
      className="deck-link"
      href={href}
      draggable={false}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      <span
        className="deck-link-icon"
        style={{ color, background }}
      >
        <Icon type={type} />
      </span>

      <span className="deck-link-copy">
        <strong>{title}</strong>
        <small>{caption}</small>
      </span>

      <ArrowIcon />
    </a>
  );
}

// =======================================
// MAIN CALLING CARD COMPONENT
// =======================================

export default function Home() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");

  const activeRef = useRef(0);
  const pendingSwipe = useRef<Direction | null>(null);
  const pendingFrame = useRef<number | null>(null);
  const mounted = useRef(false);

  const deckRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  // BOLIM_DRAG_SMOOTH_V44
  const dragRaf = useRef<number | null>(null);
  const latestDragAmount = useRef(0);

  const busy = useRef(false);
  const flightRunning = useRef(false);
  const ignoreClick = useRef(false);

  const clickTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const raf = useRef<number | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const repaint = useRef<() => void>(() => {});

  // Paint the lens using final card coordinates.
  const renderSettledGlass =
    useRef<() => void>(() => {});

  // BOLIM_MOBILE_GLASS_V43: mobile-only pre-rendered glass handoff.
  const prepareIncomingGlass =
    useRef<(index: number) => boolean>(() => false);
  const warmAdjacentGlass =
    useRef<() => void>(() => {});

  const mobileTurnId = useRef(0);

  const previewReady = useRef(
    new Set<number>()
  );

  const updateRearPreview =
    useRef<() => void>(() => {});

  const snapshots = useRef<{
    key: string;
    images: (HTMLCanvasElement | null)[];
  }>({
    key: "",
    images: Array(TOTAL).fill(null),
  });

  // =======================================
  // CLEANUP
  // =======================================

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      pendingSwipe.current = null;

      if (pendingFrame.current !== null)
        cancelAnimationFrame(pendingFrame.current);

      if (clickTimer.current)
        clearTimeout(clickTimer.current);

      if (copyTimer.current)
        clearTimeout(copyTimer.current);

      if (raf.current !== null)
        cancelAnimationFrame(raf.current);

      if (dragRaf.current !== null)
        cancelAnimationFrame(dragRaf.current);
    };
  }, []);

  // =======================================
  // PACED LIQUID GLASS RENDERER
  // =======================================

  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;

    const cards = Array.from(
      deck.querySelectorAll<HTMLElement>(".deck-card")
    );

    const engines = new Map<
      HTMLElement,
      ReturnType<typeof createGlassRenderer>
    >();

    const scene = document.createElement("canvas");
    scene.width = scene.height = 1;

    const initialScene = scene.getContext("2d");

    if (initialScene) {
      initialScene.fillStyle = "#080910";
      initialScene.fillRect(0, 0, 1, 1);
    }

    let disposed = false;
    let capturing = false;
    let scheduled = 0;
    let lastPaint = 0;

    const previewCache = new Map<
      number,
      Map<number, HTMLCanvasElement>
    >();

    let previewSize = "";

    // All previews are cached by the existing snapshot geometry.
    const preparedLens = new Set<number>();
    let preparedKey = "";
    let warmTimer: number | null = null;

    function refreshRearPreviews() {
      if (!mobileGlassDevice()) return;

      const activeIndex = activeRef.current;

      for (const card of cards) {
        const index = Number(
          card.dataset.cardIndex
        );

        const depth =
          (index - activeIndex + TOTAL) %
          TOTAL;

        const variants =
          previewCache.get(index);

        const raster =
          card.querySelector<HTMLCanvasElement>(
            ".card-rear-raster"
          );

        if (!raster || !variants?.size) {
          continue;
        }

        const preferredDepth = depth || 4;

        
const selectedDepth =
  variants.has(preferredDepth)
    ? preferredDepth
    : (variants.keys().next().value as number);


        const image =
          variants.get(selectedDepth);

        if (!image) continue;

        const stamp =
          previewSize + ":" + selectedDepth;

        if (
          raster.dataset.previewStamp !==
          stamp
        ) {
          raster.width = image.width;
          raster.height = image.height;

          raster
            .getContext("2d")
            ?.drawImage(image, 0, 0);

          raster.dataset.previewStamp =
            stamp;
        }

        previewReady.current.add(index);

        card.classList.add(
          "has-rear-preview"
        );
      }
    }

    updateRearPreview.current =
      refreshRearPreviews;

    function getQuad(
      card: HTMLElement,
      deckRect: DOMRect
    ): [number, number][] | null {
      const pts: [number, number][] = [];

      for (const pos of ["tl", "tr", "br", "bl"]) {
        const el = card.querySelector<HTMLElement>(
          `.glass-anchor.${pos}`
        );

        if (!el) return null;

        const r = el.getBoundingClientRect();

        pts.push([
          r.left - deckRect.left,
          r.top - deckRect.top,
        ]);
      }

      return pts;
    }

    function paint(
      force = false,
      onlyIndex: number | null = null
    ): boolean {
      if (disposed || document.hidden || !deck) return false;

      // No live WebGL redraw while moving in iOS WebKit.
      if (
        !force &&
        mobileGlassDevice() &&
        flightRunning.current
      ) {
        return false;
      }

      let painted = false;

      const stageW = deck.clientWidth;
      const stageH = deck.clientHeight;

      if (!stageW || !stageH) return false;

      const deckRect = deck.getBoundingClientRect();

      for (const card of cards) {
        const isFront = card.classList.contains("front");

        if (
          !isFront &&
          !card.classList.contains("glass-incoming")
        ) {
          continue;
        }

        const index = Number(card.dataset.cardIndex);
        if (onlyIndex !== null && index !== onlyIndex) continue;
        const nextIndex = (index + 1) % TOTAL;

        const readyTexture =
          snapshots.current.images[nextIndex];

        if (
          isFront &&
          !deck.classList.contains("glass-ready") &&
          !readyTexture
        ) {
          continue;
        }

        const canvas =
          card.querySelector<HTMLCanvasElement>(
            ".card-liquid-canvas"
          );

        if (!canvas) continue;

        let engine = engines.get(card);

        if (!engine) {
          engine = createGlassRenderer(canvas);
          engines.set(card, engine);
        }

        const cardW = card.offsetWidth;
        const cardH = card.offsetHeight;

        if (!cardW || !cardH) continue;

        const quad = getQuad(card, deckRect);
        if (!quad) continue;

        const radius =
          parseFloat(
            getComputedStyle(card).borderTopLeftRadius
          ) || 28;

        const nextCard = cards.find(
          (el) =>
            Number(el.dataset.cardIndex) === nextIndex
        );

        const sourceQuad = nextCard
          ? getQuad(nextCard, deckRect)
          : null;

        const sourceImage =
          snapshots.current.images[nextIndex];

        if (!sourceImage || !sourceQuad) {
          paintRearGlassScene(scene, {
            stageW,
            stageH,
            cardW,
            cardH,
            sourceIndex: nextIndex,
            sourceQuad,
            snapshots: snapshots.current.images,
          });
        } else if (
          scene.width !== 1 ||
          scene.height !== 1
        ) {
          scene.width = scene.height = 1;

          const ctx = scene.getContext("2d");

          if (ctx) {
            ctx.fillStyle = "#080910";
            ctx.fillRect(0, 0, 1, 1);
          }
        }

        engine.render(scene, {
          stageW,
          stageH,
          cardW,
          cardH,
          radius,
          quad,
          sourceQuad,
          sourceImage,
          ...OPTICS,
          lightX: mouse.current.x + 0.5,
          lightY: mouse.current.y + 0.5,
        });
        painted = true;

        if (
          !force &&
          isFront &&
          sourceImage &&
          sourceQuad &&
          !deck.classList.contains("glass-ready")
        ) {
          deck.classList.add("glass-ready");
        }
      }

      lastPaint = performance.now();
      return painted;
    }

    function queue() {
      if (disposed || scheduled) return;

      scheduled = requestAnimationFrame((time) => {
        scheduled = 0;

        // Freeze mobile glass during the 3D orbit.
        if (
          mobileGlassDevice() &&
          flightRunning.current
        ) {
          return;
        }

        const interval =
          dragStart.current !== null
            ? (mobileGlassDevice() ? 60 : 38)
            : flightRunning.current
              ? GLASS_FLIGHT_INTERVAL
              : GLASS_IDLE_INTERVAL;

        if (time - lastPaint >= interval) {
          paint();
        } else if (!flightRunning.current) {
          queue();
        }

        if (flightRunning.current && !disposed) {
          queue();
        }
      });
    }

    repaint.current = queue;
    renderSettledGlass.current = () => { void paint(); };

    function prepareFrontLens(targetIndex: number): boolean {
      if (dragStart.current !== null) return false;
      const deck = deckRef.current;
      if (!deck) return false;
      if (
        disposed ||
        !mobileGlassDevice() ||
        document.hidden ||
        flightRunning.current ||
        deck.classList.contains("swiping-live")
      ) {
        return false;
      }

      const geometry = [
        snapshots.current.key,
        deck.clientWidth,
        deck.clientHeight,
      ].join(":");

      if (geometry !== preparedKey) {
        preparedKey = geometry;
        preparedLens.clear();
      }

      const sourceIndex = (targetIndex + 1) % TOTAL;
      if (!snapshots.current.images[sourceIndex]) return false;
      if (preparedLens.has(targetIndex)) return true;

      const incoming = cards.find(
        (c) => Number(c.dataset.cardIndex) === targetIndex
      );
      const preview = incoming?.querySelector<HTMLCanvasElement>(
        ".card-glass-preview"
      );
      const live = incoming?.querySelector<HTMLCanvasElement>(
        ".card-liquid-canvas"
      );
      if (!incoming || !preview || !live) return false;

      const originalClasses = cards.map((card) => card.className);
      const slots = [
        "front", "rear-one", "rear-two", "rear-three", "rear-four"
      ];

      try {
        // There is no browser paint between these synchronous DOM changes.
        // Avoid interpolated transforms when measuring future card corners.
        deck.classList.add("glass-preparing");
        cards.forEach((card, i) => {
          const index = Number(card.dataset.cardIndex);
          const slot = slots[(index - targetIndex + TOTAL) % TOTAL];
          card.className =
            "deck-card " + slot +
            (originalClasses[i].includes("has-rear-preview")
              ? " has-rear-preview" : "");
        });

        if (!paint(true, targetIndex) || !live.width || !live.height) {
          return false;
        }

        // Important: copy in the same task as WebGL draw, BEFORE the
        // WebGL drawing buffer can be discarded by the compositor.
        preview.width = live.width;
        preview.height = live.height;
        const ctx = preview.getContext("2d");
        if (!ctx) return false;
        ctx.drawImage(live, 0, 0);
        preparedLens.add(targetIndex);
        return true;
      } catch (error) {
        console.warn("Mobile glass preparation skipped:", error);
        return false;
      } finally {
        cards.forEach((card, i) => {
          card.className = originalClasses[i];
        });
        // Flush the restored poses while transitions are disabled.
        void deck.offsetWidth;
        deck.classList.remove("glass-preparing");
      }
    }

    prepareIncomingGlass.current = prepareFrontLens;

    function warmNeighbors() {
      if (dragStart.current !== null) return;
      const deck = deckRef.current;
      if (!deck) return;
      if (
        disposed || !mobileGlassDevice() ||
        flightRunning.current || warmTimer !== null
      ) return;

      // Schedule preparation off the swipe's animation frames.
      warmTimer = window.setTimeout(() => {
        warmTimer = null;
        if (
          disposed || document.hidden || flightRunning.current ||
          deck.classList.contains("mobile-glass-settling")
        ) return;

        const current = activeRef.current;
        prepareFrontLens((current + 1) % TOTAL);

        window.setTimeout(() => {
          if (
            disposed || document.hidden || flightRunning.current ||
            deck.classList.contains("mobile-glass-settling")
          ) return;
          prepareFrontLens((activeRef.current + TOTAL - 1) % TOTAL);
        }, 100);
      }, 65);
    }

    warmAdjacentGlass.current = warmNeighbors;


    const idle = () =>
      new Promise<void>((resolve) => {
        if (
          typeof window.requestIdleCallback ===
          "function"
        ) {
          window.requestIdleCallback(
            () => resolve(),
            { timeout: 600 }
          );
        } else {
          window.setTimeout(resolve, 28);
        }
      });

    const waitForSwipe = async () => {
      while (!disposed && (flightRunning.current || dragStart.current !== null)) {
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, 90)
        );
      }
    };


    async function finishOtherRearDepths(
      key: string,
      width: number,
      height: number,
      images: (HTMLCanvasElement | null)[]
    ) {
      if (!mobileGlassDevice()) return;
      for (let index = 0; index < TOTAL; index++) {
        const image = images[index];
        if (!image) continue;
        let variants = previewCache.get(index);
        if (!variants) {
          variants = new Map();
          previewCache.set(index, variants);
        }
        for (const depth of [1, 2, 3, 4]) {
          if (disposed || previewSize !== key) return;
          if (variants.has(depth)) continue;
          await waitForSwipe();
          await idle();
          await waitForSwipe();
          if (disposed || previewSize !== key) return;
          if (!variants.has(depth)) {
            variants.set(
              depth, createRearRaster(image, width, height, depth)
            );
            refreshRearPreviews();
          }
        }
      }
    }

    async function captureCards() {
      if (
        disposed ||
        capturing ||
        cards.length !== TOTAL
      ) {
        return;
      }

      const width = cards[0].offsetWidth;
      const height = cards[0].offsetHeight;

      if (!width || !height) return;

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        SNAPSHOT_DPR_CAP
      );

      const key =
        `${width}:${height}:${dpr}`;

      if (
        mobileGlassDevice() &&
        previewSize !== key
      ) {
        previewSize = key;
        previewCache.clear();
        previewReady.current.clear();

        for (const card of cards) {
          card.classList.remove(
            "has-rear-preview"
          );

          card.querySelector<HTMLCanvasElement>(
            ".card-rear-raster"
          )?.removeAttribute(
            "data-preview-stamp"
          );
        }
      }

      if (
        key === snapshots.current.key &&
        snapshots.current.images.every(Boolean)
      ) {
        queue();
        return;
      }

      capturing = true;

      const host = document.createElement("div");

      Object.assign(host.style, {
        position: "fixed",
        left: "-20000px",
        top: "0",
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: "none",
      });

      host.setAttribute("aria-hidden", "true");
      host.inert = true;
      document.body.appendChild(host);

      const images: (HTMLCanvasElement | null)[] =
        key === snapshots.current.key
          ? [...snapshots.current.images]
          : Array(TOTAL).fill(null);

      const frontIndex = Number(
        cards.find((c) => c.classList.contains("front"))
          ?.dataset.cardIndex || 0
      );

      const priority = (frontIndex + 1) % TOTAL;
      const lookahead = (frontIndex + 2) % TOTAL;
      const previous = (frontIndex + TOTAL - 1) % TOTAL;

      // Refraction for the NEXT front card uses TWO cards ahead.
      const order = [priority, lookahead, frontIndex, previous,
        ...Array.from({ length: TOTAL }, (_, i) => i)
      ].filter((index, pos, all) => all.indexOf(index) === pos);

      try {
        await document.fonts.ready;

        for (const index of order) {
          if (disposed) break;
          if (images[index]) continue;

          // Avoid expensive captures during swipe.
          await waitForSwipe();

          if (index !== priority) {
            await idle();
            await waitForSwipe();
          }

          if (disposed) break;

          const card = cards.find(
            (el) =>
              Number(el.dataset.cardIndex) === index
          );

          if (!card) continue;

          const clone =
            card.cloneNode(true) as HTMLElement;

          clone.className = "deck-card lens-capture";
          clone.removeAttribute("aria-hidden");
          clone.removeAttribute("inert");

          clone
            .querySelector(".card-liquid-canvas")
            ?.remove();

          clone.querySelector(
            ".card-rear-raster"
          )?.remove();

          host.appendChild(clone);

          try {
            images[index] = await toCanvas(clone, {
              pixelRatio: dpr,
              backgroundColor: "transparent",
              width,
              height,
              style: {
                position: "relative",
                top: "0",
                left: "0",
                transform: "none",
                margin: "0",
              },
            });
          } catch (err) {
            console.warn(
              "Could not capture source card",
              index,
              err
            );
          } finally {
            clone.remove();
          }

          if (!disposed && images[index]) {
            snapshots.current = {
              key,
              images: [...images],
            };

            queue();

            warmNeighbors();

            // Keep the immediate depth raster for visual continuity.
            // Alternate depths are finished after source-card captures.
            if (mobileGlassDevice()) {
              const slot = (index - activeRef.current + TOTAL) % TOTAL;
              const depth = slot || 4;
              let variants = previewCache.get(index);
              if (!variants) {
                variants = new Map();
                previewCache.set(index, variants);
              }

              await waitForSwipe();
              await idle();
              await waitForSwipe();
              if (
                !disposed && previewSize === key &&
                images[index] && !variants.has(depth)
              ) {
                variants.set(
                  depth,
                  createRearRaster(images[index]!, width, height, depth)
                );
                refreshRearPreviews();
              }
            }

            if (index === priority) {
              await new Promise<void>((resolve) => {
                let done = false;

                const finish = () => {
                  if (done) return;
                  done = true;
                  window.clearTimeout(timeout);
                  resolve();
                };

                const timeout =
                  window.setTimeout(finish, 85);

                requestAnimationFrame(() =>
                  requestAnimationFrame(finish)
                );
              });
            }
          }
        }
      } finally {
        host.remove();
        capturing = false;
      }

      if (!disposed) {
        snapshots.current = {
          key,
          images: [...images],
        };

        queue();
        warmNeighbors();
        void finishOtherRearDepths(key, width, height, images)
          .catch((error) => console.warn("Rear raster idle work:", error));
      }
    }

    const observer = new ResizeObserver(() => {
      if (
        mobileGlassDevice() &&
        flightRunning.current
      ) {
        return;
      }

      queue();
      void captureCards();
    });

    observer.observe(deck);

    cards.forEach((card) => observer.observe(card));

    queue();
    void captureCards();

    return () => {
      disposed = true;
      observer.disconnect();

      if (scheduled) cancelAnimationFrame(scheduled);

      engines.forEach((engine) => engine.destroy());
      engines.clear();

      if (warmTimer !== null) window.clearTimeout(warmTimer);

      repaint.current = () => {};
      renderSettledGlass.current = () => {};
      prepareIncomingGlass.current = () => false;
      warmAdjacentGlass.current = () => {};
      updateRearPreview.current = () => {};
    };
  }, []);

  useEffect(() => {
    repaint.current();
    updateRearPreview.current();
    warmAdjacentGlass.current();
  }, [active]);

  // =======================================
  // PARALLAX AND DRAG RESET
  // =======================================

  function resetParallax() {
    if (raf.current !== null)
      cancelAnimationFrame(raf.current);

    raf.current = null;
    mouse.current = { x: 0, y: 0 };

    const deck = deckRef.current;
    if (!deck) return;

    const vars: Record<string, string> = {
      "--tilt-x": "0deg",
      "--tilt-y": "0deg",
      "--rear-shift-x": "0px",
      "--rear-shift-y": "0px",
      "--rear-shift-x2": "0px",
      "--rear-shift-y2": "0px",
      "--rear-shift-x3": "0px",
      "--rear-shift-y3": "0px",
      "--light-x": "50%",
      "--light-y": "8%",
    };

    Object.entries(vars).forEach(([k, v]) =>
      deck.style.setProperty(k, v)
    );

    repaint.current();
  }

  function resetDrag() {
    if (dragRaf.current !== null) {
      cancelAnimationFrame(dragRaf.current);
      dragRaf.current = null;
    }
    const deck = deckRef.current;
    if (!deck) return;

    deck.classList.remove("dragging");
    deck.style.setProperty("--drag-x", "0px");
    deck.style.setProperty("--drag-rotate", "0deg");

    repaint.current();
  }

  // =======================================
  // CONTINUOUS 3D SWIPE
  // =======================================

  function turn(direction: Direction) {
    if (
      busy.current ||
      pendingFrame.current !== null
    ) {
      pendingSwipe.current = direction;
      return;
    }

    const deck = deckRef.current;
    if (!deck) return;

    if (
      mobileGlassDevice() &&
      deck.classList.contains("mobile-glass-settling")
    ) {
      pendingSwipe.current = direction;
      return;
    }

    const cards = Array.from(
      deck.querySelectorAll<HTMLElement>(".deck-card")
    );

    if (cards.length !== TOTAL) return;

    const fromActive = activeRef.current;

    const toActive =
      (fromActive + direction + TOTAL) % TOTAL;

    const outgoingIndex = fromActive;
    const incomingIndex = toActive;

    const flyingIndex =
      direction === 1
        ? outgoingIndex
        : incomingIndex;

    const incoming = cards.find(
      (card) =>
        Number(card.dataset.cardIndex) === incomingIndex
    );

    if (!incoming) return;

    if (mobileGlassDevice()) {
      incoming.dataset.glassPrepared =
        prepareIncomingGlass.current(toActive) ? "1" : "0";
    }

    busy.current = true;
    flightRunning.current = true;

    const turnId = ++mobileTurnId.current;

    if (mobileGlassDevice()) {
      deck.classList.remove(
        "mobile-glass-settling"
      );

      deck.classList.add(
        "mobile-glass-flight"
      );
    }

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const cs = getComputedStyle(deck);

    const variable = (
      key: string,
      fallback: number
    ) => {
      const n = parseFloat(
        cs.getPropertyValue(key)
      );

      return Number.isFinite(n) ? n : fallback;
    };

    const inline = (key: string) =>
      parseFloat(
        deck.style.getPropertyValue(key)
      ) || 0;

    type Pose = {
      x: number;
      y: number;
      z: number;
      rx: number;
      ry: number;
      rz: number;
      scale: number;
    };

    const frontRest: Pose = {
      x: variable("--front-x", 18),
      y: 0,
      z: variable("--front-z", 50),
      rx: 0,
      ry: 0,
      rz: variable("--front-angle", 2),
      scale: 1,
    };

    const rearRest: Pose = {
      x: variable("--rear4-x", -62),
      y: variable("--rear4-y", -28),
      z: variable("--rear4-z", -108),
      rx: 0,
      ry: 0,
      rz: -11,
      scale: 0.925,
    };

    const frontDragged: Pose = {
      ...frontRest,
      x: frontRest.x + inline("--drag-x"),
      rx: inline("--tilt-x"),
      ry: inline("--tilt-y") + inline("--drag-rotate"),
    };

    const clamp = (n: number) =>
      Math.max(0, Math.min(1, n));

    const smooth = (n: number) => {
      const t = clamp(n);
      return t * t * (3 - 2 * t);
    };

    const smoother = (n: number) => {
      const t = clamp(n);
      return (
        t * t * t *
        (t * (t * 6 - 15) + 10)
      );
    };

    const lerp = (
      a: number,
      b: number,
      t: number
    ) => a + (b - a) * t;

    const fmt = (n: number) =>
      n.toFixed(4);

    const poseToTransform = (p: Pose) =>
      `translate(-50%, -50%) ` +
      `translate3d(${fmt(p.x)}px, ${fmt(p.y)}px, ${fmt(p.z)}px) ` +
      `rotateX(${fmt(p.rx)}deg) ` +
      `rotateY(${fmt(p.ry)}deg) ` +
      `rotateZ(${fmt(p.rz)}deg) ` +
      `scale(${p.scale.toFixed(6)})`;

    const side = direction === 1 ? -1 : 1;

    const clearance = Math.max(
      deck.clientWidth *
        (direction === 1 ? 0.62 : 0.56),
      cards[0].offsetWidth / 2 +
        (direction === 1 ? 155 : 128)
    );

    const sideX = side * clearance;

    const role = (
      index: number,
      current: number
    ) =>
      [
        "front",
        "rear-one",
        "rear-two",
        "rear-three",
        "rear-four",
      ][(index - current + TOTAL) % TOTAL];

    deck.classList.add("swiping-live");

    const zero: Record<string, string> = {
      "--drag-x": "0px",
      "--drag-rotate": "0deg",
      "--tilt-x": "0deg",
      "--tilt-y": "0deg",
      "--rear-shift-x": "0px",
      "--rear-shift-y": "0px",
      "--rear-shift-x2": "0px",
      "--rear-shift-y2": "0px",
      "--rear-shift-x3": "0px",
      "--rear-shift-y3": "0px",
    };

    const saved = Object.fromEntries(
      Object.keys(zero).map((k) => [
        k,
        deck.style.getPropertyValue(k),
      ])
    );

    const original = cards.map((card) => {
      const style = getComputedStyle(card);

      const content = Array.from(
        card.querySelectorAll<HTMLElement>(
          ":scope > .card-header, " +
          ":scope > .card-body, " +
          ":scope > .card-footer"
        )
      );

      return {
        card,
        index: Number(card.dataset.cardIndex),
        content,
        startTransform: style.transform,
        startFilter: style.filter,
        startZ: style.zIndex,
        startOpacity: content.map(
          (el) =>
            Number(getComputedStyle(el).opacity)
        ),
        glass:
          card.querySelector<HTMLElement>(
            ".card-liquid-canvas"
          ),
        surface:
          card.querySelector<HTMLElement>(
            ".card-surface"
          ),

        rearRaster:
          card.querySelector<HTMLElement>(
            ".card-rear-raster"
          ),
        glassPreview:
          card.querySelector<HTMLElement>(
            ".card-glass-preview"
          ),

        startRasterOpacity: Number(
          getComputedStyle(
            card.querySelector<HTMLElement>(
              ".card-rear-raster"
            )!
          ).opacity
        ),
      };
    });

    Object.entries(zero).forEach(([k, v]) =>
      deck.style.setProperty(k, v)
    );

    const snap = original.map((item) => {
      const old = item.card.className;

      item.card.className =
        `deck-card ${role(item.index, toActive)}` +
        (
          old.includes("has-rear-preview")
            ? " has-rear-preview"
            : ""
        );

      const style = getComputedStyle(item.card);

      const endTransform = style.transform;
      const endZ = style.zIndex;
      const endFilter = style.filter;

      const endRasterOpacity =
        item.rearRaster
          ? Number(
              getComputedStyle(
                item.rearRaster
              ).opacity
            )
          : 0;

      const endOpacity = item.content.map(
        (el) =>
          Number(getComputedStyle(el).opacity)
      );

      item.card.className = old;

      return {
        ...item,
        endTransform,
        endZ,
        endFilter,
        endOpacity,
        endRasterOpacity,
      };
    });

    Object.entries(saved).forEach(([k, v]) =>
      v
        ? deck.style.setProperty(k, v)
        : deck.style.removeProperty(k)
    );

    // =====================================
    // ACTUAL ORBIT KEYFRAMES
    // =====================================

    function orbitFrames(
      item: (typeof snap)[number]
    ): Keyframe[] {
      const result: Keyframe[] = [];

      for (let i = 0; i <= ORBIT_SAMPLES; i++) {
        const t = i / ORBIT_SAMPLES;

        const u = direction === 1 ? t : 1 - t;
        const p = smoother(u);

        const arc = Math.pow(
          Math.max(0, Math.sin(Math.PI * p)),
          0.62
        );

        const linearX = lerp(
          direction === 1
            ? frontDragged.x
            : frontRest.x,
          rearRest.x,
          p
        );

        const depthProgress =
          smooth((u - 0.14) / 0.57);

        const depthOvershoot =
          46 *
          Math.pow(
            Math.max(0, Math.sin(Math.PI * p)),
            1.8
          );

        const pose: Pose = {
          x: lerp(linearX, sideX, arc),

          y:
            lerp(
              direction === 1
                ? frontDragged.y
                : frontRest.y,
              rearRest.y,
              p
            ) - 2 * arc,

          z:
            lerp(
              direction === 1
                ? frontDragged.z
                : frontRest.z,
              rearRest.z,
              depthProgress
            ) - depthOvershoot,

          rx:
            lerp(
              direction === 1
                ? frontDragged.rx
                : frontRest.rx,
              rearRest.rx,
              p
            ) * (1 - 0.8 * arc),

          ry:
            lerp(
              direction === 1
                ? frontDragged.ry
                : frontRest.ry,
              rearRest.ry,
              p
            ) - side * 83 * arc,

          rz: lerp(
            direction === 1
              ? frontDragged.rz
              : frontRest.rz,
            rearRest.rz,
            p
          ),

          scale:
            lerp(
              direction === 1
                ? frontDragged.scale
                : frontRest.scale,
              rearRest.scale,
              p
            ) - 0.008 * arc,
        };

        result.push({
          offset: t,

          transform:
            i === 0
              ? item.startTransform
              : i === ORBIT_SAMPLES
                ? item.endTransform
                : poseToTransform(pose),

          zIndex:
            direction === 1
              ? t < 0.68
                ? "45"
                : item.endZ
              : t < 0.62
                ? item.startZ
                : "45",
        });
      }

      result[result.length - 1].zIndex =
        item.endZ;

      return result;
    }

    incoming.classList.add("glass-incoming");
    repaint.current();

    const stageElement: HTMLDivElement = deck;
    const incomingCard: HTMLElement = incoming;

    // =====================================
    // FINISH SWIPE AND HANDLE QUEUE
    // =====================================

    function finishTurn(completed: Animation[] = []) {
      if (!mounted.current) {
        completed.forEach((a) => a.cancel());
        return;
      }

      activeRef.current = toActive;
      flushSync(() => setActive(toActive));

      updateRearPreview.current();

      completed.forEach((a) => a.cancel());

      incomingCard.classList.remove("glass-incoming");

      flightRunning.current = false;
      busy.current = false;
      repaint.current();

      const queued = pendingSwipe.current;
      pendingSwipe.current = null;

      // Finish every iPhone glass handoff
      // before starting another queued swipe.

      if (mobileGlassDevice()) {
        stageElement.classList.add(
          "mobile-glass-settling"
        );

        stageElement.classList.remove(
          "swiping-live"
        );

        pendingSwipe.current = queued;

        requestAnimationFrame(() => {
          if (
            !mounted.current ||
            mobileTurnId.current !== turnId
          ) {
            return;
          }

          renderSettledGlass.current();

          requestAnimationFrame(() => {
            if (
              !mounted.current ||
              mobileTurnId.current !== turnId
            ) {
              return;
            }

            stageElement.classList.remove(
              "mobile-glass-flight",
              "mobile-glass-settling"
            );
            incomingCard.removeAttribute("data-glass-prepared");
            warmAdjacentGlass.current();

            const next =
              pendingSwipe.current;

            pendingSwipe.current = null;

            if (next !== null) {
              turn(next);
            }
          });
        });

        return;
      }

      if (queued === null) {
        stageElement.classList.remove("swiping-live");

        if (mobileGlassDevice()) {
          stageElement.classList.add(
            "mobile-glass-settling"
          );

          requestAnimationFrame(() => {
            if (
              !mounted.current ||
              mobileTurnId.current !== turnId
            ) {
              return;
            }

            // Calculate refraction at the final
            // resting position of the front card.
            renderSettledGlass.current();

            requestAnimationFrame(() => {
              if (
                !mounted.current ||
                mobileTurnId.current !== turnId
              ) {
                return;
              }

              stageElement.classList.remove(
                "mobile-glass-flight",
                "mobile-glass-settling"
              );
              incomingCard.removeAttribute("data-glass-prepared");
              warmAdjacentGlass.current();

              const next = pendingSwipe.current;
              pendingSwipe.current = null;

              if (next !== null) {
                turn(next);
              }
            });
          });
        }

        return;
      }

      pendingFrame.current = requestAnimationFrame(() => {
        pendingFrame.current = null;

        if (!mounted.current) return;

        const latest = pendingSwipe.current ?? queued;
        pendingSwipe.current = null;
        turn(latest);
      });
    }

    if (reduced) {
      resetDrag();
      resetParallax();
      finishTurn();
      return;
    }

    // =====================================
    // WEB ANIMATIONS
    // =====================================

    const options: KeyframeAnimationOptions = {
      duration: TURN_MS,
      fill: "both",
      easing: "linear",
    };

    const animations: Animation[] = [];

    function tween(
      element: HTMLElement | null,
      property: "transform" | "filter" | "opacity",
      first: string | number,
      last: string | number,
      begin: number,
      end: number
    ) {
      if (!element || first === last) return;

      animations.push(
        element.animate(
          [
            { offset: 0, [property]: first },
            {
              offset: begin,
              [property]: first,
              easing: "cubic-bezier(.25,.65,.22,1)",
            },
            { offset: end, [property]: last },
            { offset: 1, [property]: last },
          ],
          options
        )
      );
    }

    function stackingOrder(
      item: (typeof snap)[number],
      at: number
    ) {
      if (item.startZ === item.endZ) return;

      animations.push(
        item.card.animate(
          [
            { offset: 0, zIndex: item.startZ },
            {
              offset: at - 0.001,
              zIndex: item.startZ,
            },
            { offset: at, zIndex: item.endZ },
            { offset: 1, zIndex: item.endZ },
          ],
          options
        )
      );
    }

    for (const item of snap) {
      const isFlying = item.index === flyingIndex;
      const isArriving = item.index === incomingIndex;
      const isLeaving = item.index === outgoingIndex;

      const oldSlot =
        (item.index - fromActive + TOTAL) % TOTAL;

      let begin = 0.18;
      let finish = 0.92;

      if (direction === 1) {
        begin = 0.16 + (4 - oldSlot) * 0.055;
        finish = 0.77 + (4 - oldSlot) * 0.045;
      } else {
        begin = 0.13 + oldSlot * 0.055;
        finish = 0.66 + oldSlot * 0.055;
      }

      if (isFlying) {
        animations.push(
          item.card.animate(
            orbitFrames(item),
            options
          )
        );

        tween(
          item.card,
          "filter",
          item.startFilter,
          item.endFilter,
          direction === 1 ? 0.67 : 0.46,
          direction === 1 ? 1 : 0.95
        );
      } else {
        tween(
          item.card,
          "transform",
          item.startTransform,
          item.endTransform,
          begin,
          finish
        );

        stackingOrder(
          item,
          Math.min(
            0.89,
            begin + (finish - begin) * 0.65
          )
        );

        tween(
          item.card,
          "filter",
          item.startFilter,
          item.endFilter,
          begin,
          finish
        );
      }

      const fadeBegin = isArriving
        ? direction === 1
          ? 0.39
          : 0.64
        : isLeaving
          ? direction === 1
            ? 0.35
            : 0.15
          : begin;

      const fadeEnd = isArriving
        ? direction === 1
          ? 0.91
          : 0.99
        : isLeaving
          ? direction === 1
            ? 0.82
            : 0.7
          : finish;

      item.content.forEach((child, i) =>
        tween(
          child,
          "opacity",
          item.startOpacity[i],
          item.endOpacity[i],
          fadeBegin,
          fadeEnd
        )
      );

      if (mobileGlassDevice()) {
        tween(
          item.rearRaster,
          "opacity",
          item.startRasterOpacity,
          item.endRasterOpacity,
          fadeBegin,
          fadeEnd
        );

        if (
          isArriving &&
          item.card.dataset.glassPrepared === "1"
        ) {
          tween(
            item.glassPreview, "opacity",
            0, 1, fadeBegin, fadeEnd
          );
        }
      }

      if (isArriving) {
        tween(
          item.glass,
          "opacity",
          0,
          1,
          fadeBegin,
          fadeEnd
        );

        tween(
          item.surface,
          "opacity",
          1,
          0,
          fadeBegin,
          fadeEnd
        );
      } else if (isLeaving) {
        tween(
          item.glass,
          "opacity",
          1,
          0,
          fadeBegin,
          fadeEnd
        );

        tween(
          item.surface,
          "opacity",
          0,
          1,
          fadeBegin,
          fadeEnd
        );
      }
    }

    resetDrag();
    resetParallax();
    repaint.current();

    void Promise.all(
      animations.map((a) =>
        a.finished.catch(() => undefined)
      )
    ).then(() => finishTurn(animations));
  }

  // =======================================
  // POINTER CONTROLS
  // =======================================

  function onPointerDown(
    e: PointerEvent<HTMLDivElement>
  ) {
    if (
      e.pointerType === "mouse" &&
      e.button !== 0
    ) {
      return;
    }

    if ((e.target as HTMLElement).closest("a,button"))
      return;

    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };

    if (e.pointerType === "mouse") {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function applyDragFrame() {
    dragRaf.current = null;
    const deck = deckRef.current;
    if (
      !deck ||
      !dragStart.current ||
      busy.current ||
      !deck.classList.contains("dragging")
    ) return;

    const amount = latestDragAmount.current;
    deck.style.setProperty("--drag-x", `${amount}px`);
    deck.style.setProperty(
      "--drag-rotate",
      `${(-amount * 0.13).toFixed(2)}deg`
    );
    mouse.current = { x: amount / 250, y: -0.12 };
    deck.style.setProperty("--light-x", `${50 + amount * 0.28}%`);
    deck.style.setProperty("--light-y", "12%");
    repaint.current();
  }

  function onPointerMove(
    e: PointerEvent<HTMLDivElement>
  ) {
    const start = dragStart.current;

    if (start && start.pointerId === e.pointerId) {
      if (busy.current || pendingFrame.current !== null) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (
        Math.abs(dx) > 8 &&
        Math.abs(dx) > Math.abs(dy) * 1.15
      ) {
        const deck = e.currentTarget;

        if (!deck.classList.contains("dragging")) {
          resetParallax();
          deck.classList.add("dragging");
        }

        latestDragAmount.current =
          Math.max(-100, Math.min(100, dx));

        if (dragRaf.current === null) {
          dragRaf.current =
            requestAnimationFrame(applyDragFrame);
        }
      }

      return;
    }

    if (
      e.pointerType !== "mouse" ||
      busy.current ||
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
    ) {
      return;
    }

    const r = e.currentTarget.getBoundingClientRect();

    const x = Math.max(
      -0.5,
      Math.min(
        0.5,
        (e.clientX - r.left) / r.width - 0.5
      )
    );

    const y = Math.max(
      -0.5,
      Math.min(
        0.5,
        (e.clientY - r.top) / r.height - 0.5
      )
    );

    mouse.current = { x, y };

    if (raf.current !== null) return;

    raf.current = requestAnimationFrame(() => {
      raf.current = null;

      const deck = deckRef.current;
      if (!deck) return;

      const vars: Record<string, string> = {
        "--tilt-x": `${(-y * 6).toFixed(2)}deg`,
        "--tilt-y": `${(x * 7).toFixed(2)}deg`,
        "--rear-shift-x": `${(-x * 9).toFixed(2)}px`,
        "--rear-shift-y": `${(-y * 7).toFixed(2)}px`,
        "--rear-shift-x2": `${(-x * 6).toFixed(2)}px`,
        "--rear-shift-y2": `${(-y * 4).toFixed(2)}px`,
        "--rear-shift-x3": `${(-x * 3).toFixed(2)}px`,
        "--rear-shift-y3": `${(-y * 2).toFixed(2)}px`,
        "--light-x": `${((x + 0.5) * 100).toFixed(1)}%`,
        "--light-y": `${((y + 0.5) * 100).toFixed(1)}%`,
      };

      Object.entries(vars).forEach(([k, v]) =>
        deck.style.setProperty(k, v)
      );

      repaint.current();
    });
  }

  function onPointerUp(
    e: PointerEvent<HTMLDivElement>
  ) {
    if (dragRaf.current !== null &&
        dragStart.current?.pointerId === e.pointerId) {
      cancelAnimationFrame(dragRaf.current);
      applyDragFrame();
    }
    const start = dragStart.current;
    dragStart.current = null;

    if (
      !start ||
      start.pointerId !== e.pointerId
    ) {
      if (
        !busy.current &&
        pendingFrame.current === null
      ) {
        resetDrag();
      }

      return;
    }

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (
      Math.abs(dx) > 55 &&
      Math.abs(dx) > Math.abs(dy) * 1.15
    ) {
      ignoreClick.current = true;
      turn(dx < 0 ? 1 : -1);

      if (clickTimer.current)
        clearTimeout(clickTimer.current);

      clickTimer.current = setTimeout(() => {
        ignoreClick.current = false;
      }, 450);
    } else if (
      !busy.current &&
      pendingFrame.current === null
    ) {
      resetDrag();
      resetParallax();
    }
  }

  // =======================================
  // CONTACT FUNCTIONS
  // =======================================

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(profile.phone);

      setCopied(true);
      setNotice("Number copied to clipboard.");

      if (copyTimer.current)
        clearTimeout(copyTimer.current);

      copyTimer.current = setTimeout(() => {
        setCopied(false);
        setNotice("");
      }, 2000);
    } catch {
      setCopied(false);
      setNotice("Unable to copy number.");
    }
  }

  function saveContact() {
    window.location.assign("/contact.vcf");
  }

  const position = (i: number) =>
    [
      "front",
      "rear-one",
      "rear-two",
      "rear-three",
      "rear-four",
    ][(i - active + TOTAL) % TOTAL];

  // =======================================
  // FIVE CALLING CARDS
  // =======================================

  return (
    <main className="deck-page">
      <div
        ref={deckRef}
        className="deck-stage"
        role="region"
        aria-roledescription="carousel"
        aria-label="Digital calling cards. Swipe left for next card, right for previous card."
        tabIndex={0}
        style={
          {
            "--rear-blur-one": `${REAR_FOCUS.blur[0]}px`,
            "--rear-blur-two": `${REAR_FOCUS.blur[1]}px`,
            "--rear-blur-three": `${REAR_FOCUS.blur[2]}px`,
            "--rear-blur-four": `${REAR_FOCUS.blur[3]}px`,
            "--rear-content-opacity": REAR_FOCUS.opacity,
          } as CSSProperties
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStart.current = null;

          if (
            !busy.current &&
            pendingFrame.current === null
          ) {
            resetDrag();
            resetParallax();
          }
        }}
        onPointerLeave={() => {
          if (
            !dragStart.current &&
            !busy.current &&
            pendingFrame.current === null
          ) {
            resetParallax();
          }
        }}
        onClickCapture={(
          e: ReactMouseEvent<HTMLDivElement>
        ) => {
          if (ignoreClick.current) {
            e.preventDefault();
            e.stopPropagation();
            ignoreClick.current = false;
          }
        }}
        onKeyDown={(
          e: ReactKeyboardEvent<HTMLDivElement>
        ) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            turn(1);
          }

          if (e.key === "ArrowRight") {
            e.preventDefault();
            turn(-1);
          }
        }}
      >
        {Array.from({ length: TOTAL }, (_, i) => (
          <article
            key={i}
            data-card-index={i}
            className={`deck-card ${position(i)}${previewReady.current.has(i) ? " has-rear-preview" : ""}`}
            aria-hidden={i !== active}
            inert={i !== active}
            aria-label={`Card ${i + 1} of ${TOTAL}`}
          >
            <canvas
              className="card-liquid-canvas"
              aria-hidden="true"
            />

            <div
              className="card-surface"
              aria-hidden="true"
            />

            <canvas
              className="card-rear-raster"
              aria-hidden="true"
            />

            <canvas
              className="card-glass-preview"
              aria-hidden="true"
            />

            {(["tl", "tr", "br", "bl"] as const).map(
              (pos) => (
                <span
                  key={pos}
                  className={`glass-anchor ${pos}`}
                  aria-hidden="true"
                />
              )
            )}

            <header className="card-header">
              <span className="card-logo">
                {profile.studio}<b>.</b>
              </span>

              <span className="card-index">
                0{i + 1}
              </span>
            </header>

            <div className="card-body">
              {i === 0 && (
                <div className="hero-card">
                  <span className="eyebrow">
                    A LITTLE INTRODUCTION
                  </span>

                  <div className="initials">
                    {profile.initials}
                  </div>

                  <h1>
                    Nice to
                    <br />
                    <em>meet you.</em>
                  </h1>

                  <p className="lead">
                    I&apos;m{" "}
                    <strong>{profile.name}</strong>.
                    <br />
                    {profile.role}.
                  </p>

                  <p className="intro-copy">
                    {profile.intro}
                  </p>
                </div>
              )}

              {i === 1 && (
                <div className="text-card">
                  <span className="eyebrow">
                    A BIT ABOUT ME
                  </span>

                  <h2>
                    Ideas into
                    <br />
                    <em>something real.</em>
                  </h2>

                  <p>{profile.aboutTeaser}</p>

                  <div className="tag-row">
                    {profile.specialties.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>

                  <span className="minor">
                    BASED IN{" "}
                    {profile.location.toUpperCase()}
                  </span>

                  <a
                    className="about-cta"
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Discover my full portfolio
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              )}

              {i === 2 && (
                <div className="links-card social-card">
                  <span className="eyebrow">
                    FIND ME ONLINE
                  </span>

                  <h2>
                    Let&apos;s be
                    <br />
                    <em>social.</em>
                  </h2>

                  <div className="link-group">
                    <LinkRow
                      title="Behance"
                      caption="View my design portfolio"
                      href={profile.behance}
                      type="behance"
                      color="#1769FF"
                      background="rgba(23,105,255,.16)"
                    />

                    <LinkRow
                      title="Instagram"
                      caption="See what I'm creating"
                      href={profile.instagram}
                      type="instagram"
                      color="#FFFFFF"
                      background="linear-gradient(35deg,#F58529 0%,#DD2A7B 54%,#8134AF 100%)"
                    />

                    <LinkRow
                      title="Facebook"
                      caption="Connect with me"
                      href={profile.facebook}
                      type="facebook"
                      color="#1877F2"
                      background="rgba(24,119,242,.16)"
                    />

                    <LinkRow
                      title="LinkedIn"
                      caption="Let's connect professionally"
                      href={profile.linkedin}
                      type="linkedin"
                      color="#0A66C2"
                      background="rgba(10,102,194,.16)"
                    />
                  </div>
                </div>
              )}

              {i === 3 && (
                <div className="links-card">
                  <span className="eyebrow">
                    WORK &amp; COLLABORATION
                  </span>

                  <h2>
                    Have an
                    <br />
                    <em>idea?</em>
                  </h2>

                  <p className="links-description">
                    I&apos;d love to hear about it.
                  </p>

                  <div className="link-group">
                    <LinkRow
                      title="Gmail"
                      caption={profile.email}
                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(profile.email)}`}
                      type="gmail"
                      color="#EA4335"
                      background="rgba(234,67,53,.14)"
                    />

                    <LinkRow
                      title="Portfolio Website"
                      caption="Explore my portfolio"
                      href={profile.website}
                      type="globe"
                      color="#FA02AF"
                      background="rgba(250,2,175,.14)"
                    />
                  </div>
                </div>
              )}

              {i === 4 && (
                <div className="save-card">
                  <span className="eyebrow">
                    KEEP IN TOUCH
                  </span>

                  <h2>
                    Stay
                    <br />
                    <em>connected.</em>
                  </h2>

                  <div className="phone-box">
                    <small>PHONE NUMBER</small>

                    <a
                      href={`tel:${profile.phone.replace(
                        /[^+\d]/g,
                        ""
                      )}`}
                    >
                      {profile.phone}
                    </a>
                  </div>

                  <div className="contact-actions">
                    <button
                      type="button"
                      className="primary-action contact-button"
                      onClick={saveContact}
                    >
                      <span
                        className="contact-button-icon"
                        aria-hidden="true"
                      >
                        ↓
                      </span>
                      <span>Save Contact</span>
                    </button>

                    <button
                      type="button"
                      className="secondary-action contact-button"
                      onClick={copyPhone}
                    >
                      <span
                        className="contact-button-icon"
                        aria-hidden="true"
                      >
                        {copied ? "✓" : "▢"}
                      </span>

                      <span>
                        {copied ? "Copied" : "Copy Number"}
                      </span>
                    </button>
                  </div>

                  <p
                    className="feedback"
                    role="status"
                    aria-live="polite"
                  >
                    {notice ||
                      "Save my contact details and message me."}
                  </p>
                </div>
              )}
            </div>

            <footer className="card-footer">
              <span className="rule">
                <i />
                <i />
                <i />
              </span>

              <span className="gesture-hint">
                {i + 1} / {TOTAL}
                &nbsp; · &nbsp; SWIPE / DRAG
                <span aria-hidden="true">↔</span>
              </span>
            </footer>
          </article>
        ))}
      </div>
    </main>
  );
}
