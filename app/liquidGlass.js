
const PAD_X = 340;
const PAD_Y = 220;

const PROFILE_SAMPLES = 512;
const MAX_LUT_DISPLACEMENT = 240;
const BASE_THICKNESS = 150;
const BASE_REFRACTIVE_INDEX = 1.5;
const SOURCE_OPACITY = 0.42;

const profileCache = new Map();
const gaussianCache = new WeakMap();

// ==========================================
// WEBGL SHADERS
// ==========================================

const VERTEX = `
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(
    a_uv * 2.0 - 1.0,
    0.0,
    1.0
  );
}
`;

const FRAGMENT = `
precision highp float;

varying vec2 v_uv;

uniform sampler2D u_scene;
uniform sampler2D u_cardTexture;
uniform sampler2D u_profile;

uniform float u_useCard;

uniform vec2 u_stage;
uniform vec2 u_padding;
uniform vec2 u_card;

uniform mat3 u_frontH;
uniform mat3 u_rearInvH;

uniform float u_radius;
uniform float u_bezelPx;
uniform float u_strength;
uniform float u_chroma;
uniform float u_specular;

uniform vec2 u_light;

// ==========================================
// ROUNDED RECTANGLE SDF
// ==========================================

float roundedSdf(vec2 p) {
  vec2 q = abs(p) -
    (u_card * 0.5 - vec2(u_radius));

  return length(max(q, 0.0)) +
    min(max(q.x, q.y), 0.0) -
    u_radius;
}

// ==========================================
// CONTINUOUS PERIMETER NORMAL
// ==========================================

vec2 surfaceNormal(vec2 p) {
  vec2 q = abs(p) -
    (u_card * 0.5 - vec2(u_radius));

  vec2 outer = max(q, 0.0);
  float len = length(outer);

  if (len > 0.0001) {
    return sign(p) * outer / len;
  }

  if (q.x > q.y) {
    return vec2(
      p.x >= 0.0 ? 1.0 : -1.0,
      0.0
    );
  }

  return vec2(
    0.0,
    p.y >= 0.0 ? 1.0 : -1.0
  );
}

// ==========================================
// SIGNED SNELL DISPLACEMENT
// ==========================================

float displacementAt(float x) {
  vec2 rg = texture2D(
    u_profile,
    vec2(clamp(x, 0.0, 1.0), 0.5)
  ).rg;

  float encoded = (
    rg.r * 65280.0 +
    rg.g * 255.0
  ) / 65535.0;

  return (
    encoded * 2.0 - 1.0
  ) * 240.0 * u_strength;
}

// ==========================================
// PERSPECTIVE PROJECTION
// ==========================================

vec2 frontToStage(vec2 local) {
  vec3 h = u_frontH * vec3(
    local / u_card,
    1.0
  );

  float z = abs(h.z) > 0.00001
    ? h.z
    : 0.00001;

  return h.xy / z;
}

// ==========================================
// SCENE BACKGROUND
// ==========================================

vec3 backdropColor(vec2 pixel) {
  float radius = max(
    u_stage.x,
    u_stage.y
  ) * 0.85;

  float t = clamp(
    length(
      pixel -
      u_stage * vec2(0.5, 0.45)
    ) / max(radius, 1.0),
    0.0,
    1.0
  );

  vec3 a = vec3(25.0, 27.0, 39.0) / 255.0;
  vec3 b = vec3(9.0, 11.0, 19.0) / 255.0;
  vec3 c = vec3(2.0, 2.0, 3.0) / 255.0;

  return t < 0.62
    ? mix(a, b, t / 0.62)
    : mix(b, c, (t - 0.62) / 0.38);
}

// ==========================================
// SAMPLE ONLY THE IMMEDIATE NEXT CARD
// ==========================================

vec3 readBackdrop(vec2 stagePixel) {
  if (u_useCard > 0.5) {
    vec3 h = u_rearInvH * vec3(
      stagePixel,
      1.0
    );

    float w = abs(h.z) > 0.00001
      ? h.z
      : 0.00001;

    vec2 uv = h.xy / w;

    vec3 base = backdropColor(stagePixel);

    if (
      uv.x < 0.0 ||
      uv.x > 1.0 ||
      uv.y < 0.0 ||
      uv.y > 1.0
    ) {
      return base;
    }

    vec4 source = texture2D(
      u_cardTexture,
      vec2(uv.x, 1.0 - uv.y)
    );

    return mix(
      base,
      source.rgb,
      clamp(
        source.a * 0.42,
        0.0,
        1.0
      )
    );
  }

  vec2 full =
    u_stage + 2.0 * u_padding;

  vec2 uv = vec2(
    (stagePixel.x + u_padding.x) / full.x,
    1.0 -
    (stagePixel.y + u_padding.y) / full.y
  );

  return texture2D(
    u_scene,
    clamp(
      uv,
      vec2(0.0008),
      vec2(0.9992)
    )
  ).rgb;
}

// Blur is now performed on the source texture
// BEFORE refraction, not through offset samples.

vec3 sampleBackdrop(vec2 local) {
  return readBackdrop(
    frontToStage(local)
  );
}

// ==========================================
// MAIN GLASS
// ==========================================

void main() {
  vec2 local = vec2(
    v_uv.x,
    1.0 - v_uv.y
  ) * u_card;

  vec2 p = local - u_card * 0.5;

  float inside = max(
    0.0,
    -roundedSdf(p)
  );

  vec2 normal = surfaceNormal(p);

  float profileX = clamp(
    inside / u_bezelPx,
    0.0,
    1.0
  );

  float shift = displacementAt(profileX);

  vec2 bent =
    local - normal * shift;

  // ========================================
  // CHROMATIC DISPERSION
  // ========================================

  float dispersion =
    u_chroma *
    1.1 *
    exp(
      -inside /
      max(u_bezelPx * 0.28, 1.0)
    );

  vec3 rgb = vec3(
    sampleBackdrop(
      bent + normal * dispersion
    ).r,

    sampleBackdrop(bent).g,

    sampleBackdrop(
      bent - normal * dispersion
    ).b
  );

  // ========================================
  // SUBTLE INTERIOR TINT
  // ========================================

  float interior = smoothstep(
    3.0,
    max(u_bezelPx, 4.0),
    inside
  );

  rgb = mix(
    rgb,
    vec3(0.055, 0.066, 0.09),
    0.045 * interior
  );

  // ========================================
  // DIRECTIONAL SPECULAR HIGHLIGHT
  // ========================================

  vec2 lightDir = normalize(
    (u_light - vec2(0.5)) * 2.0 +
    vec2(-0.35, -0.85)
  );

  float facing = pow(
    max(dot(normal, lightDir), 0.0),
    1.8
  );

  float hairline = exp(
    -pow(
      (inside - 0.9) / 1.35,
      2.0
    )
  );

  rgb +=
    vec3(0.90, 0.94, 1.0) *
    u_specular *
    facing *
    hairline *
    0.16;

  gl_FragColor = vec4(
    clamp(rgb, 0.0, 1.0),
    1.0
  );
}
`;

