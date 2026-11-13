import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
const script = await readFile("public/assets/app.js", "utf8");
new vm.Script(script);
const html = await readFile("public/index.html", "utf8");
if (!html.includes("/assets/app.js"))
  throw Error("JavaScript da aplicação não referenciado.");
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await writeFile(
  "dist/version.json",
  JSON.stringify({ version: "2.0.0", builtAt: new Date().toISOString() }),
);
console.log("Build concluído: interface em dist/; API em netlify/functions/.");
