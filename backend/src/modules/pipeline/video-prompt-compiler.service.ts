import type { Asset, DomainEntity, Storyboard, StoryboardAssetRelation, StoryboardPlan } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';

const DIRTY_PROMPT_PREFIXES = [
  '参考图=',
  '场景资产基准：',
  '角色资产基准：',
  '道具资产基准：',
  '场景设定图',
  '角色设定图',
  '道具设定图',
  '保持同一角色',
  '保持同一场景',
  '保持同一道具'
];

const cleanValue = (value: string | null | undefined): string => {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[；;]+$/g, '')
    .trim();
};

const splitPromptSegments = (prompt: string): string[] => {
  return prompt
    .split(/[；;\n]+/g)
    .map((item) => cleanValue(item))
    .filter(Boolean);
};

const stripAssetSuffix = (name: string): string => {
  return cleanValue(name).replace(/-(角色|场景|道具)资产$/u, '').replace(/资产$/u, '');
};

const pickUnique = (items: Array<string | null | undefined>, max = 3): string[] => {
  return [...new Set(items.map((item) => cleanValue(item)).filter(Boolean))].slice(0, max);
};

type VideoPromptReferenceSummary = {
  baseSceneAsset: Asset | null;
  shotSceneStateAsset: Asset | null;
  baseCharacterAssets: Asset[];
  shotCharacterStateAssets: Asset[];
  propAssets: Asset[];
  sceneEntities: DomainEntity[];
  characterEntities: DomainEntity[];
  propEntities: DomainEntity[];
};

export class VideoPromptCompilerService {
  constructor(private readonly store: SqliteStore) {}

  compile(projectId: string, storyboardId: string): string | null {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    return this.compileStoryboard(projectId, storyboard);
  }

  compileStoryboard(projectId: string, storyboard: Storyboard): string {
    const references = this.resolveReferenceSummary(projectId, storyboard);
    const plan = storyboard.plan ?? this.buildFallbackPlan(storyboard);

    const sections = [
      `镜头标题：${cleanValue(plan.shotTitle || storyboard.title)}`,
      plan.continuityGroupId ? `连续性分组：${cleanValue(plan.continuityGroupId)}` : null,
      this.buildCanonSection(references),
      this.buildDeltaSection(plan, references),
      '要求：以首帧和参考图为准，保持角色造型、服装、场景结构和道具外观一致；单镜头连续运动；禁止字幕、水印、分屏、拼贴和额外人物。'
    ]
      .map((item) => cleanValue(item))
      .filter(Boolean);

    return sections.join('；');
  }

  private buildReferenceLine(label: string, assets: Asset[], entities: DomainEntity[], max = 3): string | null {
    const names = pickUnique(
      [
        ...assets.map((item) => stripAssetSuffix(item.name)),
        ...entities.map((item) => cleanValue(item.name))
      ],
      max
    );
    if (names.length === 0) {
      return null;
    }
    return `${label}：${names.join('、')}（沿用已绑定参考图设定）`;
  }

  private buildCanonSection(references: VideoPromptReferenceSummary): string | null {
    const parts = [
      this.buildReferenceLine('角色主资产', references.baseCharacterAssets, references.characterEntities, 4),
      this.buildReferenceLine('场景主资产', references.baseSceneAsset ? [references.baseSceneAsset] : [], references.sceneEntities, 1),
      this.buildReferenceLine('道具主资产', references.propAssets, references.propEntities, 3),
      'immutable canon：以上主资产为唯一视觉真相，不得擅自改变角色脸型、发型、服装主方案、场景结构、主要道具外观。'
    ]
      .map((item) => cleanValue(item))
      .filter(Boolean);
    return parts.length > 0 ? parts.join('；') : null;
  }

  private buildDeltaSection(plan: StoryboardPlan, references: VideoPromptReferenceSummary): string | null {
    const deltaParts = [
      plan.scene ? `当前场景：${cleanValue(plan.scene)}` : null,
      plan.time ? `当前时间：${cleanValue(plan.time)}` : null,
      plan.subject ? `当前主体：${cleanValue(plan.subject)}` : null,
      plan.action ? `当前动作：${cleanValue(plan.action)}` : null,
      plan.composition ? `当前机位构图：${cleanValue(plan.composition)}` : null,
      plan.lighting ? `当前光线：${cleanValue(plan.lighting)}` : null,
      this.buildReferenceLine('角色镜头变体', references.shotCharacterStateAssets, [], 4),
      this.buildReferenceLine('场景镜头变体', references.shotSceneStateAsset ? [references.shotSceneStateAsset] : [], [], 1),
      'mutable shot delta：只表现当前镜头的情绪、动作、时间、天气、光线和机位变化，不得重写主资产设定。'
    ]
      .map((item) => cleanValue(item))
      .filter(Boolean);
    return deltaParts.length > 0 ? deltaParts.join('；') : null;
  }

