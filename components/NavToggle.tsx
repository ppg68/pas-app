"use client";

// Bottone per ridurre il menu laterale a una striscia stretta (piu spazio per le tabelle).
// Lo stato sta nell'attributo data-nav di <html> (vedi globals.css) ed e' ricordato nel browser.
import { useEffect } from "react";

const KEY = "oikos-nav-min";

export default function NavToggle() {
  useEffect(() => {
    try { document.documentElement.dataset.nav = localStorage.getItem(KEY) === "1" ? "min" : ""; } catch { /* ignora */ }
  }, []);
  function toggle() {
    const min = document.documentElement.dataset.nav !== "min";
    document.documentElement.dataset.nav = min ? "min" : "";
    try { localStorage.setItem(KEY, min ? "1" : "0"); } catch { /* ignora */ }
  }
  return (
    <button type="button" className="nav-toggle" onClick={toggle} title="Riduci o riapri il menu">
      <span className="nt-open">« Riduci</span><span className="nt-closed">»</span>
    </button>
  );
}
