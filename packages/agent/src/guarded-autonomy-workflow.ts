import {AutonomyWorkflowCoordinator,type AutonomyWorkflowInput} from "./autonomy-workflow.ts";
import {BudgetGuardedMachineBridgeClient,WorkflowExecutionBudgetStore,type WorkflowExecutionPolicy} from "./autonomy-workflow-guard.ts";
import {ReviewGatedContinuation} from "./review-continuation.ts";

export type GuardedAutonomyWorkflowInput=AutonomyWorkflowInput&{executionPolicy?:WorkflowExecutionPolicy};

export class GuardedAutonomyWorkflowCoordinator{
  readonly budgetStore:WorkflowExecutionBudgetStore;
  readonly guardedClient:BudgetGuardedMachineBridgeClient;
  readonly workflow:AutonomyWorkflowCoordinator;
  readonly store:AutonomyWorkflowCoordinator["store"];
  readonly handler:AutonomyWorkflowCoordinator["handler"];
  constructor(input:{home:string;gate:ReviewGatedContinuation;client:any;queue?:string;notify?:boolean;waitTimeoutMs?:number;pollIntervalMs?:number;now?:()=>number}){
    if(!(input?.gate instanceof ReviewGatedContinuation))throw new TypeError("ReviewGatedContinuation obrigatorio");if(!input.home)throw new Error("home obrigatorio");this.budgetStore=new WorkflowExecutionBudgetStore(input.home,{now:input.now});this.guardedClient=new BudgetGuardedMachineBridgeClient(input.client,this.budgetStore);this.workflow=new AutonomyWorkflowCoordinator({home:input.home,gate:input.gate,client:this.guardedClient,queue:input.queue,notify:input.notify,waitTimeoutMs:input.waitTimeoutMs,pollIntervalMs:input.pollIntervalMs});this.store=this.workflow.store;this.handler=this.workflow.handler;
  }
  async register(runtime:{registerIntent:(input:any)=>Promise<any>},input:GuardedAutonomyWorkflowInput){if(!input||typeof input!=="object")throw new TypeError("guarded workflow input invalido");const budget=await this.budgetStore.register({requestId:input.requestId,policy:input.executionPolicy??{}});const workflow=await this.workflow.register(runtime,input);return {...workflow,budget}}
}
