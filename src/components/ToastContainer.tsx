import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { ToastMessage } from '../types/lms';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (!toasts.length) return null;

  return (
    <div
      className="no-print fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[#e3e9f2] bg-white px-4 py-3 shadow-lg text-[#1d2940]"
          >
            {isSuccess ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#13845b] mt-0.5" />
            ) : isError ? (
              <AlertCircle className="h-5 w-5 shrink-0 text-[#c64b58] mt-0.5" />
            ) : (
              <Info className="h-5 w-5 shrink-0 text-[#315b9b] mt-0.5" />
            )}
            <div className="flex-1 text-sm leading-snug">
              <span className="sr-only">
                {isSuccess ? 'Success: ' : isError ? 'Error: ' : 'Notice: '}
              </span>
              {toast.message}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded-md p-1 text-[#718096] hover:bg-[#f3f6fb] hover:text-[#142746] transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
