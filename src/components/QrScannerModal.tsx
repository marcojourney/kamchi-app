import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, X } from 'lucide-react';
import jsQR from 'jsqr';
import { useTranslation } from 'react-i18next';
import { extractLicenseKeyFromText } from '../lib/licenseKey';

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

interface QrScannerModalProps {
  onDetected: (value: string) => void;
  onClose: () => void;
  mode?: 'license' | 'any';
  title?: string;
  subtitle?: string;
}

function createNativeQrDetector(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined') return null;
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  if (!Detector) return null;
  try {
    return new Detector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

function decodeSourceWithJsQr(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  options: { maxSide: number; padPx: number; canvas?: HTMLCanvasElement }
): string | null {
  if (srcWidth <= 0 || srcHeight <= 0) return null;
  const scale = Math.min(1, options.maxSide / Math.max(srcWidth, srcHeight));
  const drawW = Math.max(1, Math.round(srcWidth * scale));
  const drawH = Math.max(1, Math.round(srcHeight * scale));
  const totalW = drawW + options.padPx * 2;
  const totalH = drawH + options.padPx * 2;

  const canvas = options.canvas ?? document.createElement('canvas');
  if (canvas.width !== totalW) canvas.width = totalW;
  if (canvas.height !== totalH) canvas.height = totalH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  if (options.padPx > 0) {
    // White quiet-zone background fixes transparent PNG QR codes from generators
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, totalW, totalH);
  }
  ctx.drawImage(source, options.padPx, options.padPx, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, totalW, totalH);
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data?.trim() || null;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  onDetected,
  onClose,
  mode = 'license',
  title,
  subtitle,
}) => {
  const { t, i18n } = useTranslation('license');
  const isKm = i18n.language.startsWith('km');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [statusMessage, setStatusMessage] = useState<string>(() => t('qr.startingCamera'));
  const [cameraSupported, setCameraSupported] = useState<boolean>(true);
  const [cameraReady, setCameraReady] = useState<boolean>(false);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    setCameraReady(false);
    setCameraSupported(true);
    setStatusMessage(t('qr.startingCamera'));

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      setStatusMessage(t('qr.unsupported'));
      return () => {
        active = false;
      };
    }

    const nativeDetector = createNativeQrDetector();
    if (!scanCanvasRef.current) {
      scanCanvasRef.current = document.createElement('canvas');
    }

    const handleQrPayload = (rawValue: string): boolean => {
      const trimmed = rawValue.trim();
      if (!trimmed) return false;
      if (mode === 'any') {
        stopCamera();
        onDetectedRef.current(trimmed);
        return true;
      }
      if (trimmed.toUpperCase().includes('KC1')) {
        stopCamera();
        onDetectedRef.current(extractLicenseKeyFromText(trimmed));
        return true;
      }
      setStatusMessage(t('qr.notKamChiQr'));
      return false;
    };

    const start = async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          // Fallback for desktop webcams or browsers rejecting strict constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (!active) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
          if (!active) return;
          setCameraReady(true);
          setStatusMessage('');
        }

        const scheduleNext = () => {
          if (!active) return;
          timerRef.current = window.setTimeout(() => {
            if (!active) return;
            rafRef.current = requestAnimationFrame(scanFrame);
          }, 110);
        };

        const scanFrame = async () => {
          if (!active) return;
          const video = videoRef.current;
          if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            try {
              // 1. Try native BarcodeDetector when available
              if (nativeDetector) {
                try {
                  const codes = await nativeDetector.detect(video);
                  for (const item of codes) {
                    if (item.rawValue && handleQrPayload(item.rawValue)) {
                      return;
                    }
                  }
                } catch {
                  // Ignore native detector errors and fall through to jsQR
                }
              }

              // 2. Universal offline jsQR decode (works on iOS Safari, Firefox, Windows/Linux Chrome)
              const decoded = decodeSourceWithJsQr(video, video.videoWidth, video.videoHeight, {
                maxSide: 960,
                padPx: 0,
                canvas: scanCanvasRef.current ?? undefined,
              });
              if (decoded && handleQrPayload(decoded)) {
                return;
              }
            } catch {
              // Ignore single-frame decoding errors
            }
          }
          scheduleNext();
        };

        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (err) {
        if (!active) return;
        setCameraSupported(false);
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatusMessage(t('qr.permissionDenied'));
        } else {
          setStatusMessage(t('qr.unsupported'));
        }
      }
    };

    start();

    return () => {
      active = false;
      stopCamera();
    };
  }, [facingMode, mode, stopCamera, t]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const img = await loadImageFromFile(file);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      // Try jsQR at high resolution (with white quiet-zone padding for transparent PNGs),
      // then retry at 720px if high-res camera noise obscures finder patterns.
      let foundText =
        decodeSourceWithJsQr(img, w, h, { maxSide: 1400, padPx: 24 }) ??
        decodeSourceWithJsQr(img, w, h, { maxSide: 720, padPx: 24 });

      // Fallback to native BarcodeDetector if available
      if (!foundText) {
        const nativeDetector = createNativeQrDetector();
        if (nativeDetector) {
          try {
            const codes = await nativeDetector.detect(img);
            foundText = codes.find((c) => Boolean(c.rawValue?.trim()))?.rawValue?.trim() ?? null;
          } catch {
            // Ignore native detector error
          }
        }
      }

      if (!foundText) {
        setStatusMessage(t('qr.noQrFoundInImage'));
        return;
      }

      if (mode === 'any') {
        stopCamera();
        onDetectedRef.current(foundText);
      } else if (foundText.toUpperCase().includes('KC1')) {
        stopCamera();
        onDetectedRef.current(extractLicenseKeyFromText(foundText));
      } else {
        setStatusMessage(t('qr.notKamChiQr'));
      }
    } catch {
      setStatusMessage(t('qr.noQrFoundInImage'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="qr-scanner-title"
              className={`text-base font-bold text-[#1F2937] dark:text-slate-100 ${
                isKm ? 'leading-[1.7]' : ''
              }`}
            >
              {title || t('qr.title')}
            </h2>
            <p className={`text-xs text-slate-500 dark:text-slate-400 ${isKm ? 'leading-[1.75]' : ''}`}>
              {subtitle || t('qr.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label={t('qr.cancel')}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative aspect-square max-h-72 w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
          />
          {cameraReady && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-[#F2B544]/85"
              />
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                aria-label={t('qr.switchCamera')}
                title={t('qr.switchCamera')}
                className="absolute top-3 right-3 min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-black/55 hover:bg-black/75 text-white flex items-center justify-center gap-1.5 text-xs font-semibold backdrop-blur-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">{t('qr.switchCamera')}</span>
              </button>
            </>
          )}
          {!cameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center gap-2.5 text-slate-200">
              <Camera className="w-8 h-8 text-[#F2B544]" />
              <p className={`text-xs ${isKm ? 'leading-[1.8]' : 'leading-relaxed'}`}>
                {statusMessage || (cameraSupported ? t('qr.startingCamera') : t('qr.unsupported'))}
              </p>
            </div>
          )}
        </div>

        {cameraReady && statusMessage && (
          <p className={`text-xs text-amber-700 dark:text-amber-300 ${isKm ? 'leading-[1.75]' : ''}`}>
            {statusMessage}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-[#1F2937] dark:text-slate-200"
          >
            {t('qr.cancel')}
          </button>

          <label className="min-h-[48px] flex items-center justify-center gap-1.5 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] px-3 text-xs font-semibold text-white cursor-pointer">
            <Upload className="w-4 h-4 shrink-0" />
            <span>{t('qr.uploadFallback')}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </label>
        </div>
      </div>
    </div>
  );
};
