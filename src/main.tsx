import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ZiyangAgent from "./ui/ZiyangAgent";
import { createTransport } from "./agent/transport";
import { setByokKey } from "./agent/config";
import "./ui/agent.css";

/* Local development without the proxy: paste a DeepSeek key once from the console.
 *
 *   ziyangAgentKey("sk-…")   store it and reload
 *   ziyangAgentKey(null)     forget it
 *
 * It lives in localStorage on your machine only. Kept off the page on purpose — a visible
 * key field on a public site is an invitation to paste a key into someone else's page. */
declare global {
  interface Window {
    ziyangAgentKey: (key: string | null) => void;
  }
}

window.ziyangAgentKey = (key) => {
  setByokKey(key);
  location.reload();
};

const root = document.getElementById("root");
if (!root) throw new Error("no #root element");

createRoot(root).render(
  <StrictMode>
    <ZiyangAgent transport={createTransport()} />
  </StrictMode>,
);
