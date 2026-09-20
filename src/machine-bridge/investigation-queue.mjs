import fs from "node:fs";
import path from "node:path";
import {createHash,randomBytes} from "node:crypto";

export const INVESTIGATION_QUEUE_SCHEMA="arca.shared-investigation-queue.v0.1";
export const INVESTIGATION_RECORD_SCHEMA="arca.shared-investigation.v0.1";
export const INVESTIGATION_LEASE_SCHEMA="arca.investigation-lease.v0.1";

const TRIGGERS=new Set([
  "AUTONOMOUS_ANOMALY","PUBLIC_SOURCE_CHANGE","HUMAN_REQUEST",
  "HUMAN_PUBLIC_SOURCE","HUMAN_DISPUTE","SCHEDULED_REVIEW"
]);
const CONTRIBUTIONS=new Set(["WATCH","COMMENT","CONFIRMATION","PUBLIC_SOURCE","DISPUTE","DEEPEN_REQUEST"]);
const WAKE_CONTRIBUTIONS=new Set(["PUBLIC_SOURCE","DISPUTE","DEEPEN_REQUEST"]);
const STATES=new Set(["LEAD","TRIAGE","COLLECTION","ANALYSIS","ADVERSARIAL_VERIFICATION","HUMAN_REVIEW","PUBLICABLE","INCONCLUSIVE","REFUTED","ARCHIVED"]);
const TRANSITIONS={
  LEAD:new Set(["TRIAGE","ARCHIVED"]),
  TRIAGE:new Set(["COLLECTION","INCONCLUSIVE","ARCHIVED"]),
  COLLECTION:new Set(["ANALYSIS","INCONCLUSIVE","ARCHIVED"]),
  ANALYSIS:new Set(["ADVERSARIAL_VERIFICATION","COLLECTION","INCONCLUSIVE"]),
  ADVERSARIAL_VERIFICATION:new Set(["HUMAN_REVIEW","ANALYSIS","REFUTED","INCONCLUSIVE"]),
  HUMAN_REVIEW:new Set(["PUBLICABLE","ANALYSIS","REFUTED","INCONCLUSIVE","ARCHIVED"]),
  PUBLICABLE:new Set(["HUMAN_REVIEW","ARCHIVED"]),
  INCONCLUSIVE:new Set(["COLLECTION","ARCHIVED"]),
  REFUTED:new Set(["HUMAN_REVIEW","ARCHIVED"]),
  ARCHIVED:new Set()
};
const TERMINAL=new Set(["ARCHIVED"]);

