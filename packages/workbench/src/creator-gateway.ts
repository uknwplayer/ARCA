import {
  AgentGateway,
  createCreatorChatHandlerFromGateway,
  type CreatorChatGatewayOptions
} from "../../agent/src/index.ts";
import {
  createCreatorConsoleServer,
  type CreatorConsoleOptions
} from "./creator-server.ts";

export type CreatorGatewayConsoleOptions=Omit<CreatorConsoleOptions,"chatHandler">&{
  gateway:AgentGateway;
  gatewayOptions?:CreatorChatGatewayOptions;
};

export function createCreatorConsoleWithGateway(options:CreatorGatewayConsoleOptions){
  if(!options||!(options.gateway instanceof AgentGateway))throw new TypeError("AgentGateway obrigatorio para Creator Console Gateway");
  const {gateway,gatewayOptions,...consoleOptions}=options;
  return createCreatorConsoleServer({
    ...consoleOptions,
    chatHandler:createCreatorChatHandlerFromGateway(gateway,gatewayOptions)
  });
}
