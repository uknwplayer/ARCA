import {readFile} from "node:fs/promises";
import {posix} from "node:path";

const SOURCE_EXTENSIONS=new Set([".js",".mjs",".cjs",".ts",".mts",".cts"]);
const STATIC_SPECIFIER_PATTERNS=[
  /\b(?:import|export)\s+(?:[^"'\n;]+?\s+from\s+)?["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
];

function candidates(importer,specifier){
  const base=posix.normalize(posix.join(posix.dirname(importer),specifier));
  const ext=posix.extname(base);
  if(ext)return [base];
  return [base,...[".js",".mjs",".cjs",".ts",".mts",".cts",".json"].map(x=>base+x),...["index.js","index.mjs","index.cjs","index.ts","index.mts","index.cts","index.json"].map(x=>posix.join(base,x))];
}

export function staticRelativeSpecifiers(text){
  const out=new Set();
  for(const pattern of STATIC_SPECIFIER_PATTERNS){
    pattern.lastIndex=0;
    for(let match;(match=pattern.exec(text));)if(match[1]?.startsWith("."))out.add(match[1]);
  }
  return [...out].sort();
}

export async function scanStaticPublicDependencyClosure(included){
  const paths=new Set(included.map(file=>file.path));
  const violations=[];
  for(const file of included){
    if(!SOURCE_EXTENSIONS.has(posix.extname(file.path)))continue;
    const text=(await readFile(file.absolutePath)).toString("utf8");
    for(const specifier of staticRelativeSpecifiers(text)){
      const options=candidates(file.path,specifier);
      if(options.some(path=>paths.has(path)))continue;
      violations.push(Object.freeze({
        path:file.path,
        kind:"public-static-dependency-missing",
        rule:specifier
      }));
    }
  }
  return Object.freeze(violations);
}
