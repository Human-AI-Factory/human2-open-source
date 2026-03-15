import { SqliteStore } from '../../db/sqlite.js';
import { DomainEntityService } from './domain-entity.service.js';
import { DramaProductionChainService } from './drama-production-chain.service.js';
import { DramaWorkflowService } from './drama-workflow.service.js';

export type DomainModule = {
  dramaWorkflowService: DramaWorkflowService;
  dramaProductionChainService: DramaProductionChainService;
  domainEntityService: DomainEntityService;
};

export type DomainModuleDeps = {
  store: SqliteStore;
  dramaWorkflowService?: DramaWorkflowService;
  dramaProductionChainService?: DramaProductionChainService;
  domainEntityService?: DomainEntityService;
};

export const createDomainModule = (deps: DomainModuleDeps): DomainModule => ({
  dramaWorkflowService: deps.dramaWorkflowService ?? new DramaWorkflowService(deps.store),
  dramaProductionChainService: deps.dramaProductionChainService ?? new DramaProductionChainService(deps.store),
  domainEntityService: deps.domainEntityService ?? new DomainEntityService(deps.store)
});
