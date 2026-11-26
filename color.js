/**
 * Pure color math for Color Clash.
 * RGB channels are 0–255, HSL uses degrees and 0–100 percentages,
 * and Lab uses the D65 reference white.
 */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function rgbToHex(rgb) {
  return `#${rgb.map((channel) =>
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
  ).join('')}`.toUpperCase();
}

export function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    throw new Error('Expected a three- or six-digit HEX color.');
  }
  return [0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16));
}

export function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case r: hue = 60 * (((g - b) / delta) % 6); break;
      case g: hue = 60 * ((b - r) / delta + 2); break;
      default: hue = 60 * ((r - g) / delta + 4);
    }
  }

  return [(hue + 360) % 360, saturation * 100, lightness * 100];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - chroma / 2;
  let rgb;

  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  return rgb.map((channel) => (channel + m) * 255);
}

function linearize(channel) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function delinearize(channel) {
  const value = channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.max(0, channel) ** (1 / 2.4) - 0.055;
  return clamp(value * 255, 0, 255);
}

export function rgbToLab([r, g, b]) {
  const red = linearize(r);
  const green = linearize(g);
  const blue = linearize(b);
  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) * 100;
  const y = (red * 0.2126729 + green * 0.7151522 + blue * 0.0721750) * 100;
  const z = (red * 0.0193339 + green * 0.1191920 + blue * 0.9503041) * 100;
  const white = [95.047, 100, 108.883];
  const [fx, fy, fz] = [x, y, z].map((value, index) => {
    const ratio = value / white[index];
    const delta = 6 / 29;
    return ratio > delta ** 3
      ? Math.cbrt(ratio)
      : ratio / (3 * delta ** 2) + 4 / 29;
  });
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb([l, a, b]) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const delta = 6 / 29;
  const expand = (value) => value > delta
    ? value ** 3
    : 3 * delta ** 2 * (value - 4 / 29);
  const x = 95.047 * expand(fx) / 100;
  const y = 100 * expand(fy) / 100;
  const z = 108.883 * expand(fz) / 100;

  return [
    delinearize(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    delinearize(x * -0.9692660 + y * 1.8760108 + z * 0.0415560),
    delinearize(x * 0.0556434 + y * -0.2040259 + z * 1.0572252),
  ];
}

export const hslToLab = (hsl) => rgbToLab(hslToRgb(hsl));
export const labToHsl = (lab) => rgbToHsl(labToRgb(lab));

const degrees = (radians) => radians * 180 / Math.PI;
const radians = (angle) => angle * Math.PI / 180;

/** CIEDE2000 color difference: 0 means identical, ~1 is a just-noticeable difference. */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const kL = 1;
  const kC = 1;
  const kH = 1;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const meanC = (C1 + C2) / 2;
  const meanC7 = meanC ** 7;
  const G = 0.5 * (1 - Math.sqrt(meanC7 / (meanC7 + 25 ** 7)));
  const a1Prime = (1 + G) * a1;
  const a2Prime = (1 + G) * a2;
  const C1Prime = Math.hypot(a1Prime, b1);
  const C2Prime = Math.hypot(a2Prime, b2);
  const meanCPrime = (C1Prime + C2Prime) / 2;

  const hue = (b, aPrime) => {
    if (b === 0 && aPrime === 0) return 0;
    const angle = degrees(Math.atan2(b, aPrime));
    return angle >= 0 ? angle : angle + 360;
  };
  const h1Prime = hue(b1, a1Prime);
  const h2Prime = hue(b2, a2Prime);
  const deltaLPrime = L2 - L1;
  const deltaCPrime = C2Prime - C1Prime;
  let deltahPrime = 0;

  if (C1Prime * C2Prime !== 0) {
    const difference = h2Prime - h1Prime;
    if (Math.abs(difference) <= 180) deltahPrime = difference;
    else if (difference > 180) deltahPrime = difference - 360;
    else deltahPrime = difference + 360;
  }

  const deltaHPrime = 2 * Math.sqrt(C1Prime * C2Prime) * Math.sin(radians(deltahPrime) / 2);
  const meanLPrime = (L1 + L2) / 2;
  let meanhPrime = h1Prime + h2Prime;
  if (C1Prime * C2Prime !== 0) {
    const difference = Math.abs(h1Prime - h2Prime);
    if (difference <= 180) meanhPrime = (h1Prime + h2Prime) / 2;
    else if (h1Prime + h2Prime < 360) meanhPrime = (h1Prime + h2Prime + 360) / 2;
    else meanhPrime = (h1Prime + h2Prime - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos(radians(meanhPrime - 30))
    + 0.24 * Math.cos(radians(2 * meanhPrime))
    + 0.32 * Math.cos(radians(3 * meanhPrime + 6))
    - 0.20 * Math.cos(radians(4 * meanhPrime - 63));
  const deltaTheta = 30 * Math.exp(-(((meanhPrime - 275) / 25) ** 2));
  const meanCPrime7 = meanCPrime ** 7;
  const RC = 2 * Math.sqrt(meanCPrime7 / (meanCPrime7 + 25 ** 7));
  const SL = 1 + (0.015 * (meanLPrime - 50) ** 2) / Math.sqrt(20 + (meanLPrime - 50) ** 2);
  const SC = 1 + 0.045 * meanCPrime;
  const SH = 1 + 0.015 * meanCPrime * T;
  const RT = -Math.sin(radians(2 * deltaTheta)) * RC;

  return Math.sqrt(
    (deltaLPrime / (kL * SL)) ** 2
    + (deltaCPrime / (kC * SC)) ** 2
    + (deltaHPrime / (kH * SH)) ** 2
    + RT * (deltaCPrime / (kC * SC)) * (deltaHPrime / (kH * SH))
  );
}

/** A smooth game score, not a claim that Delta E is itself a percentage. */
export const deltaEToAccuracy = (deltaE) => 100 * Math.exp(-Math.max(0, deltaE) / 40);

export const relativeLuminance = ([r, g, b]) =>
  0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
