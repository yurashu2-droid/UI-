import type { Plugin } from "vite";
import { createSiteIngestMiddleware } from "./http.js";
/** Development/local-preview integration only; static production builds contain no capture service. */
export function raidCapturePlugin(): Plugin {
  return {
    name: "ui-raid-bounded-public-probe",
    configureServer(server) {
      server.middlewares.use(createSiteIngestMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createSiteIngestMiddleware());
    },
  };
}
