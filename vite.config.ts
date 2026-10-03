import path from "node:path";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import project from "./project.config.json" with { type: "json" };
import { messages } from "./src/i18n/catalog.ts";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? new URL(project.siteUrl).pathname : "/",
  plugins: [react(), tailwindcss(), {
    name: "project-metadata",
    transformIndexHtml(html) {
      const values: Record<string, string> = {
        PROJECT_NAME: project.name,
        PROJECT_SITE: project.siteUrl,
        PAGE_TITLE: messages["page.title"][0].replace("{name}", project.name),
        PAGE_DESCRIPTION: messages["page.description"][0],
        NO_SCRIPT_EN: messages["page.noScript"][0],
        NO_SCRIPT_ZH: messages["page.noScript"][1],
      };
      return html.replace(/__(\w+)__/g, (token, key: string) => key in values ? escapeHtml(values[key]) : token);
    },
    generateBundle() {
      for (const fileName of ["LICENSE", "NOTICE"]) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(new URL(fileName, import.meta.url), "utf8") });
      }
      this.emitFile({ type: "asset", fileName: ".nojekyll", source: "" });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n\nSitemap: ${project.siteUrl}sitemap.xml\n` });
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(project.siteUrl)}</loc></url></urlset>\n` });
      this.emitFile({ type: "asset", fileName: "build-info.json", source: JSON.stringify({
        name: project.name, version: project.version,
        commit: process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      }) + "\n" });
    },
  }],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
}));
