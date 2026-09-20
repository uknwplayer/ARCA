import {getCredentialSecurityNotice} from "./credential-vault.ts";
import {listAgentConnectionModes,listAgentConnectionTutorials} from "./connection-tutorials.ts";

export const ARCA_AGENT_CONNECTION_CATALOG_FORMAT="arca-agent-connection-catalog-v1";

export function getAgentConnectionCatalog(filters={}){
  return Object.freeze({
    format:ARCA_AGENT_CONNECTION_CATALOG_FORMAT,
    securityNotice:getCredentialSecurityNotice(),
    modes:listAgentConnectionModes(),
    tutorials:listAgentConnectionTutorials(filters)
  });
}