// ==========================================
// COMMON HELPERS
// ==========================================

const clamp = (x, lo, hi) =>
  Math.max(lo, Math.min(hi, x));

// ==========================================
// KUBE SURFACE PROFILES
// ==========================================

function surfaceHeight(x, type) {
  const t = clamp(x, 0, 1);

  const squircle = Math.pow(
    Math.max(
      0,
      1 - Math.pow(1 - t, 4)
    ),
    0.25
  );

  const circle = Math.sqrt(
    Math.max(
      0,
      1 - Math.pow(1 - t, 2)
    )
  );

  if (type === "convex-circle") {
    return circle;
  }

  if (type === "concave") {
    return 1 - squircle;
  }

  if (type === "lip") {
    // Kube's Lip profile:
    // mix(Convex, Concave, Smootherstep)

    const smoother =
      t * t * t *
      (t * (t * 6 - 15) + 10);

    return (
      squircle * (1 - smoother) +
      (1 - squircle) * smoother
    );
  }

  return squircle;
}

// ==========================================
// SNELL'S LAW LOOKUP TABLE
// ==========================================

function makeProfile(
  bezelPx,
  thickness,
  refractiveIndex,
  curvature,
  surface
) {
  const key = [
    bezelPx.toFixed(3),
    thickness.toFixed(2),
    refractiveIndex.toFixed(3),
    curvature.toFixed(2),
    surface,
  ].join(":");

  if (profileCache.has(key)) {
    return profileCache.get(key);
  }

  const encoded =
    new Uint8Array(PROFILE_SAMPLES * 4);

  const values =
    new Float32Array(PROFILE_SAMPLES);

  const eta = 1 / refractiveIndex;

  const focus = clamp(
    curvature / 8,
    0.5,
    1.8
  );

  for (
    let i = 0;
    i < PROFILE_SAMPLES;
    i++
  ) {
    const t = i / (PROFILE_SAMPLES - 1);

    const x = clamp(
      Math.pow(t, focus),
      0.00002,
      0.99999
    );

    const y = surfaceHeight(x, surface);

    const dx = Math.min(
      0.0001,
      (1 - x) * 0.5
    );

    const slope = (
      surfaceHeight(x + dx, surface) - y
    ) / dx;

    const length = Math.hypot(slope, 1);

    const nx = -slope / length;
    const ny = -1 / length;

    const k = Math.max(
      0,
      1 - eta * eta * (1 - ny * ny)
    );

    const term =
      eta * ny + Math.sqrt(k);

    const rx = -term * nx;
    const ry = eta - term * ny;

    const unsigned =
      Math.abs(ry) > 0.000001
        ? Math.abs(
            rx *
            (y * bezelPx + thickness) /
            ry
          )
        : 0;

    // Keep inward convex refraction positive.
    // Allow outward refraction for concave areas.

    const signed =
      Math.sign(slope) *
      clamp(
        unsigned,
        0,
        MAX_LUT_DISPLACEMENT
      );

    values[i] = signed;

    const integer = Math.round(
      (
        signed / MAX_LUT_DISPLACEMENT *
        0.5 + 0.5
      ) * 65535
    );

    encoded[i * 4] = integer >>> 8;
    encoded[i * 4 + 1] = integer & 255;
    encoded[i * 4 + 2] = 0;
    encoded[i * 4 + 3] = 255;
  }

  const profile = {
    encoded,
    values,
    bezelPx,
  };

  profileCache.set(key, profile);

  if (profileCache.size > 32) {
    profileCache.delete(
      profileCache.keys().next().value
    );
  }

  return profile;
}

