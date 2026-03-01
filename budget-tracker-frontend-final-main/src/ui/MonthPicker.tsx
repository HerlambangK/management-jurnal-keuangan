"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCalendarAlt, FaChevronDown, FaChevronLeft, FaChevronRight } from "react-icons/fa";

type MonthPickerTheme = "glass" | "light";

interface MonthPickerProps {
  value: string;
  onChange: (month: string) => void;
  max?: string;
  min?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  quickCurrentLabel?: string;
  theme?: MonthPickerTheme;
  className?: string;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DEFAULT_MIN_MONTH = "2000-01";
const POPUP_WIDTH = 324;
const POPUP_HEIGHT_ESTIMATE = 330;
const POPUP_GAP = 10;

const getCurrentMonthKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const parseMonthKey = (value: string): { year: number; month: number } | null => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return { year, month };
};

const normalizeMonthKey = (value: string | undefined | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parseMonthKey(trimmed) ? trimmed : null;
};

const toComparableMonth = (year: number, month: number): number => year * 12 + month;

const formatMonthLabel = (monthKey: string, fallbackLabel: string): string => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return fallbackLabel;
  const date = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallbackLabel;
  return date.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
};

export default function MonthPicker({
  value,
  onChange,
  max,
  min = DEFAULT_MIN_MONTH,
  allowEmpty = false,
  emptyLabel = "Pilih bulan",
  quickCurrentLabel = "Bulan Ini",
  theme = "light",
  className = "",
}: MonthPickerProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const currentMonth = useMemo(() => getCurrentMonthKey(), []);
  const selectedMonth = normalizeMonthKey(value);
  const maxMonth = normalizeMonthKey(max) || currentMonth;
  const minMonth = normalizeMonthKey(min) || DEFAULT_MIN_MONTH;

  const parsedMin = parseMonthKey(minMonth)!;
  const parsedMax = parseMonthKey(maxMonth)!;
  const minComparable = toComparableMonth(parsedMin.year, parsedMin.month);
  const maxComparable = toComparableMonth(parsedMax.year, parsedMax.month);

  const hasPrevYear = toComparableMonth(viewYear - 1, 12) >= minComparable;
  const hasNextYear = toComparableMonth(viewYear + 1, 1) <= maxComparable;

  const triggerLabel = selectedMonth ? formatMonthLabel(selectedMonth, emptyLabel) : emptyLabel;

  const baseTriggerClass =
    "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium outline-none transition focus:ring-4";
  const themeTriggerClass =
    theme === "glass"
      ? "border-white/35 bg-white/15 text-white hover:bg-white/25 focus:ring-white/40"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus:ring-indigo-100";

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left;
    if (left + POPUP_WIDTH > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - POPUP_WIDTH - 12);
    }

    let top = rect.bottom + POPUP_GAP;
    const shouldOpenUpward =
      top + POPUP_HEIGHT_ESTIMATE > viewportHeight - 12 &&
      rect.top - POPUP_GAP - POPUP_HEIGHT_ESTIMATE >= 12;

    if (shouldOpenUpward) {
      top = Math.max(12, rect.top - POPUP_HEIGHT_ESTIMATE - POPUP_GAP);
    }

    setPosition({ top, left });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = !!triggerRef.current && triggerRef.current.contains(target);
      const clickedPanel = !!panelRef.current && panelRef.current.contains(target);
      if (!clickedTrigger && !clickedPanel) {
        setOpen(false);
      }
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEsc);

    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  useEffect(() => {
    const parsedSelected = parseMonthKey(selectedMonth || "");
    if (parsedSelected) {
      setViewYear(parsedSelected.year);
      return;
    }

    const parsedCurrent = parseMonthKey(currentMonth);
    if (parsedCurrent) {
      setViewYear(parsedCurrent.year);
    }
  }, [currentMonth, selectedMonth]);

  const handleSelectMonth = (year: number, monthNumber: number) => {
    const monthKey = `${year}-${String(monthNumber).padStart(2, "0")}`;
    onChange(monthKey);
    setOpen(false);
  };

  const handleSelectCurrentMonth = () => {
    onChange(currentMonth);
    setOpen(false);
  };

  const isMonthDisabled = (year: number, monthNumber: number): boolean => {
    const comparable = toComparableMonth(year, monthNumber);
    return comparable < minComparable || comparable > maxComparable;
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${baseTriggerClass} ${themeTriggerClass} ${className}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <FaCalendarAlt className="h-3.5 w-3.5" />
        <span>{triggerLabel}</span>
        <FaChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Pilih bulan"
              className="fixed z-[95] w-[324px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl"
              style={{ top: position.top, left: position.left }}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => hasPrevYear && setViewYear((prev) => prev - 1)}
                  disabled={!hasPrevYear}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Tahun sebelumnya"
                >
                  <FaChevronLeft className="h-3 w-3" />
                </button>
                <div className="min-w-[110px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-sm font-semibold text-slate-700">
                  {viewYear}
                </div>
                <button
                  type="button"
                  onClick={() => hasNextYear && setViewYear((prev) => prev + 1)}
                  disabled={!hasNextYear}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Tahun berikutnya"
                >
                  <FaChevronRight className="h-3 w-3" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {MONTH_LABELS.map((monthLabel, index) => {
                  const monthNumber = index + 1;
                  const monthKey = `${viewYear}-${String(monthNumber).padStart(2, "0")}`;
                  const isSelected = selectedMonth === monthKey;
                  const disabled = isMonthDisabled(viewYear, monthNumber);

                  return (
                    <button
                      key={monthKey}
                      type="button"
                      onClick={() => handleSelectMonth(viewYear, monthNumber)}
                      disabled={disabled}
                      className={`h-10 rounded-lg text-sm font-medium transition ${
                        disabled
                          ? "cursor-not-allowed bg-slate-100 text-slate-300"
                          : isSelected
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
                      }`}
                    >
                      {monthLabel}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                {allowEmpty ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
                  >
                    {emptyLabel}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Pilih periode analisis</span>
                )}
                <button
                  type="button"
                  onClick={handleSelectCurrentMonth}
                  className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
                >
                  {quickCurrentLabel}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
