import { createWorker, type Worker } from 'tesseract.js';
import { prepareReceipt, type PreparedImage } from './imagePrep.js';
import { receiptScore } from './orientation.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(['rus', 'eng']).then(async (worker) => {
      await worker.setParameters({
        // 4 — «одна колонка текста переменной высоты»: ровно про чек.
        tessedit_pageseg_mode: '4' as never,
        preserve_interword_spaces: '1',
        tessedit_char_blacklist: '{}[]<>|\\^~`',
      });
      return worker;
    });
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  image: PreparedImage;
  /** На сколько градусов пришлось повернуть снимок. */
  angle: number;
}

/**
 * Распознаёт чек.
 *
 * Люди снимают чек как придётся — часто боком, потому что он длинный.
 * Перевёрнутый чек Tesseract превращает в случайную латиницу, поэтому
 * сначала на уменьшенных копиях проверяем все четыре поворота и выбираем тот,
 * где текст больше похож на чек. Полное распознавание идёт уже по нему.
 */
export async function recognizeReceipt(imagePath: string): Promise<OcrResult> {
  const { full, probes } = await prepareReceipt(imagePath);
  const worker = await getWorker();

  let best = { angle: 0, score: -1 };
  for (const probe of probes) {
    const { data } = await worker.recognize(probe.image.buffer);
    const score = receiptScore(data.text);
    if (score > best.score) best = { angle: probe.angle, score };
  }

  const image = await full(best.angle);
  const { data } = await worker.recognize(image.buffer);

  return { text: data.text, image, angle: best.angle };
}

export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