  private buildFallbackPlan(storyboard: Storyboard): StoryboardPlan {
    const segments = splitPromptSegments(storyboard.prompt).filter(
      (item) => !DIRTY_PROMPT_PREFIXES.some((prefix) => item.startsWith(prefix))
    );
    const primary = cleanValue(segments[0] ?? storyboard.title);
    const secondary = cleanValue(segments[1] ?? primary);
    return {
      shotTitle: cleanValue(storyboard.title || primary),
      continuityGroupId: 'cg:fallback',
      scene: '',
      time: '',
      subject: '',
      action: primary,
      composition: secondary === primary ? '' : secondary,
      lighting: '',
      finalImagePrompt: primary,
      characterIds: [],
      sceneEntityId: null,
      propEntityIds: [],
      baseSceneAssetId: null,
      baseCharacterAssetIds: [],
      shotSceneStateId: null,
      shotCharacterStateIds: [],
      sceneAssetId: null,
      characterAssetIds: [],
      propAssetIds: []
    };
  }

  private resolveReferenceSummary(projectId: string, storyboard: Storyboard): VideoPromptReferenceSummary {
    const allAssets = this.store.listAssets(projectId) ?? [];
    const assetById = new Map(allAssets.map((item) => [item.id, item]));
    const relationRows = this.store.listStoryboardAssetRelations(projectId, storyboard.id) ?? [];
    const relations = relationRows.length > 0 ? relationRows : this.buildFallbackRelations(storyboard.plan);

    const sceneAssets = relations
      .filter((item) => item.role === 'scene')
      .map((item) => assetById.get(item.assetId) ?? null)
      .filter((item): item is Asset => Boolean(item));

    const characterAssets = relations
      .filter((item) => item.role === 'character')
      .map((item) => assetById.get(item.assetId) ?? null)
      .filter((item): item is Asset => Boolean(item));

    const propAssets = relations
      .filter((item) => item.role === 'prop')
      .map((item) => assetById.get(item.assetId) ?? null)
      .filter((item): item is Asset => Boolean(item));

    const sceneEntities = storyboard.plan?.sceneEntityId
      ? [this.store.getDomainEntity(projectId, storyboard.plan.sceneEntityId)].filter((item): item is DomainEntity => Boolean(item))
      : [];
    const characterEntities = (storyboard.plan?.characterIds ?? [])
      .map((id) => this.store.getDomainEntity(projectId, id))
      .filter((item): item is DomainEntity => Boolean(item));
    const propEntities = (storyboard.plan?.propEntityIds ?? [])
      .map((id) => this.store.getDomainEntity(projectId, id))
      .filter((item): item is DomainEntity => Boolean(item));

    const baseSceneAsset =
      (storyboard.plan?.baseSceneAssetId ? assetById.get(storyboard.plan.baseSceneAssetId) ?? null : null) ??
      sceneAssets.find((item) => item.scope === 'base') ??
      (sceneAssets.find((item) => item.scope === 'shot' && item.baseAssetId)?.baseAssetId
        ? assetById.get(sceneAssets.find((item) => item.scope === 'shot' && item.baseAssetId)!.baseAssetId!) ?? null
        : null);
    const shotSceneStateAsset =
      (storyboard.plan?.shotSceneStateId ? assetById.get(storyboard.plan.shotSceneStateId) ?? null : null) ??
      sceneAssets.find((item) => item.scope === 'shot') ??
      null;
    const baseCharacterAssets = pickUnique(
      (storyboard.plan?.baseCharacterAssetIds ?? [])
        .map((id) => assetById.get(id) ?? null)
        .filter((item): item is Asset => Boolean(item))
        .map((item) => item.id),
      8
    )
      .map((id) => assetById.get(id) ?? null)
      .filter((item): item is Asset => Boolean(item));
    const shotCharacterStateAssets = pickUnique(
      (storyboard.plan?.shotCharacterStateIds ?? [])
        .map((id) => assetById.get(id) ?? null)
        .filter((item): item is Asset => Boolean(item))
        .map((item) => item.id),
      8
    )
      .map((id) => assetById.get(id) ?? null)
      .filter((item): item is Asset => Boolean(item));

    return {
      baseSceneAsset,
      shotSceneStateAsset,
      baseCharacterAssets: baseCharacterAssets.length > 0 ? baseCharacterAssets : characterAssets.filter((item) => item.scope === 'base'),
      shotCharacterStateAssets: shotCharacterStateAssets.length > 0 ? shotCharacterStateAssets : characterAssets.filter((item) => item.scope === 'shot'),
      propAssets,
      sceneEntities,
      characterEntities,
      propEntities
    };
  }

  private buildFallbackRelations(plan: StoryboardPlan | null): StoryboardAssetRelation[] {
    if (!plan) {
      return [];
    }
    const now = new Date(0).toISOString();
    const rows: StoryboardAssetRelation[] = [];
    if (plan.sceneAssetId) {
      rows.push({ storyboardId: '', assetId: plan.sceneAssetId, role: 'scene', createdAt: now });
    }
    for (const assetId of [...(plan.characterAssetIds ?? []), ...(plan.shotCharacterStateIds ?? [])]) {
      rows.push({ storyboardId: '', assetId, role: 'character', createdAt: now });
    }
    for (const assetId of plan.propAssetIds ?? []) {
      rows.push({ storyboardId: '', assetId, role: 'prop', createdAt: now });
    }
    return rows;
  }
}
