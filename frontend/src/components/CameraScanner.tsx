import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ParsedReceipt } from '../api/client';
import { haptic } from '../telegram';
import { CameraIcon, CheckIcon, CloseIcon, GalleryIcon, RetryIcon } from './Icons';

type Stage = 'camera' | 'scanning' | 'failed' | 'done';

/**
 * Полноэкранный сканер чека.
 * Кадр обрезается по рамке — в OCR уходит только то, что человек в неё вписал,
 * это заметно поднимает качество распознавания по сравнению с полным кадром.
 */
export function CameraScanner({
  onDone,
  onClose,
}: {
  onDone: (parsed: ParsedReceipt, preview: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /* Защита от второго запроса разрешения: React в разработке монтирует
     компонент дважды, а Telegram спрашивает доступ на каждый вызов. */
  const startingRef = useRef(false);
  const [stage, setStage] = useState<Stage>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<{ parsed: ParsedReceipt; preview: string } | null>(null);
  // Фискальный QR, пойманный ещё до съёмки: из него берутся точная сумма и дата.
  const [qr, setQr] = useState<string | null>(null);
  const qrRef = useRef<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current || startingRef.current) return;
    startingRef.current = true;
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (error) {
      const name = (error as Error).name;
      setCameraError(
        name === 'NotAllowedError'
          ? 'Доступ к камере запрещён. Разреши его в настройках браузера или выбери фото из галереи.'
          : 'Камера недоступна на этом устройстве. Выбери фото из галереи.',
      );
    } finally {
      startingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  /*
   * Видео остаётся в разметке всегда, но браузер теряет привязку потока,
   * когда элемент прячется. Поэтому при каждом возврате к съёмке
   * привязываем поток заново — без этого после «Переснять» был чёрный экран.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (stage !== 'camera' || !video) return;

    if (streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
    }
    void video.play().catch(() => {});
  }, [stage, result]);

  /*
   * Пока человек наводит камеру, в фоне ищем QR прямо в видеопотоке.
   * Так он видит, поймался код или нет, ДО нажатия на кнопку — а не после,
   * когда переснимать уже лень.
   */
  useEffect(() => {
    if (stage !== 'camera') return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let decode: typeof import('jsqr').default | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const scanFrame = () => {
      const video = videoRef.current;
      if (!video || !context || video.videoWidth === 0) return;

      const width = 640;
      const height = Math.round((video.videoHeight / video.videoWidth) * width);
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);

      const frame = context.getImageData(0, 0, width, height);
      const found = decode?.(frame.data, width, height, { inversionAttempts: 'dontInvert' });

      // Нас интересует только фискальный код чека, а не случайный QR на упаковке.
      if (found?.data && /t=\d{8}T\d{4,6}&s=[\d.]+/.test(found.data)) {
        qrRef.current = found.data;
        setQr(found.data);
      }
    };

    // Декодер весит прилично, поэтому грузим его только когда камера открыта.
    void import('jsqr').then((module) => {
      if (stopped) return;
      decode = module.default;
      timer = setInterval(scanFrame, 450);
    });

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [stage]);

  /** Вырезает область рамки из кадра и отдаёт JPEG. */
  const cropFrame = (video: HTMLVideoElement): Promise<Blob | null> => {
    const { videoWidth: width, videoHeight: height } = video;
    // Рамка занимает 82% ширины с пропорцией 2:3. Режем с запасом в 8%:
    // лучше прихватить лишнего, чем отрезать половину QR у края.
    const frameWidth = Math.min(width * 0.9, width);
    const frameHeight = Math.min(frameWidth * 1.5, height);
    const canvas = document.createElement('canvas');
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const context = canvas.getContext('2d');
    if (!context) return Promise.resolve(null);
    context.drawImage(
      video,
      (width - frameWidth) / 2,
      (height - frameHeight) / 2,
      frameWidth,
      frameHeight,
      0,
      0,
      frameWidth,
      frameHeight,
    );
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92));
  };

  const scan = async (file: File, preview: string) => {
    setStage('scanning');
    try {
      // Код, пойманный в видоискателе, отдаём серверу: он мог не попасть в кадр.
      const parsed = await api.uploadReceipt(file, qrRef.current ?? undefined);
      // Читать было нечего: ни позиций, ни суммы — даже из QR.
      if (parsed.items.length === 0 && parsed.total <= 0) {
        haptic('error');
        setStage('failed');
        return;
      }
      haptic('success');
      setResult({ parsed, preview });
      setStage('done');
    } catch {
      haptic('error');
      setStage('failed');
    }
  };

  const shoot = async () => {
    const video = videoRef.current;
    if (!video) return;
    haptic('tap');
    const blob = await cropFrame(video);
    if (!blob) {
      setStage('failed');
      return;
    }
    await scan(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }), URL.createObjectURL(blob));
  };

  const pickFromGallery = (file: File) => void scan(file, URL.createObjectURL(file));

  const retry = () => {
    setResult(null);
    setQr(null);
    qrRef.current = null;
    setStage('camera');
    // Поток мог быть остановлен системой, пока показывался снимок.
    if (!streamRef.current?.getVideoTracks().some((track) => track.readyState === 'live')) {
      streamRef.current = null;
      void startCamera();
    }
  };

  const accept = () => {
    if (!result) return;
    stopCamera();
    onDone(result.parsed, result.preview);
  };

  const itemsCount = result?.parsed.items.length ?? 0;

  return (
    <div className="camera">
      <div className="camera-stage">
        <video ref={videoRef} playsInline muted autoPlay />
        {result && <img className="camera-shot" src={result.preview} alt="Снятый чек" />}

        {stage === 'camera' && !cameraError && (
          <>
            <div className={`camera-frame${qr ? ' qr-found' : ''}`}>
              <i />
            </div>
            {qr ? (
              <div className="qr-badge">
                <CheckIcon size={16} /> QR пойман — сумма будет точной
              </div>
            ) : null}
            <p className="camera-hint">
              {qr
                ? 'Готово, можно снимать'
                : 'Держи чек вертикально и захвати QR-код — по нему сумма читается точно'}
            </p>
          </>
        )}

        {cameraError && (
          <div className="camera-status">
            <span className="status-title">Нет доступа к камере</span>
            <p className="muted">{cameraError}</p>
            <div className="status-actions">
              <label className="button-like">
                Выбрать фото
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) pickFromGallery(file);
                  }}
                />
              </label>
            </div>
          </div>
        )}

        {stage === 'scanning' && (
          <div className="camera-status">
            <span className="spinner" />
            <span className="status-title">Распознаю чек…</span>
            <p className="muted">Это занимает несколько секунд</p>
          </div>
        )}

        {stage === 'failed' && (
          <div className="camera-status">
            <span className="status-title">Не получилось прочитать</span>
            <p className="muted">
              Попробуй ещё раз: чек вертикально и целиком в рамке, ровный свет, без бликов
              и складок. Если на чеке есть QR — захвати и его, по нему сумма читается точно.
            </p>
            <div className="status-actions">
              <button type="button" className="big-button" onClick={retry}>
                Сфоткать заново
              </button>
            </div>
          </div>
        )}

        {stage === 'done' && result && (
          <div className="camera-status">
            <span className="status-title">Чек распознан</span>
            <p className="muted">
              {itemsCount > 0
                ? `Нашёл ${itemsCount} ${plural(itemsCount, 'позицию', 'позиции', 'позиций')} на ${Math.round(
                    result.parsed.total,
                  ).toLocaleString('ru-RU')}р`
                : `Позиции не разобрал, но сумма есть: ${Math.round(result.parsed.total).toLocaleString('ru-RU')}р`}
              {result.parsed.fromQr ? ' · сумма из QR, она точная' : result.parsed.qrCode ? ' · QR на месте' : ''}
            </p>
            <div className="status-actions">
              <button type="button" className="ghost-button" onClick={retry}>
                Переснять
              </button>
              <button type="button" className="big-button" onClick={accept}>
                Хорошо
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="camera-bar">
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          aria-label="Закрыть камеру"
        >
          <CloseIcon size={22} />
        </button>

        <button
          type="button"
          className="shutter"
          onClick={shoot}
          disabled={stage !== 'camera' || Boolean(cameraError)}
        >
          {stage === 'scanning' ? <RetryIcon size={24} /> : <CameraIcon size={26} />}
        </button>

        <label className="camera-gallery" aria-label="Выбрать из галереи" style={{ justifySelf: 'end' }}>
          <GalleryIcon size={22} />
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) pickFromGallery(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
