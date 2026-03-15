import type { PromptTemplate } from '../../core/types.js';
import { SqliteStore } from '../../db/sqlite.js';
import type { CharacterBibleDocument } from './character-bible.service.js';
import { CharacterBibleService } from './character-bible.service.js';

export type PromptCompilerInput = {
  templateId?: string;
  templateKey?: string;
  fallbackContent?: string;
  variables?: Record<string, unknown>;
  extraSections?: Array<string | null | undefined>;
};

export type CompiledPrompt = {
  templateId: string | null;
  templateKey: string | null;
  title: string | null;
  content: string;
  unresolvedVariables: string[];
  variables: Record<string, string>;
};

export type WorkflowPromptCompilerInput = PromptCompilerInput & {
  projectId: string;
  episodeId?: string;
  storyboardId?: string;
  includeCharacterBible?: boolean;
};

const toPromptValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPromptValue(item)).filter(Boolean).join('\n');
  }
  return JSON.stringify(value);
};

export class PromptCompilerService {
  constructor(
    private readonly store: SqliteStore,
    private readonly characterBibleService: CharacterBibleService = new CharacterBibleService(store)
  ) {}

  listTemplates(): PromptTemplate[] {
    return this.store.listPromptTemplates();
  }

  getTemplateById(id: string): PromptTemplate | null {
    return this.listTemplates().find((item) => item.id === id) ?? null;
  }

  getTemplateByKey(key: string): PromptTemplate | null {
    return this.listTemplates().find((item) => item.key === key) ?? null;
  }

  compile(input: PromptCompilerInput): CompiledPrompt {
    const template = this.pickTemplate(input);
    const baseContent = template?.content ?? input.fallbackContent ?? '';
    const sections = [baseContent, ...(input.extraSections ?? [])]
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    const compiled = this.compileContent(sections.join('\n\n'), input.variables ?? {});
    return {
      templateId: template?.id ?? null,
      templateKey: template?.key ?? null,
      title: template?.title ?? null,
      content: compiled.content,
      unresolvedVariables: compiled.unresolvedVariables,
      variables: compiled.variables,
    };
  }

  compileWorkflowPrompt(input: WorkflowPromptCompilerInput): CompiledPrompt {
    const project = this.store.getProjectById(input.projectId);
    const storyboard = input.storyboardId ? this.store.getStoryboard(input.projectId, input.storyboardId) : null;
    const resolvedEpisodeId = input.episodeId ?? storyboard?.episodeId ?? undefined;
    const episode = resolvedEpisodeId ? this.store.getEpisodeById(input.projectId, resolvedEpisodeId) : null;
    const drama = this.store.getDramaByProject(input.projectId);
    const characterBible = this.resolveCharacterBibleDocument(input, resolvedEpisodeId);
    const characterBibleText = characterBible.entries.map((entry, index) => `${index + 1}. ${entry.name}: ${entry.prompt}`).join('\n');

    const contextSections = [
      project ? `Project: ${project.name}` : null,
      drama ? `Drama: ${drama.name}` : null,
      episode ? `Episode: ${episode.title}` : null,
      storyboard ? `Storyboard: ${storyboard.title}\nPrompt: ${storyboard.prompt}` : null,
      characterBibleText ? `Character Bible:\n${characterBibleText}` : null
    ];

    return this.compile({
      templateId: input.templateId,
      templateKey: input.templateKey,
      fallbackContent: input.fallbackContent,
      extraSections: [...(input.extraSections ?? []), ...contextSections],
      variables: {
        ...input.variables,
        projectId: input.projectId,
        projectName: project?.name ?? '',
        dramaName: drama?.name ?? '',
        episodeId: resolvedEpisodeId ?? '',
        episodeTitle: episode?.title ?? '',
        storyboardId: storyboard?.id ?? '',
        storyboardTitle: storyboard?.title ?? '',
        storyboardPrompt: storyboard?.prompt ?? '',
        characterCount: characterBible.entries.length,
        characterBible: characterBibleText
      }
    });
  }

  compileContent(content: string, variables: Record<string, unknown>): Omit<CompiledPrompt, 'templateId' | 'templateKey' | 'title'> {
    const normalizedVariables = Object.fromEntries(
      Object.entries(variables).map(([key, value]) => [key, toPromptValue(value)])
    );
    const unresolved = new Set<string>();
    const rendered = content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, token: string) => {
      const replacement = normalizedVariables[token];
      if (replacement === undefined) {
        unresolved.add(token);
        return '';
      }
      return replacement;
    });
    return {
      content: rendered
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
      unresolvedVariables: [...unresolved].sort(),
      variables: normalizedVariables,
    };
  }

  private pickTemplate(input: PromptCompilerInput): PromptTemplate | null {
    if (input.templateId) {
      const matched = this.getTemplateById(input.templateId);
      if (matched) {
        return matched;
      }
    }
    if (input.templateKey) {
      return this.getTemplateByKey(input.templateKey);
    }
    return null;
  }

  private resolveCharacterBibleDocument(
    input: WorkflowPromptCompilerInput,
    resolvedEpisodeId?: string
  ): CharacterBibleDocument {
    if (!input.includeCharacterBible) {
      return {
        projectId: input.projectId,
        scope: 'project',
        generatedAt: new Date().toISOString(),
        entries: []
      };
    }
    if (input.storyboardId) {
      return this.characterBibleService.buildStoryboardCharacterBible(input.projectId, input.storyboardId);
    }
    if (resolvedEpisodeId) {
      return this.characterBibleService.buildEpisodeCharacterBible(input.projectId, resolvedEpisodeId);
    }
    return this.characterBibleService.buildProjectCharacterBible(input.projectId);
  }
}