// ==========================================
// GENUINE BACKDROP GAUSSIAN BLUR
// ==========================================


// V3.9 — Mobile Safari compatible blur.

function isMobileTouch() {
  return typeof window !== "undefined" &&
    window.matchMedia(
      "(max-width: 600px) and (pointer: coarse)"
    ).matches;
}

function isIOSWebKit() {
  return typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/.test(navigator.userAgent);
}

// Separable two-pass box blur.
// Cached per snapshot to avoid repeated work.

function boxBlurSource(
  ctx,
  width,
  height,
  sigma
) {
  const radius = Math.max(
    1,
    Math.min(
      24,
      Math.ceil(sigma * 1.7)
    )
  );

  const windowSize = radius * 2 + 1;

  const image = ctx.getImageData(
    0,
    0,
    width,
    height
  );

  const src = image.data;

  const horizontal =
    new Uint8ClampedArray(src.length);

  const dst = image.data;

  // Horizontal pass

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    const sum = [0, 0, 0, 0];

    for (
      let k = -radius;
      k <= radius;
      k++
    ) {
      const p =
        row +
        Math.max(
          0,
          Math.min(width - 1, k)
        ) * 4;

      for (let c = 0; c < 4; c++) {
        sum[c] += src[p + c];
      }
    }

    for (let x = 0; x < width; x++) {
      const p = row + x * 4;

      for (let c = 0; c < 4; c++) {
        horizontal[p + c] =
          sum[c] / windowSize;
      }

      const remove =
        row +
        Math.max(0, x - radius) * 4;

      const add =
        row +
        Math.min(
          width - 1,
          x + radius + 1
        ) * 4;

      for (let c = 0; c < 4; c++) {
        sum[c] +=
          src[add + c] -
          src[remove + c];
      }
    }
  }

  // Vertical pass

  for (let x = 0; x < width; x++) {
    const sum = [0, 0, 0, 0];

    for (
      let k = -radius;
      k <= radius;
      k++
    ) {
      const p =
        (
          Math.max(
            0,
            Math.min(height - 1, k)
          ) * width + x
        ) * 4;

      for (let c = 0; c < 4; c++) {
        sum[c] += horizontal[p + c];
      }
    }

    for (let y = 0; y < height; y++) {
      const p = (y * width + x) * 4;

      for (let c = 0; c < 4; c++) {
        dst[p + c] =
          sum[c] / windowSize;
      }

      const remove =
        (
          Math.max(0, y - radius) *
          width + x
        ) * 4;

      const add =
        (
          Math.min(
            height - 1,
            y + radius + 1
          ) * width + x
        ) * 4;

      for (let c = 0; c < 4; c++) {
        sum[c] +=
          horizontal[add + c] -
          horizontal[remove + c];
      }
    }
  }

  ctx.putImageData(image, 0, 0);
}

