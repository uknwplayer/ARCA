import {AgentGateway,ARCA_AGENT_GATEWAY_RESULT_FORMAT} from "./gateway.ts";
import type {CreatorSession} from "./creator-control.ts";

export const CREATOR_CHAT_GATEWAY_FORMAT="arca-creator-chat-gateway-v1";
const SAFE_REQUEST_ID=/^[A-Za-z0-9._:-]{1,160}$/;
const CAPABILITY=/^[A-Za-z0-9._-]{1,80}$/;

export type CreatorChatGatewayOptions={
  requiredCapabilities?:string[];
  allowExternal?:boolean;
  preferredAgentId?:string;
};

export type CreatorChatGatewayInput={
  message:string;
  requestId:string;
  session:CreatorSession;
  context?:{home?:string};
};

function normalizeCapabilities(values:string[]|undefined){
  const input=values??["reasoning"];
  if(!Array.isArray(input)||input.length===0)throw new TypeError("Creator Chat requer ao menos uma capability");
  const normalized=[...new Set(input.map(value=>String(value).trim().toLowerCase()))].sort();
  for(const capability of normalized)if(!CAPABILITY.test(capability))throw new TypeError(`Creator Chat capability invalida: ${capability}`);
  return normalized;
}
function normalizeRequestId(value:string){if(typeof value!=="string"||!SAFE_REQUEST_ID.test(value))throw new TypeError("Creator Chat requestId invalido");return value}
function normalizeMessage(value:string){const message=String(value??"").trim();if(!message)throw new TypeError("Creator Chat message obrigatoria");if(message.length>16000)throw new RangeError("Creator Chat message excede 16000 caracteres");return message}
function normalizePreferredAgentId(value:string|undefined){if(value===undefined)return undefined;const id=String(value).trim();if(!/^[A-Za-z0-9._-]{1,80}$/.test(id))throw new TypeError("Creator Chat preferredAgentId invalido");return id}

export function createCreatorChatHandlerFromGateway(gateway:AgentGateway,options:CreatorChatGatewayOptions={}){
  if(!(gateway instanceof AgentGateway))throw new TypeError("AgentGateway obrigatorio");
  const requiredCapabilities=normalizeCapabilities(options.requiredCapabilities);
  const allowExternal=options.allowExternal===true;
  const preferredAgentId=normalizePreferredAgentId(options.preferredAgentId);

  return async function creatorChatGateway(input:CreatorChatGatewayInput){
    const requestId=normalizeRequestId(input?.requestId);
    const message=normalizeMessage(input?.message);
    const subject=String(input?.session?.subject??"").trim();
    if(!subject)throw new TypeError("Creator session subject obrigatorio");

    const result=await gateway.dispatch({
      taskId:requestId,
      task:message,
      requiredCapabilities,
      context:{
        channel:"arca-creator-console",
        requestId,
        creatorSubject:subject
      },
      humanReviewRequired:true
    },{
      allowExternal,
      ...(preferredAgentId?{preferredAgentId}:{})
    });

    if(result?.format!==ARCA_AGENT_GATEWAY_RESULT_FORMAT)throw new Error("Creator Chat recebeu formato inesperado do Agent Gateway");
    if(result.taskId!==requestId)throw new Error("Creator Chat perdeu correlacao de requestId");
    if(result.humanReviewRequired!==true)throw new Error("Creator Chat recusa resultado sem Human Review boundary");
    if(result.coreMutationPerformed!==false)throw new Error("Creator Chat recusa resultado que declare Core mutation");

    return Object.freeze({
      format:CREATOR_CHAT_GATEWAY_FORMAT,
      requestId,
      requiredCapabilities:[...requiredCapabilities],
      agent:result.agent,
      external:result.external===true,
      humanReviewRequired:true,
      coreMutationPerformed:false,
      output:result.output
    });
  };
}
