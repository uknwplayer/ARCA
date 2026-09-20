import {resolve} from "node:path";
import {
  CapabilityRegistry,
  CreatorWorkflowProposalService,
  CreatorWorkflowReasoningService,
  DurableReasoningPendingCoordinator,
  GuardedAutonomyWorkflowCoordinator,
  HumanReviewQueue,
  ReasoningOutputReviewGate,
  ReviewAutonomyRuntime,
  ReviewContinuationStore,
  ReviewGatedContinuation,
  createCreatorDurableReasoningHandlers
} from "../../agent/src/index.ts";
import {CREATOR_CONSOLE_VERSION,createCreatorConsoleServer,type CreatorConsoleOptions} from "./creator-server.ts";

export const CREATOR_INTEGRATED_RUNTIME_FORMAT="arca-creator-integrated-runtime-v1";
export const CREATOR_INTEGRATED_RUNTIME_VERSION="0.1.0";

type WorkflowClientLike={
  transport:{getResult:(jobId:string)=>Promise<any>|any};
  submit:(job:any,options?:any)=>Promise<any>|any;
  waitForResult:(job:any,options?:any)=>Promise<any>|any;
};

export type CreatorIntegratedRuntimeOptions={
  home:string;
  reasoningCoordinator:DurableReasoningPendingCoordinator;
  workflowClient:WorkflowClientLike;
  capabilityRegistry?:CapabilityRegistry;
  host?:string;
  port?:number;
  bootstrapTtlMs?:number;
  sessionTtlMs?:number;
  passkeyChallengeTtlMs?:number;
  workflowQueue?:string;
  workflowNotify?:boolean;
  workflowWaitTimeoutMs?:number;
  workflowPollIntervalMs?:number;
  reasoningPendingIntervalMs?:number;
  reviewDispatchRecoveryIntervalMs?:number;
  reviewDispatchBatchLimit?:number;
};

export class CreatorIntegratedRuntime{
  readonly home:string;
  readonly capabilityRegistry:CapabilityRegistry;
  readonly reasoningCoordinator:DurableReasoningPendingCoordinator;
  readonly reviews:HumanReviewQueue;
  readonly pointerStore:ReviewContinuationStore;
  readonly reviewGate:ReviewGatedContinuation;
  readonly reasoningOutputReviewGate:ReasoningOutputReviewGate;
  readonly workflow:GuardedAutonomyWorkflowCoordinator;
  readonly reviewRuntime:ReviewAutonomyRuntime;
  readonly proposals:CreatorWorkflowProposalService;
  readonly workflowReasoning:CreatorWorkflowReasoningService;
  readonly workflowReasoningRuntime:ReturnType<CreatorWorkflowReasoningService["createPendingRuntime"]>;
  readonly chatHandlers:ReturnType<typeof createCreatorDurableReasoningHandlers>;
  readonly console:ReturnType<typeof createCreatorConsoleServer>;
  private running=false;
  private address:any=null;

