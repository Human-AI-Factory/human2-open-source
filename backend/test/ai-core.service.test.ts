import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteStore } from '../src/db/sqlite.js';
import { ProjectsService } from '../src/modules/projects/projects.service.js';
import { StudioService } from '../src/modules/studio/studio.service.js';
import { PipelineService } from '../src/modules/pipeline/pipeline.service.js';
import { MockAiProvider } from '../src/modules/pipeline/providers/mock.provider.js';
import { PromptCompilerService } from '../src/modules/ai/prompt-compiler.service.js';
import { CharacterBibleService } from '../src/modules/ai/character-bible.service.js';
import { DramaWorkflowService } from '../src/modules/domain/drama-workflow.service.js';
import { DomainEntityService } from '../src/modules/domain/domain-entity.service.js';

const createHarness = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'human2-ai-core-test-'));
  const dataFile = path.join(tempRoot, 'app.db');
  const store = new SqliteStore(dataFile);
  const provider = new MockAiProvider();
  const projects = new ProjectsService(store);
  const studio = new StudioService(store, provider);
  const pipeline = new PipelineService(store, provider, 2, { videoMergeEngine: 'placeholder' });
  return {
    projects,
    studio,
    pipeline,
    promptCompiler: new PromptCompilerService(store),
    characterBible: new CharacterBibleService(store),
    dramaWorkflow: new DramaWorkflowService(store),
    domainEntity: new DomainEntityService(store),
    cleanup: async () => {
      await pipeline.shutdown();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
};

test('prompt compiler should resolve templates, fallback sections and unresolved variables', async () => {
  const { promptCompiler, cleanup } = createHarness();
  try {
    const templates = promptCompiler.listTemplates();
    assert.ok(templates.length > 0);

    const compiled = promptCompiler.compile({
      templateId: templates[0].id,
      variables: {
        title: '测试标题',
        tags: ['A', 'B'],
        count: 3
      },
      extraSections: ['附加说明：{{title}}', '标签：{{tags}}', '缺失：{{missingToken}}']
    });

    assert.ok(compiled.content.length > 0);
    assert.ok(compiled.content.includes('测试标题'));
    assert.deepEqual(compiled.unresolvedVariables, ['missingToken']);

    const raw = promptCompiler.compileContent('Hello {{name}}\n\n{{missing}}', {
      name: 'Toonflow',
      enabled: true
    });
    assert.equal(raw.content, 'Hello Toonflow');
    assert.deepEqual(raw.unresolvedVariables, ['missing']);
    assert.equal(raw.variables.enabled, 'true');
  } finally {
    await cleanup();
  }
});

test('character bible should build project and storyboard scoped character docs', async () => {
  const { projects, studio, pipeline, promptCompiler, dramaWorkflow, domainEntity, characterBible, cleanup } = createHarness();
  try {
    const project = projects.createProject({ name: 'AI Core Character Bible Project' });
    studio.saveNovel(project.id, { title: 'N', content: '第一段。第二段。第三段。' });
    const outlines = await studio.generateOutlines(project.id, { chapterCount: 2 });
    assert.ok(outlines && outlines.length > 0);
    const script = await studio.generateScript(project.id, { outlineId: outlines![0].id });
    assert.ok(script);
    const boards = await pipeline.generateStoryboards(project.id, script!.id);
    assert.ok(boards && boards.length > 0);

    const drama = dramaWorkflow.upsertDrama(project.id, { name: '主线剧集' });
    assert.ok(drama);
    const episode = dramaWorkflow.createEpisode(project.id, { dramaId: drama!.id, title: '第1集' });
    assert.ok(episode);
    dramaWorkflow.assignStoryboardToEpisode(project.id, boards![0].id, episode!.id);

    const linkedCharacter = domainEntity.createDomainEntity(project.id, {
      type: 'character',
      name: '主角',
      prompt: 'golden armor hero'
    });
    const unlinkedCharacter = domainEntity.createDomainEntity(project.id, {
      type: 'character',
      name: '配角',
      prompt: 'quiet strategist'
    });
    assert.ok(linkedCharacter && unlinkedCharacter);

    const relations = domainEntity.replaceStoryboardDomainEntityRelations(project.id, boards![0].id, {
      characterEntityIds: [linkedCharacter!.id]
    });
    assert.ok(relations);

    const projectDoc = characterBible.buildProjectCharacterBible(project.id);
    assert.equal(projectDoc.scope, 'project');
    assert.equal(projectDoc.entries.length, 2);
    assert.ok(projectDoc.entries.every((entry) => entry.linkedToStoryboard === false));

    const storyboardDoc = characterBible.buildStoryboardCharacterBible(project.id, boards![0].id);
    assert.equal(storyboardDoc.scope, 'storyboard');
    assert.equal(storyboardDoc.entries.length, 1);
    assert.equal(storyboardDoc.entries[0].id, linkedCharacter!.id);
    assert.equal(storyboardDoc.entries[0].linkedToStoryboard, true);

    const episodeDoc = characterBible.buildEpisodeCharacterBible(project.id, episode!.id);
    assert.equal(episodeDoc.scope, 'episode');
    assert.equal(episodeDoc.entries.length, 1);
    assert.equal(episodeDoc.entries[0].id, linkedCharacter!.id);
    assert.equal(episodeDoc.entries[0].linkedToEpisode, true);

    const compiled = promptCompiler.compileWorkflowPrompt({
      projectId: project.id,
      episodeId: episode!.id,
      storyboardId: boards![0].id,
      fallbackContent: 'Episode={{episodeTitle}}\nStoryboard={{storyboardTitle}}\nCharacters={{characterCount}}',
      includeCharacterBible: true
    });
    assert.ok(compiled.content.includes(`Episode=${episode!.title}`));
    assert.ok(compiled.content.includes(`Storyboard=${boards![0].title}`));
    assert.ok(compiled.content.includes('Characters=1'));
    assert.ok(compiled.content.includes(linkedCharacter!.name));
  } finally {
    await cleanup();
  }
});
