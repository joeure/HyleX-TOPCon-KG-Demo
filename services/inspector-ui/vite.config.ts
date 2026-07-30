import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const gatewayProxy = loadEnv(mode, ".", "").VITE_DEV_GATEWAY_PROXY;
  const proxy = gatewayProxy
    ? {
        "/auth": { target: gatewayProxy, changeOrigin: true },
        "/inspector": { target: gatewayProxy, changeOrigin: true },
      }
    : undefined;
  return {
    plugins: [react()],
    server: { host: "127.0.0.1", port: 4173, strictPort: true, proxy },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  };
});
