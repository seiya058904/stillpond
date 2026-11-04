import type { ADVANCED_GROUPS } from "./advanced";

export type AdvancedGroupId = (typeof ADVANCED_GROUPS)[number]["id"];
/** The settings hierarchy: root, the Advanced list, then one drill-down page per group. */
export type PreferencePage = "root" | "advanced" | `advanced/${AdvancedGroupId}`;

export const pageDepth = (page: PreferencePage): number => page === "root" ? 0 : page === "advanced" ? 1 : 2;
export const parentPage = (page: PreferencePage): PreferencePage => page === "root" || page === "advanced" ? "root" : "advanced";
export const pageGroup = (page: PreferencePage): AdvancedGroupId | null =>
  page.startsWith("advanced/") ? page.slice("advanced/".length) as AdvancedGroupId : null;
