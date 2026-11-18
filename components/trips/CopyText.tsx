"use client";

import { useState } from "react";

/** The text of a field in a box with a "Copia il testo" button, to paste it into the supporting documents. */
export default function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // older browsers: select a temporary field
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <button type="button" className="ghost" onClick={() => void copy()}>
          {done ? "Copiato ✓" : "Copia il testo"}
        </button>
      </div>
      <div
        style={{
          whiteSpace: "pre-wrap",
          fontSize: "0.9rem",
          background: "var(--surface-alt, #f6f7f9)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "10px 12px",
          userSelect: "text",
        }}
      >
        {text}
      </div>
    </div>
  );
}