function gaussianSource(
  source,
  sigmaPixels,
  allowCache = true
) {
  if (
    !source ||
    sigmaPixels <= 0.01
  ) {
    return source;
  }

  const sigma = clamp(
    sigmaPixels,
    0.01,
    30
  );

  const key = sigma.toFixed(3);

  if (allowCache) {
    const cached =
      gaussianCache.get(source);

    if (
      cached &&
      cached.key === key &&
      cached.width === source.width &&
      cached.height === source.height
    ) {
      return cached.canvas;
    }
  }

  const canvas =
    document.createElement("canvas");

  canvas.width = source.width;
  canvas.height = source.height;

  const ctx = canvas.getContext(
    "2d",
    { willReadFrequently: true }
  );

  if (!ctx) return source;

  const nativeBlur =
    !isIOSWebKit() &&
    typeof ctx.filter === "string";

  try {
    if (nativeBlur) {
      ctx.filter = `blur(${sigma}px)`;

      ctx.drawImage(
        source,
        0,
        0
      );

      ctx.filter = "none";
    } else {
      ctx.drawImage(
        source,
        0,
        0
      );

      if (
        canvas.width > 1 &&
        canvas.height > 1
      ) {
        boxBlurSource(
          ctx,
          canvas.width,
          canvas.height,
          sigma
        );
      }
    }
  } catch (error) {
    console.warn(
      "Glass blur fallback:",
      error
    );

    ctx.filter = "none";

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.drawImage(
      source,
      0,
      0
    );
  }

  if (allowCache) {
    gaussianCache.set(source, {
      key,
      width: source.width,
      height: source.height,
      canvas,
    });
  }

  return canvas;
}

// ==========================================
// OPTICAL SETTINGS
// ==========================================

function opticsFor(opt) {
  const cardW = Math.max(
    1,
    opt.cardW || 392
  );

  const cardH = Math.max(
    1,
    opt.cardH || 540
  );

  const requestedSurface =
    opt.surface ?? "convex-squircle";

  const allowed = [
    "convex-squircle",
    "convex-circle",
    "concave",
    "lip",
  ];

  const surface = allowed.includes(
    requestedSurface
  )
    ? requestedSurface
    : "convex-squircle";

  return {
    surface,

    bezelPx: clamp(
      Number(
        opt.bezelWidth ??
        ((Number(opt.bezel) || 3) * 13)
      ),
      8,
      Math.min(cardW, cardH) * 0.45
    ),

    thickness: clamp(
      Number(opt.thickness ?? BASE_THICKNESS),
      20,
      240
    ),

    refractiveIndex: clamp(
      Number(
        opt.refractiveIndex ??
        BASE_REFRACTIVE_INDEX
      ),
      1.01,
      2.4
    ),

    curvature: clamp(
      Number(opt.curvature ?? 8),
      4,
      12
    ),

    strength: clamp(
      (Number(opt.refraction ?? 60) / 60) *
      0.48 *
      (Number(opt.refractionScale ?? 1.5) / 1.5),
      0,
      1.5
    ),

    chroma: clamp(
      Number(opt.chroma ?? 0),
      0,
      5
    ),

    blur: clamp(
      Number(opt.blur ?? 0),
      0,
      10
    ),

    specular: clamp(
      Number(opt.specular ?? 0.5),
      0,
      2
    ),
  };
}

// ==========================================
// PERSPECTIVE HOMOGRAPHY
// ==========================================

function quadMatrix(quad) {
  if (!quad || quad.length !== 4) {
    return null;
  }

  const [p0, p1, p2, p3] = quad;

  const dx1 = p1[0] - p2[0];
  const dy1 = p1[1] - p2[1];

  const dx2 = p3[0] - p2[0];
  const dy2 = p3[1] - p2[1];

  const dx3 =
    p0[0] - p1[0] +
    p2[0] - p3[0];

  const dy3 =
    p0[1] - p1[1] +
    p2[1] - p3[1];

  const det =
    dx1 * dy2 - dx2 * dy1;

  let g = 0;
  let h = 0;

  if (Math.abs(det) > 0.000001) {
    g =
      (dx3 * dy2 - dx2 * dy3) /
      det;

    h =
      (dx1 * dy3 - dx3 * dy1) /
      det;
  }

  const a =
    p1[0] - p0[0] + g * p1[0];

  const b =
    p3[0] - p0[0] + h * p3[0];

  const c = p0[0];

  const d =
    p1[1] - p0[1] + g * p1[1];

  const e =
    p3[1] - p0[1] + h * p3[1];

  const f = p0[1];

  return new Float32Array([
    a, d, g,
    b, e, h,
    c, f, 1,
  ]);
}

function invertMatrix3(m) {
  if (!m) return null;

  const [
    a, d, g,
    b, e, h,
    c, f, i,
  ] = m;

  const det =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);

  if (Math.abs(det) < 0.0000001) {
    return null;
  }

  const x = 1 / det;

  return new Float32Array([
    (e * i - f * h) * x,
    (f * g - d * i) * x,
    (d * h - e * g) * x,

    (c * h - b * i) * x,
    (a * i - c * g) * x,
    (b * g - a * h) * x,

    (b * f - c * e) * x,
    (c * d - a * f) * x,
    (a * e - b * d) * x,
  ]);
}

