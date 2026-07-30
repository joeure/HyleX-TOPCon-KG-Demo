import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./design-system/tokens.css";
import "./design-system/global.css";

export type PublicRuntimeConfig = {
  publicDemo: boolean;
  gatewayBaseUrl: string;
  toyDataBaseUrl: string;
  backendStatus: "ready" | "preparing" | string;
};

const fallback: PublicRuntimeConfig = {
  publicDemo: true,
  gatewayBaseUrl: "",
  toyDataBaseUrl: "./toy-data",
  backendStatus: "preparing",
};

async function loadRuntimeConfig(): Promise<PublicRuntimeConfig> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}runtime-config.json`, { cache: "no-store" });
    if (!response.ok) return fallback;
    return { ...fallback, ...(await response.json() as Partial<PublicRuntimeConfig>) };
  } catch {
    return fallback;
  }
}

void loadRuntimeConfig().then((runtimeConfig) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode><App runtimeConfig={runtimeConfig} /></React.StrictMode>,
  );
});
