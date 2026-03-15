import { SqliteStore } from '../../db/sqlite.js';
import { CapabilityCatalogService } from './capability-catalog.service.js';
import { CharacterBibleService } from './character-bible.service.js';
import { MediaModelPolicyService } from './media-model-policy.service.js';
import { PromptCompilerService } from './prompt-compiler.service.js';
import { ProviderRegistryService } from './provider-registry.service.js';

export type AiModule = {
  providerRegistryService: ProviderRegistryService;
  capabilityCatalogService: CapabilityCatalogService;
  promptCompilerService: PromptCompilerService;
  characterBibleService: CharacterBibleService;
  mediaModelPolicyService: MediaModelPolicyService;
};

export type AiModuleDeps = {
  store: SqliteStore;
  providerRegistryService?: ProviderRegistryService;
  capabilityCatalogService?: CapabilityCatalogService;
  promptCompilerService?: PromptCompilerService;
  characterBibleService?: CharacterBibleService;
  mediaModelPolicyService?: MediaModelPolicyService;
};

export const createAiModule = (deps: AiModuleDeps): AiModule => {
  const providerRegistryService = deps.providerRegistryService ?? new ProviderRegistryService();
  const capabilityCatalogService = deps.capabilityCatalogService ?? new CapabilityCatalogService();
  const characterBibleService = deps.characterBibleService ?? new CharacterBibleService(deps.store);
  const promptCompilerService = deps.promptCompilerService ?? new PromptCompilerService(deps.store, characterBibleService);
  const mediaModelPolicyService =
    deps.mediaModelPolicyService ?? new MediaModelPolicyService(deps.store, capabilityCatalogService);

  return {
    providerRegistryService,
    capabilityCatalogService,
    promptCompilerService,
    characterBibleService,
    mediaModelPolicyService
  };
};
