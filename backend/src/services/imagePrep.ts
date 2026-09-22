import { Jimp } from 'jimp';

export interface PreparedImage {
  /** Обработанная картинка в PNG — её и читает Tesseract. */
  buffer: Buffer;
  /** Пиксели кадра до бинаризации — по ним ищется QR. */
  raw: { data: Uint8ClampedArray; width: number; height: number };
}

/** Ширина, до которой тянем чек: мелкий текст Tesseract не читает вовсе. */
const TARGET_WIDTH = 1600;
/** Уменьшенная копия для быстрой проверки ориентации. */
const PROBE_WIDTH = 700;

/**
 * У Jimp 1.x типы исходного изображения и его клона объявлены независимо,
 * поэтому клон описываем структурно — только теми методами, что нам нужны.
 */
interface Editable {
  bitmap: { data: Buffer; width: number; height: number };
  greyscale(): Editable;
  normalize(): Editable;
  contrast(value: number): Editable;
  getBuffer(mime: 'image/png'): Promise<Buffer>;
}

async function toPrepared(image: Editable, contrast = 0.35): Promise<PreparedImage> {
  const raw = {
    data: new Uint8ClampedArray(image.bitmap.data),
    width: image.bitmap.width,
    height: image.bitmap.height,
  };
  image.greyscale().normalize().contrast(contrast);
  return { buffer: await image.getBuffer('image/png'), raw };
}

/**
 * Готовит фото чека к распознаванию.
 *
 * Термочек — это серый текст на сером фоне, часто со складками и бликами.
 * Поэтому: увеличиваем до читаемого размера, обесцвечиваем, растягиваем
 * контраст. Плюс отдаём уменьшенные копии всех четырёх поворотов —
 * по ним быстро определяется, каким боком снят чек.
 */
export async function prepareReceipt(imagePath: string): Promise<{
  /** Полноразмерные варианты по углу поворота. */
  full: (angle: number) => Promise<PreparedImage>;
  /** Маленькие копии для быстрой пробы ориентации. */
  probes: { angle: number; image: PreparedImage }[];
}> {
  const original = await Jimp.read(imagePath);

  if (original.width < TARGET_WIDTH) original.resize({ w: TARGET_WIDTH });
  else if (original.width > TARGET_WIDTH * 2) original.resize({ w: TARGET_WIDTH * 2 });

  const probeSource = original.clone().resize({ w: PROBE_WIDTH });
  const probes: { angle: number; image: PreparedImage }[] = [];

  for (const angle of [0, 90, 180, 270]) {
    const rotated = probeSource.clone();
    if (angle !== 0) rotated.rotate(angle);
    probes.push({ angle, image: await toPrepared(rotated as unknown as Editable) });
  }

  const full = async (angle: number) => {
    const rotated = original.clone();
    if (angle !== 0) rotated.rotate(angle);
    return toPrepared(rotated as unknown as Editable);
  };

  return { full, probes };
}
