export interface PlantHealthResult {
  hue: number;
  saturation: number;
  value: number;
  health: 'Sehat' | 'Merana' | 'Mati';
  confidence: number;
}

interface PlantHealthOptions {
  centerFocus?: boolean;
}

interface HSV {
  h: number;
  s: number;
  v: number;
}

const toHSV = (r: number, g: number, b: number): HSV => {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;

  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === nr) {
      h = 60 * (((ng - nb) / delta) % 6);
    } else if (max === ng) {
      h = 60 * ((nb - nr) / delta + 2);
    } else {
      h = 60 * ((nr - ng) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
};

const classifyHealthByHue = (hue: number): 'Sehat' | 'Merana' | 'Mati' => {
  if (hue >= 65 && hue <= 160) {
    return 'Sehat';
  }
  if (hue >= 25 && hue < 65) {
    return 'Merana';
  }
  return 'Mati';
};

const round = (value: number, decimals = 2): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
};

export const analyzePlantHealthHSV = (
  imageData: ImageData,
  options: PlantHealthOptions = {},
): PlantHealthResult => {
  const pixels = imageData.data;
  const step = 4;
  const width = imageData.width;
  const height = imageData.height;

  const centerFocus = options.centerFocus ?? true;
  const cx = width / 2;
  const cy = height / 2;
  const radiusX = width * 0.35;
  const radiusY = height * 0.35;

  let count = 0;
  let hueSum = 0;
  let satSum = 0;
  let valSum = 0;

  let selectedCount = 0;
  let selectedSatSum = 0;
  let selectedValSum = 0;

  // Batasi analisis ke piksel yang cukup berwarna agar hasil kesehatan lebih stabil.
  const candidateHues: number[] = [];
  const bins = new Array<number>(36).fill(0);

  for (let i = 0; i < pixels.length; i += step) {
    const pixelIndex = i / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (centerFocus) {
      const nx = (x - cx) / radiusX;
      const ny = (y - cy) / radiusY;
      // Mask elips tengah untuk menekan pengaruh background di tepi frame.
      if (nx * nx + ny * ny > 1) {
        continue;
      }
    }

    const alpha = pixels[i + 3];
    if (alpha === 0) {
      continue;
    }

    const { h, s, v } = toHSV(pixels[i], pixels[i + 1], pixels[i + 2]);
    count += 1;
    hueSum += h;
    satSum += s;
    valSum += v;

    // Kandidat vegetasi: cukup jenuh, cukup terang, dan berada di spektrum hijau-kuning tanaman.
    if (s >= 0.2 && v >= 0.15 && h >= 25 && h <= 170) {
      candidateHues.push(h);
      bins[Math.min(35, Math.floor(h / 10))] += 1;
      selectedCount += 1;
      selectedSatSum += s;
      selectedValSum += v;
    }
  }

  if (count === 0) {
    return {
      hue: 0,
      saturation: 0,
      value: 0,
      health: 'Mati',
      confidence: 0,
    };
  }

  const sourceHues = candidateHues.length > 0 ? candidateHues : [hueSum / count];
  const hue = sourceHues.reduce((acc, cur) => acc + cur, 0) / sourceHues.length;
  const saturation = selectedCount > 0 ? selectedSatSum / selectedCount : satSum / count;
  const value = selectedCount > 0 ? selectedValSum / selectedCount : valSum / count;
  const health = classifyHealthByHue(hue);

  const inClassCount = sourceHues.filter((h) => classifyHealthByHue(h) === health).length;
  const classConsistency = inClassCount / sourceHues.length;
  const dominantBin = bins.length > 0 ? Math.max(...bins) : 0;
  const concentration = candidateHues.length > 0 ? dominantBin / candidateHues.length : 0;
  const confidence = round(Math.max(0, Math.min(1, (classConsistency + concentration) / 2)) * 100);

  return {
    hue: round(hue),
    saturation: round(saturation),
    value: round(value),
    health,
    confidence,
  };
};
