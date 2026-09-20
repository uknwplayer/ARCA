import {
  CapabilityRegistry,
  ReasoningProviderRegistry,
  createCreatorChatHandlerFromReasoningProvider,
  type CreatorReasoningAdapterOptions
} from "../../agent/src/index.ts";
import {
  createCreatorConsoleServer,
  type CreatorConsoleOptions
} from "./creator-server.ts";

export type CreatorReasoningConsoleOptions=Omit<CreatorConsoleOptions,"chatHandler">&{
  providers:ReasoningProviderRegistry;
  capabilities:CapabilityRegistry;
  reasoningOptions:CreatorReasoningAdapterOptions;
};

export function createCreatorConsoleWithReasoningProvider(options:CreatorReasoningConsoleOptions){
  if(!options||!(options.providers instanceof ReasoningProviderRegistry))throw new TypeError("ReasoningProviderRegistry obrigatorio para Creator Console");
  if(!(options.capabilities instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio para Creator Console");
  const {providers,capabilities,reasoningOptions,...consoleOptions}=options;
  return createCreatorConsoleServer({
    ...consoleOptions,
    chatHandler:createCreatorChatHandlerFromReasoningProvider(providers,capabilities,reasoningOptions)
  });
}
