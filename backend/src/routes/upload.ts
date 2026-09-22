import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { recognizeReceipt } from '../services/ocr.js';
import { parseReceipt } from '../services/parser.js';
import { findQr, parseFiscalQr } from '../services/qr.js';

fs.mkdirSync(config.uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

export const uploadRouter = Router();

/**
 * Фото чека → OCR → распарсенные товары.
 * Результат не сохраняется: юзер сначала правит его в UI, потом шлёт в POST /api/expenses.
 */
uploadRouter.post('/', requireAuth, upload.single('file'), async (req: AuthedRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Нужен файл с фото чека (поле file)' });
    return;
  }
  try {
    const { text, image, angle } = await recognizeReceipt(req.file.path);
    const parsed = parseReceipt(text);

    // Фискальному QR верим больше, чем распознанному тексту: там точная сумма.
    // Сначала берём код, который камера поймала в видоискателе — он мог не попасть в кадр.
    const fromCamera = req.body?.qr ? parseFiscalQr(String(req.body.qr)) : null;
    const qr = fromCamera ?? findQr(image);
    const total = qr?.total ?? parsed.total;

    const itemsSum = parsed.items.reduce((sum, item) => sum + item.price, 0);

    res.json({
      ...parsed,
      total,
      itemsMismatch: parsed.items.length > 0 && Math.abs(total - itemsSum) > 1,
      date: qr?.date ?? parsed.date,
      qrCode: qr?.raw ?? parsed.qrCode,
      fromQr: Boolean(qr?.total),
      /** Снимок был повёрнут — подскажем человеку снимать вертикально. */
      rotated: angle !== 0,
      imagePath: path.relative(process.cwd(), req.file.path),
      rawText: text,
    });
  } catch (error) {
    res.status(500).json({ error: 'Не удалось распознать чек', details: String(error) });
  }
});
