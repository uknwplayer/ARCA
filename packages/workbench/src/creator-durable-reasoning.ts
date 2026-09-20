import {
  DurableReasoningPendingCoordinator,
  createCreatorDurableReasoningHandlers,
  type CreatorDurableReasoningOptions
} from "../../agent/src/index.ts";
import {
  createCreatorConsoleServer,
  type CreatorConsoleOptions
} from "./creator-server.ts";

export type CreatorDurableReasoningConsoleOptions=Omit<
  CreatorConsoleOptions,
  "chatHandler"|"chatStatusHandler"|"chatCollectHandler"|"chatListHandler"
>&{
  coordinator:DurableReasoningPendingCoordinator;
  reasoningOptions?:CreatorDurableReasoningOptions;
};

export function createCreatorConsoleWithDurableReasoning(options:CreatorDurableReasoningConsoleOptions){
  if(!options||!(options.coordinator instanceof DurableReasoningPendingCoordinator))throw new TypeError("DurableReasoningPendingCoordinator obrigatorio para Creator Console");
  const {coordinator,reasoningOptions,...consoleOptions}=options;
  const handlers=createCreatorDurableReasoningHandlers(coordinator,reasoningOptions);
  return createCreatorConsoleServer({
    ...consoleOptions,
    chatHandler:handlers.chat,
    chatStatusHandler:handlers.status,
    chatCollectHandler:handlers.collect,
    chatListHandler:handlers.list
  });
}
