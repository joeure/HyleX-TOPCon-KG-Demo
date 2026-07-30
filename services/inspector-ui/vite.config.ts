import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const gatewayProxy = env.VITE_DEV_GATEWAY_PROXY;
  const proxy = gatewayProxy
    ? {
        "/auth": { target: gatewayProxy, changeOrigin: true },
        "/inspector": { target: gatewayProxy, changeOrigin: true },
      }
    : undefined;
  return {
    plugins: [react()],
    base: env.VITE_GITHUB_PAGES === "true" ? "/HyleX-TOPCon-KG-Demo/" : "/",
    server: { host: "127.0.0.1", port: 4173, strictPort: true, proxy },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  };
});
