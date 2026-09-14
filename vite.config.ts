import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "自明 SELF",
        short_name: "自明",
        lang: "zh-CN",
        description: "个人计划、账本与会员管理",
        theme_color: "#326653",
        background_color: "#f7f8f5",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 4173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4174" },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4174" },
  },
});
