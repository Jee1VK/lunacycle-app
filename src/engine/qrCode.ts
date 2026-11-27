/**
 * Minimal, zero-dependency, 100% offline ISO-18004 QR Code (Byte mode, ECC Level L)
 * generator for short URLs up to 78 bytes (supports Versions 1–4).
 * Outputs a boolean matrix so PartnerView can render a razor-sharp inline SVG QR code.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(ecLen: number): Uint8Array {
  let poly: Uint8Array = new Uint8Array([1]);
  for (let i = 0; i < ecLen; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEcc(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const res = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.copyWithin(0, 1);
    res[ecLen - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return res;
}

// Version 1..5 (Level L, single EC block): [version, size, dataCodewords, ecCodewords, alignmentCenter]
const QR_VERSIONS: Array<[number, number, number, number, number]> = [
  [1, 21, 19, 7, 0],
  [2, 25, 34, 10, 18],
  [3, 29, 55, 15, 22],
  [4, 33, 80, 20, 26],
  [5, 37, 108, 26, 30],
];

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec =
    QR_VERSIONS.find(([, , dataCw]) => bytes.length + 2 <= dataCw) ??
    QR_VERSIONS[QR_VERSIONS.length - 1];
  const [, size, dataCw, ecCw, alignPos] = spec;

  // Build bitstream: Byte mode (0100) + 8-bit length + bytes + terminator + pad bytes
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = dataCw * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(dataCw);
  for (let i = 0; i < bits.length / 8 && i < dataCw; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
    data[i] = v;
  }
  const padBytes = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < dataCw; i++, p++) {
    data[i] = padBytes[p % 2];
  }

  const ecc = rsComputeEcc(data, ecCw);
  const codewords = new Uint8Array(dataCw + ecCw);
  codewords.set(data, 0);
  codewords.set(ecc, dataCw);

  const matrix: Array<Array<boolean>> = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );
  const isFunction: Array<Array<boolean>> = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );

  const setFn = (r: number, c: number, val: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    matrix[r][c] = val;
    isFunction[r][c] = true;
  };

  // Finder patterns + separators
  const drawFinder = (tr: number, tc: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = tr + dr;
        const c = tc + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const on =
          dr >= 0 &&
          dr <= 6 &&
          dc >= 0 &&
          dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFn(r, c, on);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Alignment pattern (Versions 2..4)
  if (alignPos > 0) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const on = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
        setFn(alignPos + dr, alignPos + dc, on);
      }
    }
  }

  // Reserve format info + dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFn(8, i, false);
      setFn(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFn(8, size - 1 - i, false);
    setFn(size - 1 - i, 8, false);
  }
  setFn(size - 8, 8, true);

  // Place data bits in zigzag columns with Mask 0 ((r + c) % 2 === 0)
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((size - 1 - right) >> 1) % 2 === 0;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunction[r][c]) continue;
        let bit = false;
        if (bitIdx < totalBits) {
          bit = ((codewords[bitIdx >> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx += 1;
        }
        matrix[r][c] = (r + c) % 2 === 0 ? !bit : bit;
      }
    }
  }

  // Format bits for ECC Level L (01) + Mask 0 (000) -> 0b01000 -> BCH(15,5) ^ 0x5412 = 0x77C4
  const formatBits = 0x77c4;
  for (let i = 0; i <= 5; i++) setFn(8, i, ((formatBits >>> (14 - i)) & 1) === 1);
  setFn(8, 7, ((formatBits >>> 8) & 1) === 1);
  setFn(8, 8, ((formatBits >>> 7) & 1) === 1);
  setFn(7, 8, ((formatBits >>> 6) & 1) === 1);
  for (let i = 9; i < 15; i++) setFn(14 - i, 8, ((formatBits >>> (14 - i)) & 1) === 1);

  for (let i = 0; i < 7; i++) setFn(size - 1 - i, 8, ((formatBits >>> (14 - i)) & 1) === 1);
  for (let i = 0; i < 8; i++) setFn(8, size - 8 + i, ((formatBits >>> (7 - i)) & 1) === 1);

  return matrix;
}
