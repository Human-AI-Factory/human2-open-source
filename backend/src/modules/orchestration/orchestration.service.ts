import { Asset, Outline, Script, Storyboard, VideoTask } from '../../core/types.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { StudioService } from '../studio/studio.service.js';

export interface ProjectFullChainResult {
  outlines: Outline[];
  scripts: Script[];
  storyboards: Storyboard[];
  assets: Asset[];
  videoTasks: VideoTask[];
  createdAssetStoryboardIds: string[];
  skippedAssetStoryboardIds: string[];
  createdVideoStoryboardIds: string[];
  skippedVideoStoryboardIds: string[];
}

export class OrchestrationService {
  constructor(
    private readonly studioService: StudioService,
    private readonly pipelineService: PipelineService
  ) {}

  async runProjectFullChain(projectId: string, input: { chapterCount?: number }): Promise<ProjectFullChainResult | null> {
    const outlines = await this.studioService.generateOutlines(projectId, { chapterCount: input.chapterCount });
    if (!outlines) {
      return null;
    }

    const scripts: Script[] = [];
    for (const outline of outlines) {
      const script = await this.studioService.generateScript(projectId, { outlineId: outline.id });
      if (script) {
        scripts.push(script);
      }
    }

    const createdAssetStoryboardIds: string[] = [];
    const skippedAssetStoryboardIds: string[] = [];
    const createdVideoStoryboardIds: string[] = [];
    const skippedVideoStoryboardIds: string[] = [];

    for (const script of scripts) {
      const result = await this.pipelineService.runFullChainFromScript(projectId, script.id);
      if (!result) {
        continue;
      }

      createdAssetStoryboardIds.push(...result.createdAssetStoryboardIds);
      skippedAssetStoryboardIds.push(...result.skippedAssetStoryboardIds);
      createdVideoStoryboardIds.push(...result.createdVideoStoryboardIds);
      skippedVideoStoryboardIds.push(...result.skippedVideoStoryboardIds);
    }

    return {
      outlines: this.studioService.listOutlines(projectId) ?? [],
      scripts: this.studioService.listScripts(projectId) ?? [],
      storyboards: this.pipelineService.listStoryboards(projectId) ?? [],
      assets: this.pipelineService.listAssets(projectId) ?? [],
      videoTasks: this.pipelineService.listVideoTasks(projectId) ?? [],
      createdAssetStoryboardIds,
      skippedAssetStoryboardIds,
      createdVideoStoryboardIds,
      skippedVideoStoryboardIds
    };
  }
}