function digest(value){return createHash("sha256").update(JSON.stringify(value)).digest("hex")}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function nowDate(clock){
  const value=clock();
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_CLOCK");
  return date;
}
function normalized(value,field,max=256){
  const text=String(value??"").normalize("NFKC").trim().toLowerCase().replace(/\s+/g," ");
  if(!text||text.length>max||/[\u0000-\u001f\u007f]/.test(text))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_"+field);
  return text;
}
function reference(value,field,max=512){
  const text=String(value??"").normalize("NFKC").trim();
  if(!text||text.length>max||/[\u0000-\u001f\u007f]/.test(text))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_"+field);
  if(/^(?:data|file|javascript):/i.test(text))throw new Error("ARCA_INVESTIGATION_QUEUE_UNSAFE_"+field);
  if(/(?:password|api[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]/i.test(text))throw new Error("ARCA_INVESTIGATION_QUEUE_SECRET_LIKE_"+field);
  return text;
}
function safeActor(value,field="ACTOR"){
  const text=String(value??"").trim();
  if(!/^[A-Za-z0-9_.:@-]{1,128}$/.test(text))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_"+field);
  return text;
}
function validId(value){return typeof value==="string"&&/^investigation-[0-9a-f]{24}$/.test(value)}
function toScopes(values){
  if(!Array.isArray(values)||values.length===0)throw new Error("ARCA_INVESTIGATION_QUEUE_SOURCE_SCOPES_REQUIRED");
  return [...new Set(values.map(value=>normalized(value,"SOURCE_SCOPE")))].sort();
}

export function canonicalInvestigationId(scope={}){
  const body={
    jurisdiction:normalized(scope.jurisdiction,"JURISDICTION"),
    subjectRef:normalized(scope.subjectRef,"SUBJECT_REF"),
    topic:normalized(scope.topic,"TOPIC"),
    timeWindow:normalized(scope.timeWindow,"TIME_WINDOW"),
    sourceScopes:toScopes(scope.sourceScopes)
  };
  return {investigationId:"investigation-"+digest(body).slice(0,24),canonicalScope:body};
}

export function createDurableInvestigationQueue({
  root,
  fsImpl=fs,
  clock=()=>new Date(),
  lockStaleMs=30000
}={}){
  if(!root)throw new Error("ARCA_INVESTIGATION_QUEUE_ROOT_REQUIRED");
  if(!Number.isFinite(lockStaleMs)||lockStaleMs<1000||lockStaleMs>300000)throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_LOCK_TTL");
  const investigationsDir=path.join(root,"investigations");
  const leasesDir=path.join(root,"leases");
  const locksDir=path.join(root,"locks");
  const tmpDir=path.join(root,"tmp");
  for(const dir of [investigationsDir,leasesDir,locksDir,tmpDir])fsImpl.mkdirSync(dir,{recursive:true});

  const investigationPath=id=>path.join(investigationsDir,id+".json");
  const leasePath=id=>path.join(leasesDir,id+".json");
  const lockPath=id=>path.join(locksDir,id+".lock");
  const readJson=file=>fsImpl.existsSync(file)?JSON.parse(fsImpl.readFileSync(file,"utf8")):null;

  function atomicWrite(file,value){
    const tmp=path.join(tmpDir,path.basename(file)+"."+process.pid+"."+randomBytes(6).toString("hex")+".tmp");
    let fd=null;
    try{
      fd=fsImpl.openSync(tmp,"wx",0o600);
      fsImpl.writeFileSync(fd,JSON.stringify(value)+"\n","utf8");
      fsImpl.fsyncSync?.(fd);
      fsImpl.closeSync(fd);fd=null;
      fsImpl.renameSync(tmp,file);
      try{const dfd=fsImpl.openSync(path.dirname(file),"r");fsImpl.fsyncSync?.(dfd);fsImpl.closeSync(dfd)}catch{}
    }finally{
      if(fd!==null)try{fsImpl.closeSync(fd)}catch{}
      if(fsImpl.existsSync(tmp))try{fsImpl.unlinkSync(tmp)}catch{}
    }
  }

  function acquireLock(id){
    const file=lockPath(id);
    const attempt=()=>{
      try{
        const fd=fsImpl.openSync(file,"wx",0o600);
        fsImpl.writeFileSync(fd,JSON.stringify({pid:process.pid,acquiredAt:nowDate(clock).toISOString()})+"\n","utf8");
        fsImpl.fsyncSync?.(fd);
        return fd;
      }catch(error){
        if(error?.code!=="EEXIST")throw error;
        const age=nowDate(clock).getTime()-fsImpl.statSync(file).mtimeMs;
        if(age>lockStaleMs){fsImpl.unlinkSync(file);return attempt()}
        throw new Error("ARCA_INVESTIGATION_QUEUE_BUSY");
      }
    };
    return {file,fd:attempt()};
  }
  function withLock(id,operation){
    if(!validId(id))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_ID");
    const lock=acquireLock(id);
    try{return operation()}finally{try{fsImpl.closeSync(lock.fd)}catch{};try{fsImpl.unlinkSync(lock.file)}catch{}}
  }
  function persist(record){atomicWrite(investigationPath(record.investigationId),record);return clone(record)}
  function loadRequired(id){
    if(!validId(id))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_ID");
    const record=readJson(investigationPath(id));
    if(!record)throw new Error("ARCA_INVESTIGATION_QUEUE_NOT_FOUND");
    return record;
  }
  function touch(record,at){record.updatedAt=at;record.revision+=1;return persist(record)}
  function activeLease(lease,at){
    return lease?.status==="claimed"&&Number.isFinite(Date.parse(lease.leaseExpiresAt))&&Date.parse(lease.leaseExpiresAt)>at.getTime();
  }

  return Object.freeze({
    schema:INVESTIGATION_QUEUE_SCHEMA,

    request({scope,triggerKind,triggerRef,participantRef=null,priority=0}={}){
      if(!TRIGGERS.has(triggerKind))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_TRIGGER");
      const triggerReference=reference(triggerRef,"TRIGGER_REF");
      if(!Number.isInteger(priority)||priority<0||priority>100)throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_PRIORITY");
      const {investigationId,canonicalScope}=canonicalInvestigationId(scope);
      return withLock(investigationId,()=>{
        const at=nowDate(clock).toISOString();
        let record=readJson(investigationPath(investigationId));
        const created=!record;
        if(!record)record={
          schema:INVESTIGATION_RECORD_SCHEMA,investigationId,canonicalScope,state:"LEAD",
          priority,subscribers:[],triggers:[],contributions:[],pendingWakeReasons:[],
          revision:0,createdAt:at,updatedAt:at
        };
        let changed=created;
        let subscribed=false;
        if(participantRef!==null){
          const actor=safeActor(participantRef,"PARTICIPANT");
          if(!record.subscribers.includes(actor)){record.subscribers.push(actor);record.subscribers.sort();changed=true;subscribed=true}
        }
        const triggerId=digest([triggerKind,triggerReference]);
        const awakened=!record.triggers.some(item=>item.triggerId===triggerId);
        if(awakened){
          record.triggers.push({triggerId,kind:triggerKind,reference:triggerReference,receivedAt:at});
          record.pendingWakeReasons.push(triggerId);
          changed=true;
        }
        if(priority>record.priority){record.priority=priority;changed=true}
        if(changed)touch(record,at);
        return {record:clone(record),created,awakened,subscribed};
      });
    },

    contribute(investigationId,{participantRef,kind,reference:inputReference}={}){
      if(!CONTRIBUTIONS.has(kind))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_CONTRIBUTION");
      const actor=safeActor(participantRef,"PARTICIPANT");
      const contributionReference=reference(inputReference,"CONTRIBUTION_REF");
      return withLock(investigationId,()=>{
        const record=loadRequired(investigationId);
        const at=nowDate(clock).toISOString();
        const contributionId=digest([actor,kind,contributionReference]);
        if(record.contributions.some(item=>item.contributionId===contributionId))return {record:clone(record),stored:false,awakened:false};
        record.contributions.push({contributionId,participantRef:actor,kind,reference:contributionReference,receivedAt:at});
        if(!record.subscribers.includes(actor)){record.subscribers.push(actor);record.subscribers.sort()}
        const awakened=WAKE_CONTRIBUTIONS.has(kind);
        if(awakened&&!record.pendingWakeReasons.includes(contributionId))record.pendingWakeReasons.push(contributionId);
        touch(record,at);
        return {record:clone(record),stored:true,awakened};
      });
    },

    transition(investigationId,targetState,{humanReviewed=false}={}){
      if(!STATES.has(targetState))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_STATE");
      return withLock(investigationId,()=>{
        const record=loadRequired(investigationId);
        if(!TRANSITIONS[record.state]?.has(targetState))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_TRANSITION");
        if(targetState==="PUBLICABLE"&&humanReviewed!==true)throw new Error("ARCA_INVESTIGATION_QUEUE_HUMAN_REVIEW_REQUIRED");
        record.state=targetState;
        return touch(record,nowDate(clock).toISOString());
      });
    },

    claim(investigationId,{workerId,leaseMs=60000}={}){
      const worker=safeActor(workerId,"WORKER");
      if(!Number.isFinite(leaseMs)||leaseMs<=0||leaseMs>300000)throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_LEASE");
      return withLock(investigationId,()=>{
        const record=loadRequired(investigationId);
        const at=nowDate(clock);
        if(TERMINAL.has(record.state)||record.pendingWakeReasons.length===0)return {acquired:false,reason:"no-work",record:clone(record),lease:null};
        const previous=readJson(leasePath(investigationId));
        if(activeLease(previous,at))return {acquired:false,reason:"leased",record:clone(record),lease:clone(previous)};
        const lease={
          schema:INVESTIGATION_LEASE_SCHEMA,investigationId,workerId,status:"claimed",
          attempt:(previous?.attempt??0)+1,claimedAt:at.toISOString(),
          leaseExpiresAt:new Date(at.getTime()+leaseMs).toISOString(),
          wakeReasons:[...record.pendingWakeReasons].sort(),completedAt:null,outcome:null
        };
        atomicWrite(leasePath(investigationId),lease);
        return {acquired:true,reason:previous?"recovered":"claimed",record:clone(record),lease:clone(lease)};
      });
    },

    claimNext(options={}){
      const records=this.list().filter(record=>!TERMINAL.has(record.state)&&record.pendingWakeReasons.length>0)
        .sort((a,b)=>b.priority-a.priority||a.createdAt.localeCompare(b.createdAt)||a.investigationId.localeCompare(b.investigationId));
      for(const record of records){
        const result=this.claim(record.investigationId,options);
        if(result.acquired)return result;
      }
      return {acquired:false,reason:"empty",record:null,lease:null};
    },

    renew(investigationId,{workerId,leaseMs=60000}={}){
      const worker=safeActor(workerId,"WORKER");
      if(!Number.isFinite(leaseMs)||leaseMs<=0||leaseMs>300000)throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_LEASE");
      return withLock(investigationId,()=>{
        const at=nowDate(clock);
        const lease=readJson(leasePath(investigationId));
        if(!activeLease(lease,at))throw new Error("ARCA_INVESTIGATION_QUEUE_LEASE_EXPIRED");
        if(lease.workerId!==worker)throw new Error("ARCA_INVESTIGATION_QUEUE_LEASE_OWNER_MISMATCH");
        lease.leaseExpiresAt=new Date(at.getTime()+leaseMs).toISOString();
        atomicWrite(leasePath(investigationId),lease);
        return clone(lease);
      });
    },

    complete(investigationId,{workerId,outcome="success"}={}){
      const worker=safeActor(workerId,"WORKER");
      if(!["success","failure"].includes(outcome))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_OUTCOME");
      return withLock(investigationId,()=>{
        const at=nowDate(clock);
        const lease=readJson(leasePath(investigationId));
        if(!activeLease(lease,at))throw new Error("ARCA_INVESTIGATION_QUEUE_LEASE_EXPIRED");
        if(lease.workerId!==worker)throw new Error("ARCA_INVESTIGATION_QUEUE_LEASE_OWNER_MISMATCH");
        const record=loadRequired(investigationId);
        if(outcome==="success"){
          const claimed=new Set(lease.wakeReasons);
          record.pendingWakeReasons=record.pendingWakeReasons.filter(reason=>!claimed.has(reason));
          touch(record,at.toISOString());
        }
        lease.status=outcome==="success"?"completed":"released-failed";
        lease.completedAt=at.toISOString();lease.outcome=outcome;
        atomicWrite(leasePath(investigationId),lease);
        return {record:clone(record),lease:clone(lease)};
      });
    },

    get(investigationId){return clone(loadRequired(investigationId))},
    getLease(investigationId){
      if(!validId(investigationId))throw new Error("ARCA_INVESTIGATION_QUEUE_INVALID_ID");
      return clone(readJson(leasePath(investigationId)));
    },
    list(){
      return fsImpl.readdirSync(investigationsDir).filter(name=>/^investigation-[0-9a-f]{24}\.json$/.test(name))
        .sort().map(name=>clone(readJson(path.join(investigationsDir,name))));
    }
  });
}
