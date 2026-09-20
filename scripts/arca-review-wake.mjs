#!/usr/bin/env node

import {resolve} from "node:path";
import {HumanReviewQueue,ReviewContinuationWakeController} from "../packages/agent/src/index.ts";

function valueOf(args,name,fallback){const index=args.indexOf(name);if(index<0)return fallback;if(!args[index+1])throw new Error(`${name} exige valor`);return args[index+1]}
function help(){process.stdout.write(`ARCA Review Wake Controller\n\nUso:\n  npm run review:wake -- [--home DIRETORIO] [--once]\n\nObserva a Human Review Queue e converte uma decisao autorizadora em um wake pointer\nduravel. Nao executa a continuacao; apenas sinaliza que ela pode ser retomada.\n`)}

try{
  const args=process.argv.slice(2);if(args.includes("--help")||args.includes("-h")){help();process.exit(0)}
  const home=resolve(valueOf(args,"--home",process.env.ARCA_HOME||".arca-workbench"));
  const queue=new HumanReviewQueue(home);const controller=new ReviewContinuationWakeController(queue,{onWake:event=>process.stdout.write(`${JSON.stringify(event)}\n`)});
  if(args.includes("--once")){const result=await controller.runOnce();process.stdout.write(`${JSON.stringify(result,null,2)}\n`);process.exit(0)}
  await controller.start();process.stdout.write(`ARCA Review Wake Controller ativo\nARCA_HOME: ${home}\n`);
  const shutdown=async()=>{await controller.stop();process.exit(0)};process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);
}catch(error){process.stderr.write(`Erro: ${error?.message??error}\n`);process.exit(1)}
