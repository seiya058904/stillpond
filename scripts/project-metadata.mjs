import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");
const project = JSON.parse(read("project.config.json"));
const check = process.argv.includes("--check");
function update(name, next) {
  if (read(name).replaceAll("\r\n", "\n") === next) return;
  if (check) throw new Error(`${name} differs from project.config.json. Run npm run sync:project.`);
  writeFileSync(new URL(name, root), next);
}
const pkg = JSON.parse(read("package.json"));
Object.assign(pkg, {
  name: project.slug, version: project.version, description: project.description,
  repository: { type: "git", url: `${project.repositoryUrl}.git` },
  homepage: project.siteUrl, bugs: { url: `${project.repositoryUrl}/issues` },
});
update("package.json", JSON.stringify(pkg, null, 2) + "\n");
const header = `<!-- project:start -->\n# ${project.name}\n\n${project.description}\n\n**V${project.version}** · [Open the pond](${project.siteUrl}) · [Source](${project.repositoryUrl})\n<!-- project:end -->`;
update("README.md", read("README.md").replaceAll("\r\n", "\n").replace(/<!-- project:start -->[\s\S]*?<!-- project:end -->/, header));
console.log(check ? "Project metadata matches." : "Project metadata synchronized.");
