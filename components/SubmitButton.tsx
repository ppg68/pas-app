"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that is disabled while the form is being sent, so a double click cannot
 * create the same record twice.
 */
export default function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "primary",
  style,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} style={style} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