// ==========================================
// WEBGL SHADER COMPILATION
// ==========================================

function compile(gl, type, source) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error(
      "Cannot allocate WebGL shader"
    );
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (
    !gl.getShaderParameter(
      shader,
      gl.COMPILE_STATUS
    )
  ) {
    const error =
      gl.getShaderInfoLog(shader) ||
      "Shader compilation failed";

    gl.deleteShader(shader);
    throw new Error(error);
  }

  return shader;
}

// ==========================================
// WEBGL RENDERER
// ==========================================

function createWebGLRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) return null;

  const vs = compile(
    gl,
    gl.VERTEX_SHADER,
    VERTEX
  );

  const fs = compile(
    gl,
    gl.FRAGMENT_SHADER,
    FRAGMENT
  );

  const program = gl.createProgram();

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (
    !gl.getProgramParameter(
      program,
      gl.LINK_STATUS
    )
  ) {
    throw new Error(
      gl.getProgramInfoLog(program) ||
      "WebGL program linking failed"
    );
  }

  const buffer = gl.createBuffer();

  gl.bindBuffer(
    gl.ARRAY_BUFFER,
    buffer
  );

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]),
    gl.STATIC_DRAW
  );

  const attr = gl.getAttribLocation(
    program,
    "a_uv"
  );

  gl.enableVertexAttribArray(attr);

  gl.vertexAttribPointer(
    attr,
    2,
    gl.FLOAT,
    false,
    0,
    0
  );

  function createTexture(unit) {
    const texture = gl.createTexture();

    gl.activeTexture(
      gl.TEXTURE0 + unit
    );

    gl.bindTexture(
      gl.TEXTURE_2D,
      texture
    );

    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR
    );

    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      gl.LINEAR
    );

    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      gl.CLAMP_TO_EDGE
    );

    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      gl.CLAMP_TO_EDGE
    );

    return texture;
  }

  const sceneTexture = createTexture(0);
  const nextTexture = createTexture(1);
  const profileTexture = createTexture(2);

  gl.pixelStorei(
    gl.UNPACK_FLIP_Y_WEBGL,
    true
  );

  gl.pixelStorei(
    gl.UNPACK_ALIGNMENT,
    1
  );

  gl.useProgram(program);

  const loc = (name) =>
    gl.getUniformLocation(
      program,
      name
    );

  const U = {
    scene: loc("u_scene"),
    cardTexture: loc("u_cardTexture"),
    profile: loc("u_profile"),

    useCard: loc("u_useCard"),

    stage: loc("u_stage"),
    padding: loc("u_padding"),
    card: loc("u_card"),

    frontH: loc("u_frontH"),
    rearInvH: loc("u_rearInvH"),

    radius: loc("u_radius"),
    bezelPx: loc("u_bezelPx"),
    strength: loc("u_strength"),

    chroma: loc("u_chroma"),
    specular: loc("u_specular"),
    light: loc("u_light"),
  };

  gl.uniform1i(U.scene, 0);
  gl.uniform1i(U.cardTexture, 1);
  gl.uniform1i(U.profile, 2);

  let lastProfile = null;
  let lastSource = null;

  return {
    render(scene, opt) {
      const settings = opticsFor(opt);

      const frontH = quadMatrix(opt.quad);
      const rearH = quadMatrix(opt.sourceQuad);
      const rearInvH = invertMatrix3(rearH);

      if (!frontH) return;

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        isMobileTouch() ? 1.15 : 1.5
      );

      const width = Math.max(
        1,
        Math.round(opt.cardW * dpr)
      );

      const height = Math.max(
        1,
        Math.round(opt.cardH * dpr)
      );

      if (
        canvas.width !== width ||
        canvas.height !== height
      ) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
      gl.useProgram(program);

      gl.activeTexture(gl.TEXTURE0);

      gl.bindTexture(
        gl.TEXTURE_2D,
        sceneTexture
      );

      gl.pixelStorei(
        gl.UNPACK_FLIP_Y_WEBGL,
        true
      );

      const sceneInput =
        settings.blur > 0 && !opt.sourceImage && !isIOSWebKit()
          ? gaussianSource(
              scene,
              settings.blur *
              (
                scene.width /
                (opt.stageW + 2 * PAD_X)
              ),
              false
            )
          : scene;

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        sceneInput
      );

      // ====================================
      // CACHED BLURRED REAR CARD
      // ====================================

      const snapshot = opt.sourceImage;

      const useCard = Boolean(
        snapshot?.width &&
        snapshot?.height &&
        rearInvH
      );

      const sourceInput =
        useCard && settings.blur > 0
          ? gaussianSource(
              snapshot,
              settings.blur *
              (
                snapshot.width /
                Math.max(opt.cardW, 1)
              )
            )
          : snapshot;

      if (
        useCard &&
        sourceInput !== lastSource
      ) {
        gl.activeTexture(gl.TEXTURE1);

        gl.bindTexture(
          gl.TEXTURE_2D,
          nextTexture
        );

        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          sourceInput
        );

        lastSource = sourceInput;
      }

      // ====================================
      // CACHED OPTICAL PROFILE
      // ====================================

      const profile = makeProfile(
        settings.bezelPx,
        settings.thickness,
        settings.refractiveIndex,
        settings.curvature,
        settings.surface
      );

      if (profile !== lastProfile) {
        gl.activeTexture(gl.TEXTURE2);

        gl.bindTexture(
          gl.TEXTURE_2D,
          profileTexture
        );

        gl.pixelStorei(
          gl.UNPACK_FLIP_Y_WEBGL,
          false
        );

        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          PROFILE_SAMPLES,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          profile.encoded
        );

        gl.pixelStorei(
          gl.UNPACK_FLIP_Y_WEBGL,
          true
        );

        lastProfile = profile;
      }

      // ====================================
      // UNIFORMS
      // ====================================

      gl.uniform1f(
        U.useCard,
        useCard ? 1 : 0
      );

      gl.uniform2f(
        U.stage,
        opt.stageW,
        opt.stageH
      );

      gl.uniform2f(
        U.padding,
        PAD_X,
        PAD_Y
      );

      gl.uniform2f(
        U.card,
        opt.cardW,
        opt.cardH
      );

      gl.uniformMatrix3fv(
        U.frontH,
        false,
        frontH
      );

      gl.uniformMatrix3fv(
        U.rearInvH,
        false,
        rearInvH ||
          new Float32Array([
            1, 0, 0,
            0, 1, 0,
            0, 0, 1,
          ])
      );

      gl.uniform1f(U.radius, opt.radius);

      gl.uniform1f(
        U.bezelPx,
        settings.bezelPx
      );

      gl.uniform1f(
        U.strength,
        settings.strength
      );

      gl.uniform1f(
        U.chroma,
        settings.chroma
      );

      gl.uniform1f(
        U.specular,
        settings.specular
      );

      gl.uniform2f(
        U.light,
        opt.lightX ?? 0.5,
        opt.lightY ?? 0.5
      );

      gl.drawArrays(
        gl.TRIANGLES,
        0,
        6
      );
    },

    destroy() {
      gl.deleteTexture(sceneTexture);
      gl.deleteTexture(nextTexture);
      gl.deleteTexture(profileTexture);

      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}

