import { ModalProps } from "@/interfaces/IModal";
import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AiOutlineInfoCircle,
  AiOutlineCheckCircle,
  AiOutlineWarning,
  AiOutlineCloseCircle,
  AiOutlineClose,
} from "react-icons/ai";

const iconMap: Record<string, ReactNode> = {
  information: <AiOutlineInfoCircle className="h-6 w-6 text-blue-600" />,
  success: <AiOutlineCheckCircle className="h-6 w-6 text-emerald-600" />,
  warning: <AiOutlineWarning className="h-6 w-6 text-amber-600" />,
  danger: <AiOutlineCloseCircle className="h-6 w-6 text-rose-600" />,
};

const titleMap: Record<string, string> = {
  information: "Informasi",
  success: "Berhasil",
  warning: "Konfirmasi",
  danger: "Peringatan",
};

const iconBgMap: Record<string, string> = {
  information: "bg-blue-50",
  success: "bg-emerald-50",
  warning: "bg-amber-50",
  danger: "bg-rose-50",
};

export default function Modal({
  title,
  message,
  type = "information",
  onOk,
  onCancel,
  okText,
  cancelText,
  closeOnBackdrop = true,
  isLoading = false,
}: ModalProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCancel) {
        onCancel();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onCancel]);

  const showCancel = Boolean(onCancel);
  const resolvedTitle = title || titleMap[type];
  const resolvedOkText = okText || "OK";
  const resolvedCancelText = cancelText || "Batal";
  const okButtonClass =
    type === "danger"
      ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-200"
      : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-200";

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 p-4 backdrop-blur-[2px] [animation:modalFadeIn_.18s_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onCancel && closeOnBackdrop) {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label={resolvedTitle}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl [animation:modalPop_.24s_cubic-bezier(0.22,1,0.36,1)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl p-2 ${iconBgMap[type]}`}>{iconMap[type]}</div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">{resolvedTitle}</h3>
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{message}</p>
            </div>
          </div>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Tutup modal"
            >
              <AiOutlineClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resolvedCancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (onOk) {
                void onOk();
              }
            }}
            disabled={isLoading}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${okButtonClass}`}
          >
            {isLoading ? "Memproses..." : resolvedOkText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
