"use client";

import { useState } from "react";

/**
 * Amount field in European format: "1.234,56" when idle, plain "1234,56" while typing.
 * Accepts "1234.56", "1234,56" and "1.234,56". The value reported to the page (and submitted in
 * forms through a hidden input) is always the plain number with a dot: "1234.56".
 */

/** "1.234,56" / "1234,56" / "1234.56" / "1.234" -> "1234.56" / "1234.56" / "1234.56" / "1234". Empty if not a number. */
export function normalizeAmount(text: string): string {
  let t = text.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!t) return "";
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // "1.234" / "12.345.678": thousands separators
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? String(n) : "";
}

const fmt = (n: number) =>
  n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
const raw = (n: number) =>
  n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false });

export default function MoneyInput({
  value,
  defaultValue,
  name,
  required,
  placeholder,
  style,
  className,
  title,
  onValueChange,
  onCommit,
  onEnter,
}: {
  /** controlled value (number, or a string with a dot) */
  value?: string | number | null;
  defaultValue?: string | number | null;
  name?: string;
  required?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
  title?: string;
  /** called on every change with the plain number ("1234.56", or "" when empty) */
  onValueChange?: (v: string) => void;
  /** called when the field loses focus with the plain number */
  onCommit?: (v: string) => void;
  onEnter?: () => void;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState<string>(
    defaultValue === null || defaultValue === undefined ? "" : String(defaultValue)
  );
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");

  const current = controlled ? (value === null ? "" : String(value)) : inner;
  const currentNum = current === "" ? NaN : parseFloat(current);

  const shown = focused ? text : Number.isFinite(currentNum) ? fmt(currentNum) : "";
  const plain = focused ? normalizeAmount(text) : Number.isFinite(currentNum) ? String(currentNum) : "";

  return (
    <>
      {name && <input type="hidden" name={name} value={plain} />}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        title={title}
        className={className}
        style={{ textAlign: "right", ...style }}
        value={shown}
        onFocus={() => {
          setText(Number.isFinite(currentNum) ? raw(currentNum) : "");
          setFocused(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = normalizeAmount(e.target.value);
          if (!controlled) setInner(n);
          onValueChange?.(n);
        }}
        onBlur={() => {
          const n = normalizeAmount(text);
          setFocused(false);
          if (!controlled) setInner(n);
          onValueChange?.(n);
          onCommit?.(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
    </>
  );
}