// ==========================================
// CANVAS FALLBACK
// ==========================================

function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!ctx) {
    return {
      render() {},
      destroy() {},
    };
  }

  return {
    render(scene, opt) {
      const settings = opticsFor(opt);

      const frontH = quadMatrix(opt.quad);

      if (!frontH) return;

      const rearInvH = invertMatrix3(
        quadMatrix(opt.sourceQuad)
      );

      const snapshot = opt.sourceImage;

      const useCard = Boolean(
        snapshot?.width &&
        rearInvH
      );

      const sourceInput =
        useCard && settings.blur > 0
          ? gaussianSource(
              snapshot,
              settings.blur *
              (
                snapshot.width /
                Math.max(opt.cardW, 1)
              )
            )
          : snapshot;

      const rearCtx = useCard
        ? sourceInput.getContext("2d", {
            willReadFrequently: true,
          })
        : null;

      const rearData = rearCtx
        ? rearCtx.getImageData(
            0,
            0,
            sourceInput.width,
            sourceInput.height
          )
        : null;

      const sceneInput =
        settings.blur > 0 && !useCard && !isIOSWebKit()
          ? gaussianSource(
              scene,
              settings.blur *
              (
                scene.width /
                (opt.stageW + 2 * PAD_X)
              ),
              false
            )
          : scene;

      const sceneCtx = sceneInput.getContext(
        "2d",
        { willReadFrequently: true }
      );

      const sceneData = sceneCtx
        ? sceneCtx.getImageData(
            0,
            0,
            sceneInput.width,
            sceneInput.height
          )
        : null;

      const width = Math.max(
        1,
        Math.round(opt.cardW * 0.65)
      );

      const height = Math.max(
        1,
        Math.round(opt.cardH * 0.65)
      );

      if (
        canvas.width !== width ||
        canvas.height !== height
      ) {
        canvas.width = width;
        canvas.height = height;
      }

      const output =
        ctx.createImageData(width, height);

      const profile = makeProfile(
        settings.bezelPx,
        settings.thickness,
        settings.refractiveIndex,
        settings.curvature,
        settings.surface
      );

      // ====================================
      // TRANSFORM HELPER
      // ====================================

      function apply(m, x, y) {
        const z =
          m[2] * x +
          m[5] * y +
          m[8];

        if (Math.abs(z) < 0.000001) {
          return [999999, 999999];
        }

        return [
          (
            m[0] * x +
            m[3] * y +
            m[6]
          ) / z,

          (
            m[1] * x +
            m[4] * y +
            m[7]
          ) / z,
        ];
      }

      function readImage(
        image,
        x,
        y,
        channel
      ) {
        if (!image) return 0;

        const xi = clamp(
          Math.round(x),
          0,
          image.width - 1
        );

        const yi = clamp(
          Math.round(y),
          0,
          image.height - 1
        );

        return image.data[
          (yi * image.width + xi) * 4 +
          channel
        ] / 255;
      }

      // ====================================
      // COMPOSITE NEXT-CARD COLOR
      // ====================================

      function sceneColor(x, y, channel) {
        if (useCard && rearData) {
          const radius = Math.max(
            opt.stageW,
            opt.stageH
          ) * 0.85;

          const t = clamp(
            Math.hypot(
              x - opt.stageW * 0.5,
              y - opt.stageH * 0.45
            ) / radius,
            0,
            1
          );

          const a = [
            25, 27, 39
          ][channel] / 255;

          const b = [
            9, 11, 19
          ][channel] / 255;

          const c = [
            2, 2, 3
          ][channel] / 255;

          const base =
            t < 0.62
              ? a + (b - a) * (t / 0.62)
              : b + (c - b) *
                  ((t - 0.62) / 0.38);

          const [rx, ry] = apply(
            rearInvH,
            x,
            y
          );

          if (
            rx < 0 ||
            ry < 0 ||
            rx > 1 ||
            ry > 1
          ) {
            return base;
          }

          const px = rx * rearData.width;
          const py = ry * rearData.height;

          const alpha =
            readImage(
              rearData,
              px,
              py,
              3
            ) * SOURCE_OPACITY;

          return (
            base * (1 - alpha) +
            readImage(
              rearData,
              px,
              py,
              channel
            ) * alpha
          );
        }

        if (!sceneData) return 0.05;

        return readImage(
          sceneData,

          (x + PAD_X) *
            sceneData.width /
            (opt.stageW + 2 * PAD_X),

          (y + PAD_Y) *
            sceneData.height /
            (opt.stageH + 2 * PAD_Y),

          channel
        );
      }

      // ====================================
      // REFRACTED COLOR
      // ====================================

      function refracted(
        x,
        y,
        channel,
        normalX,
        normalY,
        shift
      ) {
        const [sx, sy] = apply(
          frontH,

          (x - normalX * shift) /
            opt.cardW,

          (y - normalY * shift) /
            opt.cardH
        );

        return sceneColor(
          sx,
          sy,
          channel
        );
      }

      // ====================================
      // RENDER PIXELS
      // ====================================

      for (
        let y = 0;
        y < height;
        y++
      ) {
        for (
          let x = 0;
          x < width;
          x++
        ) {
          const lx =
            (x + 0.5) *
            opt.cardW / width;

          const ly =
            (y + 0.5) *
            opt.cardH / height;

          const px =
            lx - opt.cardW / 2;

          const py =
            ly - opt.cardH / 2;

          const qx =
            Math.abs(px) -
            (opt.cardW / 2 - opt.radius);

          const qy =
            Math.abs(py) -
            (opt.cardH / 2 - opt.radius);

          const sdf =
            Math.hypot(
              Math.max(qx, 0),
              Math.max(qy, 0)
            ) +
            Math.min(
              Math.max(qx, qy),
              0
            ) -
            opt.radius;

          const inside = Math.max(
            0,
            -sdf
          );

          const gx =
            qx > 0 && qy > 0
              ? Math.sign(px) * qx
              : qx > qy
                ? Math.sign(px)
                : 0;

          const gy =
            qx > 0 && qy > 0
              ? Math.sign(py) * qy
              : qy >= qx
                ? Math.sign(py)
                : 0;

          const len =
            Math.hypot(gx, gy) || 1;

          const nx = gx / len;
          const ny = gy / len;

          const t = clamp(
            inside / settings.bezelPx,
            0,
            1
          ) * (PROFILE_SAMPLES - 1);

          const index = Math.min(
            PROFILE_SAMPLES - 2,
            Math.floor(t)
          );

          const shift = (
            profile.values[index] +

            (
              profile.values[index + 1] -
              profile.values[index]
            ) * (t - index)
          ) * settings.strength;

          const chroma =
            settings.chroma *
            1.1 *
            Math.exp(
              -inside /
              Math.max(
                settings.bezelPx * 0.28,
                1
              )
            );

          const rgb = [
            refracted(
              lx, ly, 0,
              nx, ny,
              shift - chroma
            ),

            refracted(
              lx, ly, 1,
              nx, ny,
              shift
            ),

            refracted(
              lx, ly, 2,
              nx, ny,
              shift + chroma
            ),
          ];

          const tint = clamp(
            (inside - 3) /
            Math.max(
              settings.bezelPx - 3,
              1
            ),
            0,
            1
          ) * 0.045;

          // ==================================
          // SPECULAR LIGHT
          // ==================================

          const lightX =
            (opt.lightX ?? 0.5) * 2 -
            1 - 0.35;

          const lightY =
            (opt.lightY ?? 0.5) * 2 -
            1 - 0.85;

          const lightLen =
            Math.hypot(
              lightX,
              lightY
            ) || 1;

          const facing = Math.pow(
            Math.max(
              0,
              (
                nx * lightX +
                ny * lightY
              ) / lightLen
            ),
            1.8
          );

          const spec =
            Math.exp(
              -Math.pow(
                (inside - 0.9) / 1.35,
                2
              )
            ) *
            facing *
            settings.specular *
            0.16;

          const dst =
            (y * width + x) * 4;

          for (
            let c = 0;
            c < 3;
            c++
          ) {
            const value =
              rgb[c] * (1 - tint) +

              [
                0.055,
                0.066,
                0.09
              ][c] * tint +

              [
                0.9,
                0.94,
                1
              ][c] * spec;

            output.data[dst + c] =
              Math.round(
                clamp(value, 0, 1) * 255
              );
          }

          output.data[dst + 3] = 255;
        }
      }

      ctx.putImageData(output, 0, 0);
    },

    destroy() {},
  };
}

