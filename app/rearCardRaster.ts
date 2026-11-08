
/**
 * BOLIMGFX — Pre-rendered rear-card blur
 *
 * Blur is calculated once per card/depth.
 * No pixel blur calculation runs mid-swipe.
 */

const LEVELS = [0, 1.5, 2, 3.5, 4];

function roundedRect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
}

function blurPixels(
  image: ImageData,
  width: number,
  height: number,
  radius: number
) {
  const input = image.data;

  const horizontal =
    new Uint8ClampedArray(input.length);

  const out = image.data;
  const diameter = radius * 2 + 1;

  const clampX = (x: number) =>
    Math.max(0, Math.min(width - 1, x));

  const clampY = (y: number) =>
    Math.max(0, Math.min(height - 1, y));

  // Horizontal blur

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    const sums = [0, 0, 0, 0];

    for (
      let k = -radius;
      k <= radius;
      k++
    ) {
      const p =
        row + clampX(k) * 4;

      for (let c = 0; c < 4; c++) {
        sums[c] += input[p + c];
      }
    }

    for (let x = 0; x < width; x++) {
      const p = row + x * 4;

      for (let c = 0; c < 4; c++) {
        horizontal[p + c] =
          sums[c] / diameter;
      }

      const remove =
        row + clampX(x - radius) * 4;

      const add =
        row +
        clampX(x + radius + 1) * 4;

      for (let c = 0; c < 4; c++) {
        sums[c] +=
          input[add + c] -
          input[remove + c];
      }
    }
  }

  // Vertical blur

  for (let x = 0; x < width; x++) {
    const sums = [0, 0, 0, 0];

    for (
      let k = -radius;
      k <= radius;
      k++
    ) {
      const p =
        (
          clampY(k) * width + x
        ) * 4;

      for (let c = 0; c < 4; c++) {
        sums[c] += horizontal[p + c];
      }
    }

    for (let y = 0; y < height; y++) {
      const p =
        (y * width + x) * 4;

      for (let c = 0; c < 4; c++) {
        out[p + c] =
          sums[c] / diameter;
      }

      const remove =
        (
          clampY(y - radius) *
          width + x
        ) * 4;

      const add =
        (
          clampY(y + radius + 1) *
          width + x
        ) * 4;

      for (let c = 0; c < 4; c++) {
        sums[c] +=
          horizontal[add + c] -
          horizontal[remove + c];
      }
    }
  }
}

export function createRearRaster(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  depth: number
): HTMLCanvasElement {

  // Lower-resolution background texture
  // helps reduce memory usage on mobile.

  const scale = Math.min(
    1,
    330 / width,
    460 / height
  );

  const w = Math.max(
    2,
    Math.round(width * scale)
  );

  const h = Math.max(
    2,
    Math.round(height * scale)
  );

  const canvas =
    document.createElement("canvas");

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext(
    "2d",
    { willReadFrequently: true }
  );

  if (!ctx) return canvas;

  // Render material and content together.

  const radius = 26 * scale;

  roundedRect(
    ctx,
    w,
    h,
    radius
  );

  ctx.save();
  ctx.clip();

  const gradient =
    ctx.createLinearGradient(
      0, 0, w, h
    );

  gradient.addColorStop(
    0,
    "#171923"
  );

  gradient.addColorStop(
    0.48,
    "#11131d"
  );

  gradient.addColorStop(
    1,
    "#0e1018"
  );

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Match desktop rear-content opacity.

  ctx.globalAlpha = 0.26;
  ctx.drawImage(source, 0, 0, w, h);
  ctx.globalAlpha = 1;

  ctx.restore();

  ctx.strokeStyle =
    "rgba(220,226,255,0.16)";

  ctx.lineWidth = Math.max(
    0.8,
    scale
  );

  roundedRect(
    ctx,
    w,
    h,
    radius
  );

  ctx.stroke();

  // Bake progressive blur into pixels.

  const pxRadius = Math.max(
    1,
    Math.round(
      (LEVELS[depth] ?? 2) * scale
    )
  );

  try {
    const pixels = ctx.getImageData(
      0, 0, w, h
    );

    blurPixels(
      pixels,
      w,
      h,
      pxRadius
    );

    ctx.putImageData(
      pixels,
      0,
      0
    );
  } catch (error) {
    console.warn(
      "Rear raster blur unavailable:",
      error
    );
  }

  return canvas;
}
