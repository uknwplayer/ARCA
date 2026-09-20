import {appendFile,mkdir} from "node:fs/promises";import {dirname} from "node:path";
export async function audit(path,event,data={}){
 await mkdir(dirname(path),{recursive:true});
 const record={format:"arca-agent-audit-v1",at:new Date().toISOString(),event,...data};
 await appendFile(path,JSON.stringify(record)+"\n");
 return record;
}
