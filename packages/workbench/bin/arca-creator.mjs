#!/usr/bin/env node

import {resolve} from "node:path";
import {createCreatorConsoleServer,DEFAULT_CREATOR_CONSOLE_PORT} from "../src/creator-server.ts";

function valueOf(args,name,fallback){const index=args.indexOf(name);if(index<0)return fallback;if(!args[index+1])throw new Error(`${name} exige um valor`);return args[index+1]}
function help(){process.stdout.write(`ARCA Creator Console 0.4.0\n\nUso:\n  arca-creator [--home DIRETORIO] [--host HOST] [--port PORTA]\n\nSegurança:\n  - aceita somente loopback (127.0.0.1/localhost/::1);\n  - para passkeys, abra a URL localhost exibida pelo launcher;\n  - o código bootstrap é efêmero/de uso único e abre somente chat/leitura;\n  - a primeira passkey pode ser cadastrada localmente após bootstrap explícito;\n  - login passkey cria sessão forte; ações high-risk ainda exigem step-up recente.\n\nO launcher standalone não inclui provedor de raciocínio. Um host integrado pode conectar\narca-primary por Creator Chat Gateway sem alterar o protocolo de autenticação.\n`)}

try{
  const args=process.argv.slice(2);if(args.includes("--help")||args.includes("-h")){help();process.exit(0)}
  const home=resolve(valueOf(args,"--home",process.env.ARCA_HOME||".arca-workbench"));const host=valueOf(args,"--host","127.0.0.1");const rawPort=valueOf(args,"--port",String(DEFAULT_CREATOR_CONSOLE_PORT));if(!/^\d+$/.test(rawPort))throw new Error(`Porta inválida: ${rawPort}`);
  const instance=createCreatorConsoleServer({home,host,port:Number(rawPort)});const address=await instance.start();
  process.stdout.write(`ARCA Creator Console 0.4.0\n${address.passkeyUrl}\nBind local: ${address.url}\nARCA_HOME: ${home}\n\nCódigo de desbloqueio (uso único; expira em ${address.bootstrap.expiresAt}):\n${address.bootstrap.code}\n\n`);
  const shutdown=async()=>{await instance.stop();process.exit(0)};process.once("SIGINT",shutdown);process.once("SIGTERM",shutdown);
}catch(error){process.stderr.write(`Erro: ${error?.message??error}\n`);process.exit(1)}
