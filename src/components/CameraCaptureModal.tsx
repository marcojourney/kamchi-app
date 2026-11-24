import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, RotateCcw, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { compressImageToDataUrl } from '../lib/finance';

interface CameraCaptureModalProps {
  title: string;
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  title,
  onCapture,
  onClose,
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [cameraError, setCameraError] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(true);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopStream();
    setCameraError(false);
    setStarting(true);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(true);
      setStarting(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setCameraError(true);
    } finally {
      setStarting(false);
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    if (!previewUrl) {
      startCamera();
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [previewUrl, startCamera, stopStream]);

  const handleSnap = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    let dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    if (dataUrl.length > 180000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.52);
    }
    setPreviewUrl(dataUrl);
  };

  const handleFallbackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageToDataUrl(file, 640, 0.72);
    onCapture(compressed);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {title}
          </h3>
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : cameraError ? (
            <div className="p-6 text-center space-y-3">
              <Camera className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs text-slate-300 leading-relaxed">
                {t('borrowers.cameraUnavailable')}
              </p>
              <label className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer hover:bg-teal-700">
                <Upload className="w-4 h-4" />
                <span>{t('borrowers.uploadPhoto')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFallbackFile}
                />
              </label>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />
              {starting && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-xs text-slate-200">
                  {t('app.loading')}
                </div>
              )}
            </>
          )}
        </div>

        {!cameraError && !previewUrl && (
          <div className="flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() =>
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t('borrowers.switchCamera')}</span>
            </button>
            <button
              type="button"
              disabled={starting}
              onClick={handleSnap}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>{t('borrowers.takePhoto')}</span>
            </button>
          </div>
        )}

        {previewUrl && (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setPreviewUrl('')}
              className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('borrowers.retakePhoto')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                stopStream();
                onCapture(previewUrl);
              }}
              className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 text-xs font-semibold text-white hover:bg-teal-700"
            >
              <Check className="w-4 h-4" />
              <span>{t('borrowers.usePhoto')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