// ==========================================
// EXPORT THE BEST AVAILABLE ENGINE
// ==========================================

export function createGlassRenderer(canvas) {
  try {
    return (
      createWebGLRenderer(canvas) ||
      createCanvasRenderer(canvas)
    );
  } catch (error) {
    console.warn(
      "V2.1 WebGL unavailable; using Canvas fallback:",
      error
    );

    return createCanvasRenderer(canvas);
  }
}

// ==========================================
// NEXT-CARD FALLBACK SCENE
// ==========================================

export function paintRearGlassScene(scene, opt) {
  const dpr = Math.min(
    window.devicePixelRatio || 1,
    1.25
  );

  const width = Math.max(
    1,
    Math.round(
      (opt.stageW + 2 * PAD_X) * dpr
    )
  );

  const height = Math.max(
    1,
    Math.round(
      (opt.stageH + 2 * PAD_Y) * dpr
    )
  );

  if (
    scene.width !== width ||
    scene.height !== height
  ) {
    scene.width = width;
    scene.height = height;
  }

  const ctx = scene.getContext("2d");

  if (!ctx) return;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    PAD_X * dpr,
    PAD_Y * dpr
  );

  const w = opt.stageW;
  const h = opt.stageH;

  const bg = ctx.createRadialGradient(
    w * 0.5,
    h * 0.45,
    8,
    w * 0.5,
    h * 0.45,
    Math.max(w, h) * 0.85
  );

  bg.addColorStop(0, "#191b27");
  bg.addColorStop(0.62, "#090b13");
  bg.addColorStop(1, "#020203");

  ctx.fillStyle = bg;

  ctx.fillRect(
    -PAD_X,
    -PAD_Y,
    w + 2 * PAD_X,
    h + 2 * PAD_Y
  );

  const image =
    opt.snapshots?.[opt.sourceIndex];

  if (!image?.width || !image?.height) {
    return;
  }

  ctx.save();

  ctx.globalAlpha = SOURCE_OPACITY;

  if (opt.sourceQuad?.length === 4) {
    const [tl, tr, , bl] =
      opt.sourceQuad;

    ctx.transform(
      (tr[0] - tl[0]) / opt.cardW,
      (tr[1] - tl[1]) / opt.cardW,

      (bl[0] - tl[0]) / opt.cardH,
      (bl[1] - tl[1]) / opt.cardH,

      tl[0],
      tl[1]
    );

    ctx.drawImage(
      image,
      0,
      0,
      opt.cardW,
      opt.cardH
    );
  } else {
    ctx.translate(
      w * 0.5 - 14,
      h * 0.5 - 8
    );

    ctx.rotate(
      (-3 * Math.PI) / 180
    );

    ctx.scale(0.983, 0.983);

    ctx.drawImage(
      image,
      -opt.cardW / 2,
      -opt.cardH / 2,
      opt.cardW,
      opt.cardH
    );
  }

  ctx.restore();
}
