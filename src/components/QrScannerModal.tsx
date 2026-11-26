import React, { useEffect, useRef, useState } from 'react';
import { Camera, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { extractLicenseKeyFromText } from '../lib/licenseKey';

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

interface QrScannerModalProps {
  onDetected: (licenseKey: string) => void;
  onClose: () => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ onDetected, onClose }) => {
  const { t, i18n } = useTranslation('license');
  const isKm = i18n.language.startsWith('km');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [statusMessage, setStatusMessage] = useState<string>(() => t('qr.startingCamera'));
  const [cameraSupported, setCameraSupported] = useState<boolean>(true);
  const [cameraReady, setCameraReady] = useState<boolean>(false);

  const stopCamera = () => {
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
  };

  useEffect(() => {
    let active = true;
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;

    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      setStatusMessage(t('qr.unsupported'));
      return () => {
        active = false;
      };
    }

    let detector: BarcodeDetectorLike;
    try {
      detector = new Detector({ formats: ['qr_code'] });
    } catch {
      setCameraSupported(false);
      setStatusMessage(t('qr.unsupported'));
      return () => {
        active = false;
      };
    }

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
          setStatusMessage('');
        }

        const scanFrame = async () => {
          if (!active || !videoRef.current) return;
          if (videoRef.current.readyState >= 2) {
            try {
              const codes = await detector.detect(videoRef.current);
              for (const item of codes) {
                const raw = item.rawValue?.trim();
                if (raw && raw.toUpperCase().includes('KC1')) {
                  stopCamera();
                  onDetected(extractLicenseKeyFromText(raw));
                  return;
                }
              }
            } catch {
              // Ignore single-frame detection errors
            }
          }
          rafRef.current = requestAnimationFrame(scanFrame);
        };
        rafRef.current = requestAnimationFrame(scanFrame);
      } catch {
        if (!active) return;
        setCameraSupported(false);
        setStatusMessage(t('qr.permissionDenied'));
      }
    };

    start();

    return () => {
      active = false;
      stopCamera();
    };
  }, [onDetected, t]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
    if (!Detector) {
      setStatusMessage(t('qr.unsupported'));
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const detector = new Detector({ formats: ['qr_code'] });
      const codes = await detector.detect(bitmap);
      bitmap.close?.();

      const found = codes.find((c) => c.rawValue && c.rawValue.toUpperCase().includes('KC1'));
      if (found?.rawValue) {
        stopCamera();
        onDetected(extractLicenseKeyFromText(found.rawValue));
      } else {
        setStatusMessage(t('qr.noQrFoundInImage'));
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
              {t('qr.title')}
            </h2>
            <p className={`text-xs text-slate-500 dark:text-slate-400 ${isKm ? 'leading-[1.75]' : ''}`}>
              {t('qr.subtitle')}
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
            className={`w-full h-full object-cover ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
          />
          {cameraReady && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-[#F2B544]/85"
            />
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