  constructor(options:CreatorIntegratedRuntimeOptions){
    if(!options?.home)throw new Error("home obrigatorio");
    if(!(options.reasoningCoordinator instanceof DurableReasoningPendingCoordinator))throw new TypeError("DurableReasoningPendingCoordinator obrigatorio");
    const home=resolve(options.home);
    if(resolve(options.reasoningCoordinator.store.home)!==home)throw new Error("reasoningCoordinator deve compartilhar o mesmo ARCA_HOME");
    const registry=options.capabilityRegistry??options.reasoningCoordinator.capabilityRegistry;
    if(!(registry instanceof CapabilityRegistry))throw new TypeError("CapabilityRegistry obrigatorio");
    const client=options.workflowClient as any;
    if(!client||typeof client.submit!=="function"||typeof client.waitForResult!=="function"||typeof client.transport?.getResult!=="function")throw new TypeError("workflowClient recuperavel obrigatorio");

    this.home=home;
    this.capabilityRegistry=registry;
    this.reasoningCoordinator=options.reasoningCoordinator;
    this.reviews=new HumanReviewQueue(home);
    this.pointerStore=new ReviewContinuationStore(home);
    this.reviewGate=new ReviewGatedContinuation(this.reviews,{continuationStore:this.pointerStore});
    this.reasoningOutputReviewGate=new ReasoningOutputReviewGate(this.reviews);
    this.workflow=new GuardedAutonomyWorkflowCoordinator({
      home,
      gate:this.reviewGate,
      client,
      queue:options.workflowQueue,
      notify:options.workflowNotify,
      waitTimeoutMs:options.workflowWaitTimeoutMs,
      pollIntervalMs:options.workflowPollIntervalMs
    });
    this.reviewRuntime=new ReviewAutonomyRuntime(this.reviews,[this.workflow.handler],{
      pointerStore:this.pointerStore,
      dispatchRecoveryIntervalMs:options.reviewDispatchRecoveryIntervalMs,
      dispatchBatchLimit:options.reviewDispatchBatchLimit
    });
    this.proposals=new CreatorWorkflowProposalService({
      home,
      registry:this.capabilityRegistry,
      workflow:this.workflow,
      reviewRuntime:this.reviewRuntime
    });
    this.workflowReasoning=new CreatorWorkflowReasoningService({
      coordinator:this.reasoningCoordinator,
      proposals:this.proposals,
      reviewGate:this.reasoningOutputReviewGate
    });
    this.workflowReasoningRuntime=this.workflowReasoning.createPendingRuntime({
      intervalMs:options.reasoningPendingIntervalMs??10_000
    });
    this.chatHandlers=createCreatorDurableReasoningHandlers(this.reasoningCoordinator,{
      outputReviewGate:this.reasoningOutputReviewGate
    });

    const consoleOptions:CreatorConsoleOptions={
      home,
      host:options.host,
      port:options.port,
      bootstrapTtlMs:options.bootstrapTtlMs,
      sessionTtlMs:options.sessionTtlMs,
      passkeyChallengeTtlMs:options.passkeyChallengeTtlMs,
      chatHandler:input=>this.chatHandlers.chat(input),
      chatStatusHandler:input=>this.chatHandlers.status(input),
      chatCollectHandler:input=>this.chatHandlers.collect(input),
      chatListHandler:input=>this.chatHandlers.list(input),
      workflowProposalService:this.proposals,
      workflowReasoningService:this.workflowReasoning
    };
    this.console=createCreatorConsoleServer(consoleOptions);
  }

  async start(){
    if(this.running)return this.address;
    await this.reviewRuntime.start();
    try{
      await this.workflowReasoningRuntime.start();
      this.address=await this.console.start();
      this.running=true;
      return this.address;
    }catch(error){
      await this.workflowReasoningRuntime.stop().catch(()=>{});
      await this.reviewRuntime.stop().catch(()=>{});
      throw error;
    }
  }

  async stop(){
    if(!this.running){
      await this.workflowReasoningRuntime.stop().catch(()=>{});
      await this.reviewRuntime.stop().catch(()=>{});
      return
    }
    this.running=false;
    await this.console.stop().catch(()=>{});
    await this.workflowReasoningRuntime.stop().catch(()=>{});
    await this.reviewRuntime.stop().catch(()=>{});
    this.address=null;
  }

  async runOnce(){
    const [reasoning,review]=await Promise.all([
      this.workflowReasoningRuntime.runOnce(),
      this.reviewRuntime.runOnce()
    ]);
    return Object.freeze({
      format:CREATOR_INTEGRATED_RUNTIME_FORMAT,
      version:CREATOR_INTEGRATED_RUNTIME_VERSION,
      reasoning,
      review
    });
  }

  status(){
    return Object.freeze({
      format:CREATOR_INTEGRATED_RUNTIME_FORMAT,
      version:CREATOR_INTEGRATED_RUNTIME_VERSION,
      running:this.running,
      localOnly:true,
      address:this.address?{url:this.address.url,passkeyUrl:this.address.passkeyUrl}:null,
      reviewRuntime:this.reviewRuntime.status(),
      workflowReasoningRuntime:this.workflowReasoningRuntime.status(),
      providerId:this.reasoningCoordinator.providerId,
      creatorConsoleVersion:CREATOR_CONSOLE_VERSION
    });
  }
}

export function createCreatorIntegratedRuntime(options:CreatorIntegratedRuntimeOptions){
  return new CreatorIntegratedRuntime(options);
}
