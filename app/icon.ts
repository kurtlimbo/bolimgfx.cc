
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const size = {
  width: 256,
  height: 256,
};

export const contentType = "image/png";

export default async function Icon() {
  const logoPath = path.join(
    process.cwd(),
    "public",
    "bolim.svg"
  );

  const logo = await readFile(logoPath);

  // Circular alpha mask
  const circleMask = Buffer.from(`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="256"
      height="256"
      viewBox="0 0 256 256"
    >
      <circle
        cx="128"
        cy="128"
        r="127"
        fill="white"
      />
    </svg>
  `);

  const png = await sharp(logo)
    .resize(256, 256, {
      fit: "cover",
    })
    .composite([
      {
        input: circleMask,
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
    },
  });
}
