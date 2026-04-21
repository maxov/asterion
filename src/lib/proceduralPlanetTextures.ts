import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  SRGBColorSpace,
} from "three";

function fract(value: number) {
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function hash2(x: number, y: number, seed: number) {
  return fract(
    Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43_758.5453123,
  );
}

function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

function fbm(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  lacunarity: number,
  gain: number,
) {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + i * 17);
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return sum;
}

function configureColorTexture(texture: CanvasTexture) {
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function clampChannel(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 255));
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0xffffffff;
  };
}

export function createEarthSurfaceTexture() {
  const width = 1024;
  const height = 512;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return null;

  const imageData = context.createImageData(width, height);
  const { data } = imageData;
  const tau = Math.PI * 2;

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const latitude = v * 2 - 1;
    const absLatitude = Math.abs(latitude);

    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const lonX = u * tau;
      const latY = v * Math.PI;
      const n1 = fbm(lonX * 0.55, latY * 0.9, 13, 5, 2.2, 0.5);
      const n2 = fbm(lonX * 1.3 + 40, latY * 1.1 - 12, 41, 4, 2.0, 0.55);
      const continental =
        n1 * 0.75 +
        n2 * 0.45 -
        absLatitude * 0.16 +
        Math.sin(lonX * 0.9 + latY * 0.3) * 0.05;
      const coastalMix = smoothstep(0.49, 0.57, continental);
      const humidity = fbm(lonX * 2.8 - 17, latY * 2.4 + 9, 67, 4, 2.1, 0.5);
      const elevation = fbm(lonX * 4.4 + 18, latY * 3.2 - 21, 89, 5, 2.0, 0.53);
      const iceMix = smoothstep(0.7, 0.94, absLatitude + (0.4 - humidity) * 0.18);

      let red: number;
      let green: number;
      let blue: number;

      if (continental < 0.53) {
        const shallowMix = coastalMix;
        const waterWarmth = 1 - absLatitude * 0.85;
        red = lerp(9, 32, shallowMix) + waterWarmth * 8;
        green = lerp(38, 108, shallowMix) + waterWarmth * 12;
        blue = lerp(76, 168, shallowMix) + waterWarmth * 20;
      } else {
        const desertMix = smoothstep(0.46, 0.72, (1 - humidity) * (1 - absLatitude * 0.55));
        const mountainMix = smoothstep(0.58, 0.86, elevation);
        const temperateMix = 1 - desertMix;

        red =
          lerp(68, 160, desertMix) * 0.65 +
          lerp(52, 102, temperateMix) * 0.7 +
          mountainMix * 42;
        green =
          lerp(96, 146, desertMix) * 0.55 +
          lerp(96, 136, temperateMix) * 0.85 +
          mountainMix * 38;
        blue =
          lerp(42, 92, desertMix) * 0.5 +
          lerp(48, 76, temperateMix) * 0.65 +
          mountainMix * 28;
      }

      red = lerp(red, 242, iceMix);
      green = lerp(green, 246, iceMix);
      blue = lerp(blue, 248, iceMix);

      const shade = 0.92 + fbm(lonX * 6.8, latY * 6.2, 111, 3, 2.0, 0.55) * 0.18;
      const index = (y * width + x) * 4;
      data[index] = clampChannel(red * shade);
      data[index + 1] = clampChannel(green * shade);
      data[index + 2] = clampChannel(blue * shade);
      data[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  const texture = new CanvasTexture(canvas);
  configureColorTexture(texture);
  return texture;
}

export function createEarthCloudTexture() {
  const width = 1024;
  const height = 512;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return null;

  const imageData = context.createImageData(width, height);
  const { data } = imageData;
  const tau = Math.PI * 2;

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const latitude = v * 2 - 1;
    const tropicalBand = Math.exp(-latitude * latitude * 8);

    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const cloudNoise =
        fbm(u * tau * 1.5, v * Math.PI * 2.5, 191, 5, 2.1, 0.52) * 0.9 +
        fbm(u * tau * 4.4 + 22, v * Math.PI * 1.3 - 7, 233, 3, 2.4, 0.58) *
          0.35 +
        tropicalBand * 0.12;
      const alpha = smoothstep(0.5, 0.78, cloudNoise) * 255;
      const index = (y * width + x) * 4;

      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = clampChannel(alpha);
    }
  }

  context.putImageData(imageData, 0, 0);
  const texture = new CanvasTexture(canvas);
  configureColorTexture(texture);
  return texture;
}

export function createMoonSurfaceTexture() {
  const width = 1024;
  const height = 512;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return null;

  const imageData = context.createImageData(width, height);
  const { data } = imageData;
  const tau = Math.PI * 2;

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);

    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const albedo =
        0.42 +
        fbm(u * tau * 3.1, v * Math.PI * 3.6, 307, 5, 2.2, 0.54) * 0.28 +
        fbm(u * tau * 6.8 + 13, v * Math.PI * 4.4 - 17, 359, 3, 2.5, 0.6) *
          0.14;
      const mare =
        smoothstep(
          0.5,
          0.74,
          fbm(u * tau * 1.2 - 4, v * Math.PI * 1.5 + 9, 401, 4, 2.1, 0.55),
        ) * 0.18;
      const gray = clampChannel((albedo - mare) * 255);
      const index = (y * width + x) * 4;

      data[index] = gray;
      data[index + 1] = gray;
      data[index + 2] = gray + 4;
      data[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);

  const random = seededRandom(8675309);
  for (let i = 0; i < 220; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = lerp(4, 42, random() ** 2);

    const rim = context.createRadialGradient(x, y, radius * 0.7, x, y, radius);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(0.82, "rgba(224,224,224,0.16)");
    rim.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = rim;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    const bowl = context.createRadialGradient(
      x - radius * 0.18,
      y - radius * 0.18,
      radius * 0.08,
      x,
      y,
      radius,
    );
    bowl.addColorStop(0, "rgba(246,246,246,0.12)");
    bowl.addColorStop(0.35, "rgba(160,160,160,0.05)");
    bowl.addColorStop(0.72, "rgba(34,34,34,0.12)");
    bowl.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = bowl;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new CanvasTexture(canvas);
  configureColorTexture(texture);
  return texture;
}
