export const OPERATOR_CHALLENGE_STORE_FORMAT="arca-operator-challenge-store-v1";

export function assertOperatorChallengeStore(store){
  if(!store||store.format!==OPERATOR_CHALLENGE_STORE_FORMAT)throw new TypeError("challenge store inválido");
  for(const name of ["create","consume"])if(typeof store[name]!=="function")throw new TypeError(`challenge store sem ${name}`);
  if(store.durable!==true)throw new Error("ARCA_OPERATOR_CHALLENGE_STORE_NOT_DURABLE");
  if(store.atomicConsume!==true)throw new Error("ARCA_OPERATOR_CHALLENGE_STORE_NOT_ATOMIC");
  return store;
}

export function createOperatorChallengeStoreAdapter({create,consume,descriptor={}}){
  if(typeof create!=="function"||typeof consume!=="function")throw new TypeError("create/consume obrigatórios");
  return Object.freeze({format:OPERATOR_CHALLENGE_STORE_FORMAT,durable:true,atomicConsume:true,descriptor:Object.freeze({...descriptor}),create,consume});
}
