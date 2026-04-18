import { defineConfig } from "vite";

// Vite config for an HTML/CSS/JS storefront.
// This enables use of import.meta.env.VITE_* variables in frontend code.
export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
});
