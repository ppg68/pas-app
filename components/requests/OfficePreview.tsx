"use client";

import { useEffect, useRef, useState } from "react";

const MAX_ROWS = 500;

type Sheet = { sheet: string; data: unknown[][] };

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toLocaleDateString("en-GB");
  return String(v);
}

/** In-browser preview of a Word (.docx) or Excel (.xlsx) file: the file never leaves the browser. */
export default function OfficePreview({ blob, kind }: { blob: Blob; kind: "docx" | "xlsx" }) {
  const box = useRef<HTMLDivElement>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (kind === "docx") {
          const { renderAsync } = await import("docx-preview");
          if (cancelled || !box.current) return;
          box.current.innerHTML = "";
          await renderAsync(blob, box.current, undefined, { inWrapper: true, ignoreWidth: false });
        } else {
          const { default: readXlsxFile } = await import("read-excel-file/browser");
          const res = (await readXlsxFile(blob)) as Sheet[];
          if (!cancelled) setSheets(res);
        }
      } catch {
        if (!cancelled) setError("This file cannot be previewed here: download it to open it.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, kind]);

  if (error) return <div style={{ padding: 16, fontSize: 13, color: "var(--brick)" }}>{error}</div>;

  if (kind === "docx") return <div ref={box} style={{ flex: 1, overflow: "auto", background: "#f3f4f6", padding: 8 }} />;

  const sheet = sheets?.[active];
  const rows = sheet ? sheet.data.slice(0, MAX_ROWS) : [];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {sheets && sheets.length > 1 && (
        <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          {sheets.map((s, i) => (
            <button
              key={s.sheet + i}
              type="button"
              onClick={() => setActive(i)}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 999,
                padding: "2px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: i === active ? "var(--navy)" : "transparent",
                color: i === active ? "#fff" : "var(--ink)",
              }}
            >
              {s.sheet}
            </button>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {!sheets ? (
          <span style={{ fontSize: 13 }}>Loading…</span>
        ) : (
          <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} style={{ border: "1px solid var(--line)", padding: "2px 6px", whiteSpace: "nowrap" }}>
                      {cellText(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sheet && sheet.data.length > MAX_ROWS && (
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
            First {MAX_ROWS} rows shown ({sheet.data.length} in total): download the file to see all.
          </div>
        )}
      </div>
    </div>
  );
}
