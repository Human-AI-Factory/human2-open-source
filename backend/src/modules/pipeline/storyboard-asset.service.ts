import { v4 as uuid } from 'uuid';
import type {
  Asset,
  DomainEntity,
  ModelConfig,
  Scene,
  Script,
  Storyboard,
  StoryboardPlan,
  StoryboardAssetRelation,
} from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';
import { ProviderRateLimitError, ProviderTransientError } from './providers/errors.js';
import type { AiProvider, ProviderImageInput, ProviderModelConfig } from './providers/types.js';

type ResolveModelName = (
  type: 'text' | 'image' | 'video' | 'audio',
  modelId?: string,
  customModel?: string
) => string | undefined;

type PickModelConfig = (type: 'text' | 'image' | 'video' | 'audio', modelName?: string) => ModelConfig | null;

type ResolveImageModelByMode = (mode: 't2i' | 'img2img', modelId?: string, customModel?: string) => string | undefined;

type ValidateImageGenerationParams = (
  modelConfig: ModelConfig | null,
  kind: 'storyboard' | 'asset',
  input: {
    resolution?: string;
    aspectRatio?: string;
    providerOptions?: Record<string, unknown>;
  }
) => void;

type StoryboardAssetServiceDeps = {
  resolveModelName: ResolveModelName;
  resolveImageModelByMode: ResolveImageModelByMode;
  pickModelConfig: PickModelConfig;
  toProviderModelConfig: (modelConfig: ModelConfig) => ProviderModelConfig;
  validateImageGenerationParams: ValidateImageGenerationParams;
};

const MAX_STORYBOARD_PLAN_COUNT = 6;
const MAX_STORYBOARD_SOURCE_CHARS = 12000;
const INVALID_STORYBOARD_PREFIXES = ['【场次标题】', '【剧情概述】', '【分场脚本】'] as const;

type ParsedScriptSceneBlock = {
  heading: string;
  explicitTime: string;
  lines: string[];
};

type StoryboardEntityContext = {
  episodeId?: string;
  characters: DomainEntity[];
  scenes: DomainEntity[];
  props: DomainEntity[];
};

type StoryboardAssetSeed = {
  role: 'character' | 'scene' | 'prop';
  scope: 'base' | 'shot';
  shareScope: 'project' | 'shared';
  bindToStoryboard: boolean;
  reuseAcrossProject: boolean;
  entityId: string | null;
  name: string;
  prompt: string;
  statePrompt: string | null;
  state: Asset['state'];
  baseAssetName: string | null;
  voiceProfile: Asset['voiceProfile'];
  imageUrl: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

const trimModelText = (text: string): string => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
};

const firstNonEmptyString = (...values: Array<unknown>): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const readStringArray = (...values: Array<unknown>): string[] => {
  for (const value of values) {
    if (!Array.isArray(value)) {
      continue;
    }
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
    if (items.length > 0) {
      return items;
    }
  }
  return [];
};

const uniqueIds = (items: string[]): string[] => [...new Set(items.map((item) => item.trim()).filter(Boolean))];

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const IMAGE_RENDER_SAFETY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b\d+\s*岁/gu, '年幼'],
  [/咬破舌尖，喷出一口热血/gu, '用尽力气唤醒同伴'],
  [/喷出一口热血/gu, '用尽力气呼喊'],
  [/左膝渗血|右膝渗血|膝部渗血/gu, '膝部受伤、行动艰难'],
  [/鲜红血线|鲜红血痕|鲜红血迹/gu, '醒目的痕迹'],
  [/刺目鲜红/gu, '醒目'],
  [/血线|血痕|血迹|血丝|渗血|流血/gu, '受伤痕迹'],
  [/皮肤发黑龟裂/gu, '冻伤明显、状态极差'],
  [/指甲尽裂|指甲开裂/gu, '手部严重受伤'],
  [/撕裂的脚掌/gu, '受伤的脚部'],
  [/刺入她脚踝|刺入脚踝/gu, '划伤脚踝'],
  [/奄奄一息/gu, '极度虚弱'],
  [/昏厥|昏倒/gu, '体力不支'],
  [/冻僵倒地/gu, '体力透支倒地'],
  [/冻僵/gu, '严重失温'],
];

const normalizeImageRenderPromptForSafety = (prompt: string): string => {
  let next = collapseWhitespace(prompt);
  for (const [pattern, replacement] of IMAGE_RENDER_SAFETY_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }
  next = next
    .replace(/受伤痕迹(?:、受伤痕迹)+/gu, '受伤痕迹')
    .replace(/醒目的痕迹(?:、醒目的痕迹)+/gu, '醒目的痕迹')
    .replace(/年幼(?=年幼)/gu, '')
    .replace(/；\s*；/gu, '；')
    .replace(/，\s*，/gu, '，');
  return collapseWhitespace(next);
};

const sanitizeRenderField = (value: string | null | undefined): string =>
  normalizeImageRenderPromptForSafety(
    collapseWhitespace(
      (value ?? '')
        .replace(/(?:https?:\/\/|\/api\/)[^\s；，]+/gu, '')
        .replace(/参考图\s*=\s*[^\s；，]+/gu, '')
        .replace(/项目(?:角色|场景)主资产：[^；]+/gu, '')
        .replace(/(?:角色|场景|道具)(?:资产基准|设定|主资产设定图|镜头级(?:角色|场景)状态图)[^；]*/gu, '')
    )
  );

const buildSafeStoryboardRenderPrompt = (plan: StoryboardPlan): string =>
  collapseWhitespace(
    [
      `镜头标题：${sanitizeRenderField(plan.shotTitle) || '关键镜头'}`,
      plan.scene ? `场景：${sanitizeRenderField(plan.scene)}` : '',
      plan.time ? `时间：${sanitizeRenderField(plan.time)}` : '',
      `主体：${sanitizeRenderField(plan.subject) || '画面主体人物'}`,
      `动作：${sanitizeRenderField(plan.action)}`,
      `构图：${sanitizeRenderField(plan.composition)}`,
      `光线：${sanitizeRenderField(plan.lighting)}`,
      '中文影视分镜，电影感构图，写实环境，人物关系清晰，动作明确',
      '保持角色造型、服装和场景结构一致，以克制方式表现危险处境，不直接展示未成年人伤口、血迹或过于刺激的受伤细节'
    ]
      .filter(Boolean)
      .join('；')
  );

const NON_PERSON_NAME_TOKENS = new Set([
  '角色',
  '人物',
  '主体',
  '画面',
  '主角',
  '镜头',
  '姐妹',
  '羊群',
  '雪原',
  '天空',
  '风雪',
  '场景',
  '草原',
  '孩子',
  '少女',
]);

const stripListPrefix = (value: string): string => value.replace(/^\d+[.、]\s*/, '').trim();

const stripKnownLabel = (value: string, labels: string[]): string => {
  let next = value.trim();
  for (const label of labels) {
    next = next.replace(new RegExp(`^${label}\\s*[:：]?\\s*`, 'u'), '').trim();
  }
  return next;
};

const hasInvalidStoryboardPrefix = (value: string): boolean =>
  INVALID_STORYBOARD_PREFIXES.some((prefix) => value.startsWith(prefix));

const isStandaloneLabeledValue = (value: string, label: string): boolean =>
  new RegExp(`^${label}\\s*[:：]\\s*[^，。；;]+$`, 'u').test(value);

const sanitizeStoryboardValue = (
  value: unknown,
  labels: string[],
  options: { allowStandalone?: boolean } = {}
): string => {
  if (typeof value !== 'string') {
    return '';
  }
  let next = collapseWhitespace(stripKnownLabel(stripListPrefix(value), labels));
  if (!next || hasInvalidStoryboardPrefix(next)) {
    return '';
  }
  if (!options.allowStandalone && labels.some((label) => isStandaloneLabeledValue(value.trim(), label))) {
    return '';
  }
  next = next.replace(/^[-:：]+/, '').trim();
  return hasInvalidStoryboardPrefix(next) ? '' : next;
};

const TIME_DESCRIPTOR_PREFIXES = [
  '凌晨',
  '黎明',
  '清晨',
  '清早',
  '早晨',
  '上午',
  '中午',
  '正午',
  '午后',
  '下午',
  '傍晚',
  '黄昏',
  '入夜',
  '深夜',
  '午夜',
  '夜晚',
  '夜里',
  '夜间',
  '晨间',
  '晚间',
  '白天',
  '白昼',
  '日出',
  '日落',
  '雨夜',
  '雪夜',
] as const;

const looksLikeTimeDescriptor = (value: string): boolean => {
  const scope = sanitizeStoryboardValue(value, ['时间'], { allowStandalone: true });
  if (!scope) {
    return false;
  }
  if (/^[\d零一二三四五六七八九十两百半]+(?:点|时|分|刻)(?:半)?(?:[\s、，,／/｜-].*)?$/u.test(scope)) {
    return true;
  }
  if (scope === '夜') {
    return true;
  }
  return TIME_DESCRIPTOR_PREFIXES.some((prefix) => scope === prefix || scope.startsWith(prefix));
};

const truncateForModel = (content: string, maxChars: number): string => {
  if (content.length <= maxChars) {
    return content;
  }
  return `${content.slice(0, maxChars)}\n\n[脚本过长，已截断到前 ${maxChars} 字作为分镜规划参考]`;
};

const splitSceneAndTime = (heading: string, explicitTime = ''): { scene: string; time: string } => {
  const normalized = sanitizeStoryboardValue(heading, ['场景'], { allowStandalone: true });
  const parts = normalized
    .split(/[\\/｜|]/u)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean);
  const scene = parts[0] ?? '';
  const timeCandidate = explicitTime || (looksLikeTimeDescriptor(parts[1] ?? '') ? parts[1] ?? '' : '');
  const time = sanitizeStoryboardValue(timeCandidate, ['时间'], { allowStandalone: true });
  return { scene, time };
};

const inferLighting = (time: string, scene: string): string => {
  const scope = `${time} ${scene}`;
  if (/夜|深夜|凌晨/u.test(scope)) {
    return '低照度电影光，冷暖对比明显，轮廓光清晰';
  }
  if (/傍晚|黄昏/u.test(scope)) {
    return '暖色余晖与环境补光并存，空气透视明显';
  }
  if (/清晨|黎明/u.test(scope)) {
    return '柔和晨光，逆光边缘高光明显，空气感干净';
  }
  if (/雨|暴雨/u.test(scope)) {
    return '潮湿反光地面配合高反差环境光，氛围压迫';
  }
  return '自然主光明确，前后景层次清楚，画面通透';
};

const inferComposition = (action: string, scene: string, index: number): string => {
  const scope = `${action} ${scene}`;
  if (/对峙|冲突|争执|逼近/u.test(scope)) {
    return '中近景对峙构图，前景留压迫空间，镜头张力强';
  }
  if (/走|奔|冲|追/u.test(scope)) {
    return '动态跟拍构图，主体位于三分线，保留运动方向空间';
  }
  if (/独自|凝视|沉默|恍惚|自责/u.test(scope)) {
    return '近景人物构图，背景虚化，情绪焦点集中在表情和手部动作';
  }
  if (index === 0) {
    return '建立镜头构图，先交代环境与人物位置关系，再收束到主体';
  }
  return '电影感中景构图，主体明确，景别和空间关系清楚';
};

const inferSubject = (action: string, scene: string): string => {
  const cleaned = collapseWhitespace(action.replace(/[，。；;].*$/u, ''));
  const matched = cleaned.match(/^([^\s，。；;、]{1,16})(?:在|正|站|坐|走|奔|冲|抬|低|看|望|抱|握|推|拉|回|进入|离开)/u);
  if (matched?.[1]) {
    return matched[1];
  }
  if (scene) {
    return `${scene}中的主要人物`;
  }
  return '画面主体人物';
};

const normalizeShotTitle = (rawTitle: unknown, scene: string, index: number): string => {
  const cleaned = sanitizeStoryboardValue(rawTitle, ['标题', '镜头标题', 'shotTitle', 'shot']);
  if (cleaned) {
    return cleaned.slice(0, 40);
  }
  if (scene) {
    return `${scene}镜头`.slice(0, 40);
  }
  return `镜头 ${index + 1}`;
};

const buildFinalImagePrompt = (plan: Pick<StoryboardPlan, 'scene' | 'time' | 'subject' | 'action' | 'composition' | 'lighting'>): string =>
  collapseWhitespace(
    [
      plan.scene ? `场景：${plan.scene}` : '',
      plan.time ? `时间：${plan.time}` : '',
      `主体：${plan.subject}`,
      `动作：${plan.action}`,
      `构图：${plan.composition}`,
      `光线：${plan.lighting}`,
      '中文影视分镜，电影质感，高细节，人物动作和空间关系明确'
    ]
      .filter(Boolean)
      .join('；')
  );

const isCharacterTokenCandidate = (value: string): boolean => {
  const normalized = collapseWhitespace(value);
  if (!normalized || NON_PERSON_NAME_TOKENS.has(normalized)) {
    return false;
  }
  return !/[场景镜头时间动作光线天气羊群雪原草地孩子人物主体公寓楼下楼道入口走廊会议室海边工作室]/u.test(
    normalized
  );
};

const extractCharacterNames = (plan: StoryboardPlan): string[] => {
  const subject = sanitizeStoryboardValue(plan.subject, ['主体', '人物', '角色'], { allowStandalone: true });
  const subjectTokens = subject
    .split(/[、，,和与及/]/u)
    .map((item) => collapseWhitespace(item))
    .filter((item) => isCharacterTokenCandidate(item));
  if (subjectTokens.length > 0) {
    return uniqueIds(subjectTokens).slice(0, 3);
  }
  const source = `${plan.subject} ${plan.action}`;
  const matches = source.match(/[\p{Script=Han}]{2,4}/gu) ?? [];
  return uniqueIds(matches.map((item) => item.trim()).filter((item) => isCharacterTokenCandidate(item))).slice(0, 3);
};

const deriveCharacterSeedToken = (plan: StoryboardPlan): string => {
  const names = extractCharacterNames(plan);
  if (names.length > 0) {
    return names.join('与').slice(0, 24);
  }
  const subject = sanitizeStoryboardValue(plan.subject, ['主体', '人物', '角色'], { allowStandalone: true });
  return isCharacterTokenCandidate(subject) ? subject.slice(0, 24) : '';
};

const deriveCharacterBaseLabel = (storyboard: Storyboard, plan: StoryboardPlan): string => {
  const token = deriveCharacterSeedToken(plan);
  if (token) {
    return `${token}-角色主资产`;
  }
  return `${storyboard.title}-角色主资产`;
};

const deriveSceneBaseLabel = (storyboard: Storyboard, plan: StoryboardPlan): string => {
  const scene = sanitizeStoryboardValue(plan.scene, ['场景'], { allowStandalone: true });
  if (scene) {
    return `${scene.slice(0, 24)}-场景主资产`;
  }
  return `${storyboard.title}-场景主资产`;
};

const inferEmotionFromAction = (action: string): string => {
  const scope = `${action}`;
  if (/哭|悲伤|绝望|崩溃|虚弱/u.test(scope)) {
    return '悲伤压抑';
  }
  if (/愤怒|怒吼|冲|拼命/u.test(scope)) {
    return '紧张激烈';
  }
  if (/惊讶|察觉|警觉|回头/u.test(scope)) {
    return '警觉紧绷';
  }
  if (/扶|抱|安慰|照护/u.test(scope)) {
    return '克制坚韧';
  }
  return '情绪稳定但受当前事件驱动';
};

const buildCharacterBasePrompt = (storyboard: Storyboard, plan: StoryboardPlan): string =>
  collapseWhitespace(
    [
      `项目角色主资产：${deriveCharacterBaseLabel(storyboard, plan)}`,
      plan.subject ? `人物线索：${plan.subject}` : '',
      `核心动作线索：${plan.action}`,
      '输出角色主设定图，强调三视图、标准像、固定服装方案、面部一致性和体态稳定',
      '不以当前镜头环境为主体，不加入复杂背景，不突出瞬时动作'
    ]
      .filter(Boolean)
      .join('；')
  );

const buildSceneBasePrompt = (storyboard: Storyboard, plan: StoryboardPlan): string =>
  collapseWhitespace(
    [
      `项目场景主资产：${deriveSceneBaseLabel(storyboard, plan)}`,
      plan.scene ? `空间结构：${plan.scene}` : '',
      plan.time ? `时间基调：${plan.time}` : '',
      `构图参考：${plan.composition}`,
      `光线基调：${plan.lighting}`,
      '输出场景主设定图，强调空间结构、材质关系、固定机位参考和环境一致性',
      '避免把人物动作当作主体'
    ]
      .filter(Boolean)
      .join('；')
  );

const buildCharacterShotState = (plan: StoryboardPlan): Asset['state'] => ({
  emotion: inferEmotionFromAction(plan.action),
  action: plan.action,
  pose: plan.composition,
  costumeState: '沿用主资产服装方案',
  condition: plan.action.includes('受伤') ? '受伤状态可见' : undefined,
});

const buildSceneShotState = (plan: StoryboardPlan): Asset['state'] => ({
  time: plan.time,
  lighting: plan.lighting,
  camera: plan.composition,
  localChange: plan.action,
  weather: /雪|雨|风|雾/u.test(`${plan.scene} ${plan.action}`)
    ? collapseWhitespace(`${plan.scene} ${plan.action}`)
    : undefined,
});

const normalizeContinuityToken = (value: string | null | undefined): string =>
  collapseWhitespace(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .trim();

const deriveContinuityGroupId = (
  plan: Pick<StoryboardPlan, 'scene' | 'time' | 'sceneEntityId' | 'characterIds' | 'subject'>
): string => {
  const sceneToken = plan.sceneEntityId?.trim() || normalizeContinuityToken(plan.scene) || 'scene';
  const timeToken = normalizeContinuityToken(plan.time) || 'time';
  const subjectToken =
    uniqueIds(plan.characterIds).join('-') || normalizeContinuityToken(plan.subject) || 'subject';
  return `cg:${sceneToken}:${timeToken}:${subjectToken}`;
};

const normalizeStoryboardPlanRecord = (record: Record<string, unknown>, index: number): StoryboardPlan | null => {
  const scene = sanitizeStoryboardValue(firstNonEmptyString(record.scene, record.location, record.place), ['场景'], { allowStandalone: true });
  const time = sanitizeStoryboardValue(firstNonEmptyString(record.time, record.period, record.timeOfDay), ['时间'], { allowStandalone: true });
  const action = sanitizeStoryboardValue(firstNonEmptyString(record.action, record.beat, record.description, record.summary), ['动作', '角色动作']);
  if (!scene || !action) {
    return null;
  }
  const subject = sanitizeStoryboardValue(firstNonEmptyString(record.subject, record.character, record.focus), ['主体', '人物', '角色']) || inferSubject(action, scene);
  const composition =
    sanitizeStoryboardValue(firstNonEmptyString(record.composition, record.framing, record.camera), ['构图', '镜头']) ||
    inferComposition(action, scene, index);
  const lighting =
    sanitizeStoryboardValue(firstNonEmptyString(record.lighting, record.light), ['光线', '灯光']) || inferLighting(time, scene);
  const shotTitle = normalizeShotTitle(firstNonEmptyString(record.shotTitle, record.title, record.name), scene, index);
  const builtPrompt = buildFinalImagePrompt({
    scene,
    time,
    subject,
    action,
    composition,
    lighting
  });
  const finalImagePrompt =
    sanitizeStoryboardValue(firstNonEmptyString(record.finalImagePrompt, record.imagePrompt, record.prompt), [], { allowStandalone: true }) ||
    builtPrompt;
  if (hasInvalidStoryboardPrefix(finalImagePrompt)) {
    return null;
  }
  return {
    shotTitle,
    continuityGroupId:
      firstNonEmptyString(record.continuityGroupId, record.groupId, record.continuityGroup) ?? deriveContinuityGroupId({
        scene,
        time: time || '未明确时段',
        sceneEntityId: firstNonEmptyString(record.sceneEntityId, record.sceneId),
        characterIds: uniqueIds(readStringArray(record.characterIds, record.characterEntityIds)),
        subject,
      }),
    scene,
    time: time || '未明确时段',
    subject,
    action,
    composition,
    lighting,
    finalImagePrompt,
    characterIds: uniqueIds(readStringArray(record.characterIds, record.characterEntityIds)),
    sceneEntityId: firstNonEmptyString(record.sceneEntityId, record.sceneId),
    propEntityIds: uniqueIds(readStringArray(record.propEntityIds, record.propIds, record.propEntityIds)),
    baseSceneAssetId: firstNonEmptyString(record.baseSceneAssetId),
    baseCharacterAssetIds: uniqueIds(readStringArray(record.baseCharacterAssetIds)),
    shotSceneStateId: firstNonEmptyString(record.shotSceneStateId),
    shotCharacterStateIds: uniqueIds(readStringArray(record.shotCharacterStateIds)),
    sceneAssetId: firstNonEmptyString(record.sceneAssetId),
    characterAssetIds: uniqueIds(readStringArray(record.characterAssetIds)),
    propAssetIds: uniqueIds(readStringArray(record.propAssetIds))
  };
};

const parseStructuredScriptBlocks = (script: Script): ParsedScriptSceneBlock[] => {
  const lines = trimModelText(script.content)
    .split(/\n+/)
    .map((line) => collapseWhitespace(line))
    .filter(Boolean);
  const blocks: ParsedScriptSceneBlock[] = [];
  let current: ParsedScriptSceneBlock | null = null;

  const pushCurrent = (): void => {
    if (!current) {
      return;
    }
    if (current.heading || current.lines.length > 0) {
      blocks.push(current);
    }
    current = null;
  };

  for (const rawLine of lines) {
    if (rawLine.startsWith('【原文参考片段】') || hasInvalidStoryboardPrefix(rawLine)) {
      continue;
    }
    const line = stripListPrefix(rawLine);
    const sceneMatch = line.match(/^场景\s*[:：]\s*(.+)$/u);
    if (sceneMatch) {
      pushCurrent();
      // Handle pipe-separated format: 场景：旧棚屋院内｜清晨六点｜阴云微散｜母亲捆扎...
      const fullContent = sceneMatch[1]!.trim();
      const parts = fullContent.split(/[\\/｜|]/u).map((p) => p.trim()).filter(Boolean);

      // First part is scene/location
      const scene = parts[0] || '';
      // Second part is time (if it looks like a time)
      const potentialTime = parts[1] || '';
      const hasExplicitTime = looksLikeTimeDescriptor(potentialTime);

      // Remaining parts are the description/action
      const remainingParts = hasExplicitTime ? parts.slice(2) : parts.slice(1);
      const description = remainingParts.join('；');

      current = {
        heading: scene,
        explicitTime: hasExplicitTime ? potentialTime : '',
        lines: description ? [description] : []
      };
      continue;
    }
    if (!current) {
      continue;
    }
    const timeMatch = line.match(/^时间\s*[:：]\s*(.+)$/u);
    if (timeMatch) {
      current.explicitTime = timeMatch[1]!.trim();
      continue;
    }
    if (line.match(/^(角色动作|动作)\s*[:：]\s*(.+)$/u)) {
      current.lines.push(line.replace(/^(角色动作|动作)\s*[:：]\s*/u, '').trim());
      continue;
    }
    current.lines.push(line);
  }
  pushCurrent();
  return blocks;
};

const buildFallbackStoryboardPlans = (script: Script, max = MAX_STORYBOARD_PLAN_COUNT): StoryboardPlan[] =>
  parseStructuredScriptBlocks(script)
    .slice(0, max)
    .map<StoryboardPlan | null>((block, index) => {
      const { scene, time } = splitSceneAndTime(block.heading, block.explicitTime);
      const action = collapseWhitespace(block.lines.filter(Boolean).join('；')).slice(0, 180);
      if (!scene || !action) {
        return null;
      }
      const subject = inferSubject(action, scene);
      const composition = inferComposition(action, scene, index);
      const lighting = inferLighting(time, scene);
      const shotTitle = normalizeShotTitle('', scene, index);
      return {
        shotTitle,
        continuityGroupId: deriveContinuityGroupId({
          scene,
          time: time || '未明确时段',
          sceneEntityId: null,
          characterIds: [],
          subject,
        }),
        scene,
        time: time || '未明确时段',
        subject,
        action,
        composition,
        lighting,
        finalImagePrompt: buildFinalImagePrompt({
          scene,
          time: time || '未明确时段',
          subject,
          action,
          composition,
          lighting
        }),
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
    })
    .filter((item): item is StoryboardPlan => Boolean(item));

export class StoryboardAssetService {
  constructor(
    private readonly store: SqliteStore,
    private readonly provider: AiProvider,
    private readonly deps: StoryboardAssetServiceDeps
  ) {}

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetryImageError(error: unknown): boolean {
    return error instanceof ProviderRateLimitError || error instanceof ProviderTransientError;
  }

  private isDashScopeImageRequest(input: ProviderImageInput): boolean {
    const endpoint = input.modelConfig?.endpoint ?? '';
    const manufacturer = (input.modelConfig?.manufacturer ?? '').toLowerCase();
    return manufacturer === 'wan' || endpoint.includes('dashscope.aliyuncs.com');
  }

  private maybeNormalizeStoryboardRenderPrompt(
    prompt: string,
    plan: StoryboardPlan,
    modelConfig: ModelConfig | null
  ): string {
    const endpoint = modelConfig?.endpoint ?? '';
    const manufacturer = (modelConfig?.manufacturer ?? '').toLowerCase();
    const shouldNormalize = manufacturer === 'wan' || endpoint.includes('dashscope.aliyuncs.com');
    return shouldNormalize ? buildSafeStoryboardRenderPrompt(plan) : prompt;
  }

  private async generateImageWithRetry(input: ProviderImageInput): Promise<{ url: string }> {
    const dashScopeRequest = this.isDashScopeImageRequest(input);
    const retryDelays = dashScopeRequest ? [1200, 2500, 5000] : [800, 1500];
    const maxAttempts = retryDelays.length + 1;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const generated = await this.provider.generateImage(input);
        if (dashScopeRequest) {
          // Keep DashScope image requests slightly spaced to reduce burst-limit hits in batch generation.
          await this.delay(250);
        }
        return generated;
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryImageError(error) || attempt >= maxAttempts) {
          throw error;
        }
        await this.delay(retryDelays[attempt - 1] ?? retryDelays[retryDelays.length - 1] ?? 800);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('image generation failed');
  }

  listStoryboards(projectId: string): Storyboard[] | null {
    return this.store.listStoryboards(projectId);
  }

  listAssets(projectId: string): Asset[] | null {
    return this.store.listAssets(projectId);
  }

  listScenes(projectId: string): Scene[] | null {
    return this.store.listScenes(projectId);
  }

  async generateStoryboards(
    projectId: string,
    scriptId: string,
    options: {
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
      autoExtractEntities?: boolean;
    } = {}
  ): Promise<Storyboard[] | null> {
    const planned = await this.planStoryboards(projectId, scriptId, {
      modelId: options.modelId,
      customModel: options.customModel,
      autoExtractEntities: options.autoExtractEntities ?? true
    });
    if (!planned) {
      return null;
    }
    return this.renderStoryboardImages(projectId, {
      scriptId,
      modelId: options.modelId,
      customModel: options.customModel,
      resolution: options.resolution,
      aspectRatio: options.aspectRatio,
      providerOptions: options.providerOptions
    });
  }

  /**
   * 从剧本自动提取角色和场景实体，并创建Domain实体
   * 这样在规划故事板时就会有实体候选可用了
   * 同时将实体链接到Episode（作为"剧本资产"）
   */
  async extractAndCreateEntitiesFromScript(
    projectId: string,
    scriptId: string,
    options: {
      modelId?: string;
      customModel?: string;
      episodeId?: string; // 新增：指定要链接的Episode
    } = {}
  ): Promise<{ characters: DomainEntity[]; scenes: DomainEntity[]; newCharacters: DomainEntity[]; newScenes: DomainEntity[] } | null> {
    const scripts = this.store.listScripts(projectId);
    if (!scripts) {
      return null;
    }

    const script = scripts.find((item) => item.id === scriptId);
    if (!script) {
      return null;
    }

    // 确定episodeId（优先使用传入的，否则从script获取）
    const episodeId = options.episodeId ?? script.episodeId;

    // 获取当前已有的实体（用于检测新角色）
    const existingRelations = episodeId
      ? this.store.listEpisodeDomainEntityRelations(projectId, episodeId) ?? []
      : [];

    // 获取这些实体的名称
    const entityIds = [...new Set(existingRelations.map((r) => r.entityId))];
    const allDomainEntities = entityIds.length > 0 ? this.store.listDomainEntities(projectId, {}) ?? [] : [];
    const entityMap = new Map(allDomainEntities.map((e) => [e.id, e]));

    const existingCharacterNames = new Set(
      existingRelations
        .filter((r) => r.role === 'character')
        .map((r) => entityMap.get(r.entityId)?.name)
        .filter((name): name is string => !!name)
    );
    const existingSceneNames = new Set(
      existingRelations
        .filter((r) => r.role === 'scene')
        .map((r) => entityMap.get(r.entityId)?.name)
        .filter((name): name is string => !!name)
    );

    const model = this.deps.resolveModelName('text', options.modelId, options.customModel);
    const modelConfig = this.deps.pickModelConfig('text', model);

    // 使用LLM从剧本提取角色和场景
    const extractionPrompt = `你是一个影视制作助手。请仔细阅读以下剧本内容，提取所有出现的角色和场景。

剧本内容：
${script.content}

请以JSON格式返回提取结果：
{
  "characters": [
    {"name": "角色名称", "description": "角色外貌、性格、特点描述"}
  ],
  "scenes": [
    {"name": "场景名称", "description": "场景环境、地点特点描述"}
  ]
}

注意：
1. 只提取主要角色和重要场景
2. description要详细描述角色的外貌和性格，以便后续生成图片
3. 场景名称要简洁明确，如"小蝌蚪的池塘"、"青蛙妈妈的家"等
4. 返回纯JSON，不要其他文字`;

    const result = await this.provider.generateText({
      prompt: extractionPrompt,
      projectId,
      model: modelConfig?.model ?? model,
      modelConfig: modelConfig ? this.deps.toProviderModelConfig(modelConfig) : undefined
    });

    let extracted: { characters: Array<{ name: string; description: string }>; scenes: Array<{ name: string; description: string }> };
    try {
      extracted = JSON.parse(result.text);
    } catch {
      return null;
    }

    const createdCharacters: DomainEntity[] = [];
    const createdScenes: DomainEntity[] = [];

    // 创建角色实体
    for (const char of extracted.characters ?? []) {
      if (!char.name || !char.description) continue;
      const entity = this.store.createDomainEntity({
        id: uuid(),
        projectId,
        type: 'character',
        name: char.name,
        prompt: char.description,
        imageUrl: null
      });
      if (entity) {
        createdCharacters.push(entity);
      }
    }

    // 创建场景实体
    for (const scene of extracted.scenes ?? []) {
      if (!scene.name || !scene.description) continue;
      const entity = this.store.createDomainEntity({
        id: uuid(),
        projectId,
        type: 'scene',
        name: scene.name,
        prompt: scene.description,
        imageUrl: null
      });
      if (entity) {
        createdScenes.push(entity);
      }
    }

    // 检测新角色和新场景（与Episode已有实体对比）
    const newCharacters = createdCharacters.filter((c) => !existingCharacterNames.has(c.name));
    const newScenes = createdScenes.filter((s) => !existingSceneNames.has(s.name));

    // 如果有episodeId，将新创建的实体链接到Episode（作为"剧本资产"）
    if (episodeId && (newCharacters.length > 0 || newScenes.length > 0 || createdCharacters.length > 0 || createdScenes.length > 0)) {
      const characterEntityIds = createdCharacters.map((c) => c.id);
      const sceneEntityIds = createdScenes.map((s) => s.id);

      // 获取Episode当前已关联的实体
      const currentRelations = this.store.listEpisodeDomainEntityRelations(projectId, episodeId) ?? [];
      const existingCharacterIds = currentRelations.filter((r) => r.role === 'character').map((r) => r.entityId);
      const existingSceneIds = currentRelations.filter((r) => r.role === 'scene').map((r) => r.entityId);

      // 合并新旧实体ID
      const allCharacterIds = [...new Set([...existingCharacterIds, ...characterEntityIds])];
      const allSceneIds = [...new Set([...existingSceneIds, ...sceneEntityIds])];

      // 更新Episode的实体关联
      this.store.replaceEpisodeDomainEntityRelations(projectId, episodeId, {
        characterEntityIds: allCharacterIds,
        sceneEntityIds: allSceneIds
      });
    }

    return {
      characters: createdCharacters,
      scenes: createdScenes,
      newCharacters,
      newScenes
    };
  }

  async planStoryboards(
    projectId: string,
    scriptId: string,
    options: {
      modelId?: string;
      customModel?: string;
      autoExtractEntities?: boolean; // 是否自动从剧本提取实体
    } = {}
  ): Promise<Storyboard[] | null> {
    const scripts = this.store.listScripts(projectId);
    if (!scripts) {
      return null;
    }

    const script = scripts.find((item) => item.id === scriptId);
    if (!script) {
      return null;
    }

    let entityContext = this.resolveScriptEntityContext(projectId, script);

    // 如果没有实体且启用了自动提取，则从剧本自动提取实体
    if (options.autoExtractEntities !== false) {
      const hasEntities = entityContext.characters.length > 0 || entityContext.scenes.length > 0;
      if (!hasEntities) {
        const extracted = await this.extractAndCreateEntitiesFromScript(projectId, scriptId, {
          modelId: options.modelId,
          customModel: options.customModel,
          episodeId: script.episodeId ?? undefined
        });
        if (extracted) {
          // 重新获取实体上下文
          entityContext = this.resolveScriptEntityContext(projectId, script);
        }
      }
    }

    const plans = await this.planStoryboardShots(projectId, script, entityContext);
    const items: Array<{ id: string; title: string; prompt: string; plan: StoryboardPlan; imageUrl?: string | null; status: Storyboard['status'] }> = [];
    for (const plan of plans) {
      const compiledPrompt = this.compileStoryboardRenderPrompt(projectId, plan, entityContext);
      items.push({
        id: uuid(),
        title: plan.shotTitle,
        prompt: compiledPrompt,
        plan,
        imageUrl: null,
        status: 'draft',
      });
    }
    const storyboards = this.store.replaceStoryboards(projectId, scriptId, items);
    if (!storyboards) {
      return null;
    }
    for (let index = 0; index < storyboards.length; index += 1) {
      const storyboard = storyboards[index];
      const plan = plans[index];
      if (!storyboard || !plan) {
        continue;
      }
      this.store.replaceStoryboardDomainEntityRelations(projectId, storyboard.id, {
        sceneEntityId: plan.sceneEntityId,
        characterEntityIds: plan.characterIds,
        propEntityIds: plan.propEntityIds
      });
    }
    return this.store.listStoryboardsByScript(projectId, scriptId);
  }

  async renderStoryboardImages(
    projectId: string,
    input: {
      scriptId?: string;
      storyboardIds?: string[];
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<Storyboard[] | null> {
    const storyboards = this.resolveStoryboardRenderTargets(projectId, input);
    if (!storyboards || storyboards.length === 0) {
      return null;
    }
    const projectAssets = this.store.listAssets(projectId) ?? [];
    const updated: Storyboard[] = [];

    for (const storyboard of storyboards) {
      const compiled = this.compileStoryboardPromptByStoryboard(projectId, storyboard);

      // Collect reference images from associated character/scene assets
      const referenceImageUrls: string[] = [];

      // Add scene asset as reference if available
      if (compiled.plan.sceneAssetId) {
        const sceneAsset = projectAssets.find((a) => a.id === compiled.plan.sceneAssetId);
        if (sceneAsset?.imageUrl) {
          referenceImageUrls.push(sceneAsset.imageUrl);
        }
      }

      // Add character assets as references if available
      if (compiled.plan.characterAssetIds && compiled.plan.characterAssetIds.length > 0) {
        for (const assetId of compiled.plan.characterAssetIds) {
          const charAsset = projectAssets.find((a) => a.id === assetId);
          if (charAsset?.imageUrl) {
            referenceImageUrls.push(charAsset.imageUrl);
          }
        }
      }

      // Use IMG2IMG model if there are reference images, otherwise use default T2I model
      const hasReference = referenceImageUrls.length > 0;
      const img2imgMode = hasReference ? 'img2img' : 't2i';
      const selectedImageModelName = this.deps.resolveImageModelByMode(img2imgMode, input.modelId, input.customModel);
      const selectedImageModelConfig = selectedImageModelName ? this.deps.pickModelConfig('image', selectedImageModelName) : null;

      this.deps.validateImageGenerationParams(selectedImageModelConfig, 'storyboard', {
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        providerOptions: input.providerOptions,
      });

      const renderPrompt = this.maybeNormalizeStoryboardRenderPrompt(compiled.prompt, compiled.plan, selectedImageModelConfig);
      const image = await this.generateImageWithRetry({
        prompt: renderPrompt,
        kind: 'storyboard',
        projectId,
        storyboardId: storyboard.id,
        model: selectedImageModelConfig?.model ?? selectedImageModelName ?? this.deps.resolveModelName('image', input.modelId, input.customModel),
        modelConfig: selectedImageModelConfig ? this.deps.toProviderModelConfig(selectedImageModelConfig) : undefined,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        providerOptions: input.providerOptions,
        imageInputs: hasReference ? referenceImageUrls : undefined,
      });

      const next = this.store.updateStoryboard(projectId, storyboard.id, {
        title: compiled.plan.shotTitle,
        prompt: compiled.prompt,
        plan: compiled.plan,
        imageUrl: image.url
      });
      if (next) {
        updated.push(next);
      }
    }
    return updated;
  }

  async generateAssets(
    projectId: string,
    storyboardId: string,
    options: {
      modelId?: string;
      customModel?: string;
      /** Video model for I2V generation of shot-level assets */
      videoModelId?: string;
      videoCustomModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
      /** Asset scope to generate: 'base' = project assets only, 'shot' = storyboard assets only, undefined = all */
      scope?: 'base' | 'shot';
    } = {}
  ): Promise<Asset[] | null> {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }

    // Get drama style for asset generation
    let dramaStyle = '';
    if (storyboard.episodeId) {
      const episode = this.store.getEpisodeById(projectId, storyboard.episodeId);
      if (episode?.dramaId) {
        const drama = this.store.getDramaById(episode.dramaId);
        dramaStyle = drama?.style ?? '';
      }
    }
    const imageModel = this.deps.resolveModelName('image', options.modelId, options.customModel);
    const imageModelConfig = this.deps.pickModelConfig('image', imageModel);
    this.deps.validateImageGenerationParams(imageModelConfig, 'asset', {
      resolution: options.resolution,
      aspectRatio: options.aspectRatio,
      providerOptions: options.providerOptions,
    });

    // Resolve video model for I2V shot-level asset generation
    const videoModel = options.videoModelId
      ? this.deps.resolveModelName('video', options.videoModelId, options.videoCustomModel)
      : null;
    const videoModelConfig = videoModel ? this.deps.pickModelConfig('video', videoModel) : null;

    const projectAssets = this.store.listAssets(projectId) ?? [];
    const existingStoryboardAssets = projectAssets.filter((item) => item.storyboardId === storyboardId);
    const ensuredAssets: Asset[] = [];
    const seeds = this.buildStoryboardAssetSeeds(projectId, storyboard);
    // Filter seeds based on scope parameter
    const filteredSeeds = options.scope
      ? seeds.filter((s) => s.scope === options.scope)
      : seeds;
    const baseAssetMap = new Map<string, Asset>();

    // Pre-populate baseAssetMap with existing base assets from the database
    // This is needed so shot-level assets can reference base assets for IMG2IMG
    for (const asset of projectAssets) {
      if (asset.scope === 'base') {
        const key = this.assetSeedKey({
          role: asset.type as 'character' | 'scene' | 'prop',
          scope: 'base',
          name: asset.name
        });
        baseAssetMap.set(key, asset);
      }
    }
    // Generate base-level assets (always use T2I)
    for (const seed of filteredSeeds.filter((item) => item.scope === 'base')) {
      const existing = projectAssets.find(
        (item) =>
          item.scope === 'base' &&
          item.type === seed.role &&
          item.name.trim().toLowerCase() === seed.name.trim().toLowerCase()
      );
      if (existing) {
        baseAssetMap.set(this.assetSeedKey(seed), existing);
        ensuredAssets.push(existing);
        continue;
      }
      let imageUrl = seed.imageUrl;
      const prompt = this.buildAssetPrompt(seed, undefined, dramaStyle);
      if (!imageUrl) {
        try {
          const image = await this.generateImageWithRetry({
            prompt,
            kind: 'asset',
            projectId,
            storyboardId,
            model: imageModelConfig?.model ?? imageModel,
            modelConfig: imageModelConfig ? this.deps.toProviderModelConfig(imageModelConfig) : undefined,
            resolution: options.resolution,
            aspectRatio: options.aspectRatio,
            providerOptions: options.providerOptions,
          });
          imageUrl = image.url;
          if (seed.entityId) {
            this.store.updateDomainEntity(projectId, seed.entityId, { imageUrl });
          }
        } catch (err) {
          // Continue without failing - create asset with null image
        }
      }
      const created = this.store.createAsset({
        id: uuid(),
        projectId,
        storyboardId,
        name: seed.name,
        type: seed.role,
        scope: seed.scope,
        shareScope: seed.shareScope,
        baseAssetId: null,
        prompt,
        statePrompt: seed.statePrompt,
        state: seed.state,
        imageUrl,
        videoUrl: null,
        firstFrameUrl: null,
        lastFrameUrl: null,
        voiceProfile: seed.voiceProfile ?? null,
      });
      if (created) {
        baseAssetMap.set(this.assetSeedKey(seed), created);
        projectAssets.push(created);
        ensuredAssets.push(created);
      }
    }

    // Generate shot-level assets (use I2V if video model is provided)
    for (const seed of filteredSeeds.filter((item) => item.scope === 'shot')) {
      const existing = existingStoryboardAssets.find(
        (item) =>
          item.scope === 'shot' &&
          item.type === seed.role &&
          item.name.trim().toLowerCase() === seed.name.trim().toLowerCase()
      );
      if (existing) {
        ensuredAssets.push(existing);
        continue;
      }
      const baseAsset =
        seed.baseAssetName
          ? baseAssetMap.get(
              this.assetSeedKey({
                role: seed.role,
                scope: 'base',
                name: seed.baseAssetName,
              })
            ) ?? null
          : null;
      let imageUrl = seed.imageUrl;
      let videoUrl: string | null = null;
      let firstFrameUrl: string | null = null;
      let lastFrameUrl: string | null = null;
      const prompt = this.buildAssetPrompt(seed, baseAsset, dramaStyle);

      if (!imageUrl) {
        // Check if we should use I2V (image-to-video) for shot-level assets
        // I2V requires: video model configured AND base asset exists with an image
        const useI2V = !!(
          videoModel &&
          videoModelConfig &&
          baseAsset?.imageUrl
        );

        if (useI2V) {
          // Use I2V: generate video from base asset image, then extract frames
          const stateDescription = seed.statePrompt || seed.state
            ? `, ${seed.statePrompt || JSON.stringify(seed.state)}`
            : '';

          const videoResult = await this.provider.generateVideoWithFrames({
            projectId,
            storyboardId,
            model: videoModelConfig?.model ?? videoModel,
            modelConfig: videoModelConfig ? this.deps.toProviderModelConfig(videoModelConfig) : undefined,
            mode: 'imageToVideo',
            imageInputs: [baseAsset!.imageUrl!],
            prompt: `${baseAsset!.prompt}${stateDescription}`,
            duration: 5,
            resolution: options.resolution,
            aspectRatio: options.aspectRatio,
            providerOptions: options.providerOptions,
          });

          videoUrl = videoResult.videoUrl;
          firstFrameUrl = videoResult.firstFrameUrl;
          lastFrameUrl = videoResult.lastFrameUrl;
          imageUrl = firstFrameUrl; // Use first frame as the asset image
        } else {
          // Use IMG2IMG: generate image with reference from base asset
          // Select model based on mode: img2img model if has reference, otherwise default
          const hasReference = !!baseAsset?.imageUrl;
          const img2imgMode = hasReference ? 'img2img' : 't2i';
          const selectedImageModelName = this.deps.resolveImageModelByMode(img2imgMode, options.modelId, options.customModel);
          const selectedImageModelConfig = selectedImageModelName ? this.deps.pickModelConfig('image', selectedImageModelName) : null;
          const imageInputs = baseAsset?.imageUrl ? [baseAsset.imageUrl] : undefined;
          const image = await this.generateImageWithRetry({
            prompt,
            kind: 'asset',
            projectId,
            storyboardId,
            model: selectedImageModelConfig?.model ?? selectedImageModelName ?? imageModel,
            modelConfig: selectedImageModelConfig ? this.deps.toProviderModelConfig(selectedImageModelConfig) : undefined,
            resolution: options.resolution,
            aspectRatio: options.aspectRatio,
            providerOptions: options.providerOptions,
            imageInputs,
          });
          imageUrl = image.url;
        }
      }
      const created = this.store.createAsset({
        id: uuid(),
        projectId,
        storyboardId,
        name: seed.name,
        type: seed.role,
        scope: seed.scope,
        shareScope: seed.shareScope,
        baseAssetId: baseAsset?.id ?? null,
        prompt,
        statePrompt: seed.statePrompt,
        state: seed.state,
        imageUrl,
        videoUrl,
        firstFrameUrl,
        lastFrameUrl,
        voiceProfile: seed.voiceProfile ?? baseAsset?.voiceProfile ?? null,
      });
      if (created) {
        ensuredAssets.push(created);
        existingStoryboardAssets.push(created);
        projectAssets.push(created);
      }
    }
    this.syncStoryboardAssetBindings(
      projectId,
      storyboardId,
      ensuredAssets.filter((item) => item.scope === 'shot' || item.storyboardId === storyboardId)
    );
    const preferredScope = options.scope ?? 'shot';
    const scopedAssets = ensuredAssets.filter((item) => item.scope === preferredScope);
    return scopedAssets.length > 0 ? scopedAssets : ensuredAssets;
  }

  async generateShotImage(
    projectId: string,
    storyboardId: string,
    options: {
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      instruction?: string;
      providerOptions?: Record<string, unknown>;
    } = {}
  ): Promise<Storyboard | null> {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }

    const compiled = this.compileStoryboardPromptByStoryboard(projectId, storyboard);

    // Collect reference images from associated character/scene assets
    const projectAssets = this.store.listAssets(projectId) ?? [];
    const referenceImageUrls: string[] = [];

    // Add scene asset as reference if available
    if (compiled.plan.sceneAssetId) {
      const sceneAsset = projectAssets.find((a) => a.id === compiled.plan.sceneAssetId);
      if (sceneAsset?.imageUrl) {
        referenceImageUrls.push(sceneAsset.imageUrl);
      }
    }

    // Add character assets as references if available
    if (compiled.plan.characterAssetIds && compiled.plan.characterAssetIds.length > 0) {
      for (const assetId of compiled.plan.characterAssetIds) {
        const charAsset = projectAssets.find((a) => a.id === assetId);
        if (charAsset?.imageUrl) {
          referenceImageUrls.push(charAsset.imageUrl);
        }
      }
    }

    // Use IMG2IMG model if there are reference images, otherwise use default T2I model
    const hasReference = referenceImageUrls.length > 0;
    const img2imgMode = hasReference ? 'img2img' : 't2i';
    const selectedImageModelName = this.deps.resolveImageModelByMode(img2imgMode, options.modelId, options.customModel);
    const selectedImageModelConfig = selectedImageModelName ? this.deps.pickModelConfig('image', selectedImageModelName) : null;

    this.deps.validateImageGenerationParams(selectedImageModelConfig, 'storyboard', {
      resolution: options.resolution,
      aspectRatio: options.aspectRatio,
      providerOptions: options.providerOptions,
    });

    const prompt = options.instruction?.trim()
      ? `${compiled.prompt}\n补充要求：${options.instruction.trim()}`
      : compiled.prompt;
    const renderPrompt = this.maybeNormalizeStoryboardRenderPrompt(prompt, compiled.plan, selectedImageModelConfig);
    const image = await this.generateImageWithRetry({
      prompt: renderPrompt,
      kind: 'storyboard',
      projectId,
      storyboardId,
      model: selectedImageModelConfig?.model ?? selectedImageModelName ?? this.deps.resolveModelName('image', options.modelId, options.customModel),
      modelConfig: selectedImageModelConfig ? this.deps.toProviderModelConfig(selectedImageModelConfig) : undefined,
      resolution: options.resolution,
      aspectRatio: options.aspectRatio,
      providerOptions: options.providerOptions,
      imageInputs: hasReference ? referenceImageUrls : undefined,
    });

    return this.store.updateStoryboard(projectId, storyboardId, {
      title: compiled.plan.shotTitle,
      prompt,
      plan: compiled.plan,
      imageUrl: image.url
    });
  }

  async batchSuperResStoryboards(
    projectId: string,
    input: {
      storyboardIds?: string[];
      scale?: number;
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
    } = {}
  ): Promise<{
    updated: Storyboard[];
    skippedIds: string[];
    notFoundIds: string[];
  } | null> {
    const storyboards = this.store.listStoryboards(projectId);
    if (!storyboards) {
      return null;
    }

    const targetIds =
      Array.isArray(input.storyboardIds) && input.storyboardIds.length > 0
        ? [...new Set(input.storyboardIds)]
        : storyboards.map((item) => item.id);
    const storyboardMap = new Map(storyboards.map((item) => [item.id, item]));
    const updated: Storyboard[] = [];
    const skippedIds: string[] = [];
    const notFoundIds: string[] = [];

    for (const storyboardId of targetIds) {
      const storyboard = storyboardMap.get(storyboardId);
      if (!storyboard) {
        notFoundIds.push(storyboardId);
        continue;
      }
      if (!storyboard.imageUrl) {
        skippedIds.push(storyboardId);
        continue;
      }

      const next = await this.generateShotImage(projectId, storyboardId, {
        modelId: input.modelId,
        customModel: input.customModel,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        instruction: `请对已有镜头图进行${input.scale ?? 2}x超分增强并保留构图一致性。原图：${storyboard.imageUrl}`,
      });
      if (next) {
        updated.push(next);
      } else {
        skippedIds.push(storyboardId);
      }
    }

    return { updated, skippedIds, notFoundIds };
  }

  uploadStoryboardImage(projectId: string, storyboardId: string, imageUrl: string): Storyboard | null {
    return this.store.updateStoryboard(projectId, storyboardId, { imageUrl });
  }

  updateStoryboard(
    projectId: string,
    storyboardId: string,
    input: { title?: string; prompt?: string; imageUrl?: string | null; sceneId?: string | null; episodeId?: string | null }
  ): Storyboard | null {
    return this.store.updateStoryboard(projectId, storyboardId, input);
  }

  createScene(projectId: string, input: { name: string; description?: string; prompt?: string }): Scene | null {
    return this.store.createScene({
      id: uuid(),
      projectId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      prompt: input.prompt?.trim() || '',
    });
  }

  updateScene(projectId: string, sceneId: string, input: { name?: string; description?: string; prompt?: string }): Scene | null {
    return this.store.updateScene(projectId, sceneId, input);
  }

  deleteScene(projectId: string, sceneId: string): boolean {
    return this.store.deleteScene(projectId, sceneId);
  }

  listStoryboardAssetRelations(projectId: string, storyboardId: string): StoryboardAssetRelation[] | null {
    return this.store.listStoryboardAssetRelations(projectId, storyboardId);
  }

  replaceStoryboardAssetRelations(
    projectId: string,
    storyboardId: string,
    input: { sceneAssetId?: string | null; characterAssetIds?: string[]; propAssetIds?: string[] }
  ): StoryboardAssetRelation[] | null {
    return this.store.replaceStoryboardAssetRelations(projectId, storyboardId, input);
  }

  createAsset(
    projectId: string,
    input: {
      storyboardId: string;
      name: string;
      type: 'character' | 'scene' | 'prop';
      prompt: string;
      imageUrl?: string | null;
      voiceProfile?: Asset['voiceProfile'];
    }
  ): Asset | null {
    return this.store.createAsset({
      id: uuid(),
      projectId,
      storyboardId: input.storyboardId,
      name: input.name,
      type: input.type,
      prompt: input.prompt,
      imageUrl: input.imageUrl,
      voiceProfile: input.voiceProfile ?? null,
    });
  }

  updateAsset(
    projectId: string,
    assetId: string,
    input: {
      name?: string;
      type?: 'character' | 'scene' | 'prop';
      prompt?: string;
      imageUrl?: string | null;
      voiceProfile?: Asset['voiceProfile'];
    }
  ): Asset | null {
    return this.store.updateAsset(projectId, assetId, input);
  }

  deleteAsset(projectId: string, assetId: string): boolean {
    return this.store.deleteAsset(projectId, assetId);
  }

  async polishAssetPrompt(
    projectId: string,
    assetId: string,
    input: { instruction?: string; modelId?: string; customModel?: string }
  ): Promise<Asset | null> {
    const asset = this.store.getAsset(projectId, assetId);
    if (!asset) {
      return null;
    }
    const { model, modelConfig } = this.buildTextRequest(input.modelId, input.customModel);
    const prompt = `你是提示词优化师。请润色资产生成提示词，只输出润色结果。\n当前提示词：${asset.prompt}\n优化目标：${input.instruction ?? '提升细节、可控性、镜头语言和材质描述'}`;
    const result = await this.provider.generateText({ prompt, projectId, model, modelConfig });
    return this.store.updateAsset(projectId, assetId, { prompt: result.text.trim() || asset.prompt });
  }

  async redrawAssetImage(
    projectId: string,
    assetId: string,
    input: {
      instruction?: string;
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
    }
  ): Promise<Asset | null> {
    const asset = this.store.getAsset(projectId, assetId);
    if (!asset) {
      return null;
    }

    const imageModel = this.deps.resolveModelName('image', input.modelId, input.customModel);
    const imageModelConfig = this.deps.pickModelConfig('image', imageModel);
    this.deps.validateImageGenerationParams(imageModelConfig, 'asset', {
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      providerOptions: input.providerOptions,
    });

    const prompt = input.instruction?.trim() ? `${asset.prompt}\n补充要求：${input.instruction.trim()}` : asset.prompt;
    // Use base asset as reference for img2img if available
    const imageInputs = asset.baseAssetId
      ? [this.store.getAsset(projectId, asset.baseAssetId)?.imageUrl].filter((url): url is string => !!url)
      : undefined;
    const image = await this.generateImageWithRetry({
      prompt,
      kind: 'asset',
      projectId,
      storyboardId: asset.storyboardId,
      model: imageModelConfig?.model ?? imageModel,
      modelConfig: imageModelConfig ? this.deps.toProviderModelConfig(imageModelConfig) : undefined,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      providerOptions: input.providerOptions,
      imageInputs,
    });

    return this.store.updateAsset(projectId, assetId, { imageUrl: image.url });
  }

  async generateEpisodeAssetsBatch(
    projectId: string,
    episodeId: string,
    options: {
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
      /** Asset scope to generate: 'base' = project assets only, 'shot' = storyboard assets only, undefined = all */
      scope?: 'base' | 'shot';
    } = {}
  ): Promise<{
    assets: Asset[];
    createdStoryboardIds: string[];
    skippedStoryboardIds: string[];
    failedStoryboardIds: string[];
    failures: Array<{ storyboardId: string; storyboardTitle: string; message: string }>;
  } | null> {
    const storyboards = this.store.listStoryboardsByEpisode(projectId, episodeId);
    if (!storyboards) {
      return null;
    }
    const createdStoryboardIds: string[] = [];
    const skippedStoryboardIds: string[] = [];
    const failedStoryboardIds: string[] = [];
    const failures: Array<{ storyboardId: string; storyboardTitle: string; message: string }> = [];

    for (const storyboard of storyboards) {
      const projectAssets = this.store.listAssets(projectId) ?? [];
      // If scope is 'base', only check base assets; if 'shot', only check shot assets; if undefined, check all
      if (options.scope === 'base') {
        if (this.hasCompleteBaseAssets(projectId, storyboard, projectAssets)) {
          skippedStoryboardIds.push(storyboard.id);
          continue;
        }
      } else if (options.scope === 'shot') {
        if (this.hasCompleteShotAssets(projectId, storyboard, projectAssets)) {
          skippedStoryboardIds.push(storyboard.id);
          continue;
        }
      } else if (this.hasCompleteStoryboardAssets(projectId, storyboard, projectAssets)) {
        skippedStoryboardIds.push(storyboard.id);
        continue;
      }
      try {
        const generated = await this.generateAssets(projectId, storyboard.id, options);
        const nextProjectAssets = this.store.listAssets(projectId) ?? [];
        // If any assets were generated, count as success - don't require all to be complete
        if (generated && generated.length > 0) {
          createdStoryboardIds.push(storyboard.id);
        } else {
          skippedStoryboardIds.push(storyboard.id);
        }
      } catch (err) {
        failedStoryboardIds.push(storyboard.id);
        failures.push({
          storyboardId: storyboard.id,
          storyboardTitle: storyboard.title,
          message: err instanceof Error ? err.message : '资产生成失败'
        });
      }
    }

    const finalAssets = this.store.listAssets(projectId) ?? [];
    return {
      assets: finalAssets,
      createdStoryboardIds,
      skippedStoryboardIds,
      failedStoryboardIds,
      failures
    };
  }

  async generateEpisodesAssetsBatch(
    projectId: string,
    input: {
      episodeIds?: string[];
      modelId?: string;
      customModel?: string;
      resolution?: string;
      aspectRatio?: string;
      providerOptions?: Record<string, unknown>;
      scope?: 'base' | 'shot';
    } = {}
  ): Promise<
    | {
        episodes: Array<{
          episodeId: string;
          createdStoryboardIds: string[];
          skippedStoryboardIds: string[];
          failedStoryboardIds: string[];
          createdCount: number;
          skippedCount: number;
          failedCount: number;
          failures: Array<{ storyboardId: string; storyboardTitle: string; message: string }>;
        }>;
        totalEpisodes: number;
      }
    | null
  > {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const filterIds = input.episodeIds && input.episodeIds.length > 0 ? new Set(input.episodeIds) : null;
    const target = filterIds ? episodes.filter((item) => filterIds.has(item.id)) : episodes;
    const rows: Array<{
      episodeId: string;
      createdStoryboardIds: string[];
      skippedStoryboardIds: string[];
      failedStoryboardIds: string[];
      createdCount: number;
      skippedCount: number;
      failedCount: number;
      failures: Array<{ storyboardId: string; storyboardTitle: string; message: string }>;
    }> = [];
    for (const episode of target) {
      const item = await this.generateEpisodeAssetsBatch(projectId, episode.id, {
        modelId: input.modelId,
        customModel: input.customModel,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        providerOptions: input.providerOptions,
        scope: input.scope,
      });
      rows.push({
        episodeId: episode.id,
        createdStoryboardIds: item?.createdStoryboardIds ?? [],
        skippedStoryboardIds: item?.skippedStoryboardIds ?? [],
        failedStoryboardIds: item?.failedStoryboardIds ?? [],
        createdCount: item?.createdStoryboardIds.length ?? 0,
        skippedCount: item?.skippedStoryboardIds.length ?? 0,
        failedCount: item?.failedStoryboardIds.length ?? 0,
        failures: item?.failures ?? [],
      });
    }
    return {
      episodes: rows,
      totalEpisodes: rows.length,
    };
  }

  precheckEpisodesAssetsBatch(
    projectId: string,
    input: {
      episodeIds?: string[];
    } = {}
  ):
    | {
        episodes: Array<{
          episodeId: string;
          totalStoryboards: number;
          creatableStoryboardIds: string[];
          conflictStoryboardIds: string[];
          conflictReason: 'asset_exists';
        }>;
        summary: {
          totalEpisodes: number;
          totalStoryboards: number;
          totalCreatable: number;
          totalConflicts: number;
        };
      }
    | null {
    const episodes = this.store.listEpisodes(projectId);
    if (!episodes) {
      return null;
    }
    const filterIds = input.episodeIds && input.episodeIds.length > 0 ? new Set(input.episodeIds) : null;
    const target = filterIds ? episodes.filter((item) => filterIds.has(item.id)) : episodes;
    const allAssets = this.store.listAssets(projectId) ?? [];
    const rows = target.map((episode) => {
      const storyboards = this.store.listStoryboardsByEpisode(projectId, episode.id) ?? [];
      const creatableStoryboardIds = storyboards
        .filter((item) => !this.hasCompleteStoryboardAssets(projectId, item, allAssets))
        .map((item) => item.id);
      const conflictStoryboardIds = storyboards
        .filter((item) => this.hasCompleteStoryboardAssets(projectId, item, allAssets))
        .map((item) => item.id);
      return {
        episodeId: episode.id,
        totalStoryboards: storyboards.length,
        creatableStoryboardIds,
        conflictStoryboardIds,
        conflictReason: 'asset_exists' as const,
      };
    });
    return {
      episodes: rows,
      summary: {
        totalEpisodes: rows.length,
        totalStoryboards: rows.reduce((sum, item) => sum + item.totalStoryboards, 0),
        totalCreatable: rows.reduce((sum, item) => sum + item.creatableStoryboardIds.length, 0),
        totalConflicts: rows.reduce((sum, item) => sum + item.conflictStoryboardIds.length, 0),
      },
    };
  }

  private listActiveDomainEntities(projectId: string, type: 'character' | 'scene' | 'prop'): DomainEntity[] {
    return (this.store.listDomainEntities(projectId, { type }) ?? []).filter((item) => item.lifecycleStatus !== 'archived');
  }

  private resolveStoryboardEntityContext(
    projectId: string,
    input: { episodeId?: string; storyboardId?: string }
  ): StoryboardEntityContext {
    const pickCandidates = (type: 'character' | 'scene' | 'prop'): DomainEntity[] => {
      const all = this.listActiveDomainEntities(projectId, type);
      const episodeIds = new Set(
        (input.episodeId ? this.store.listEpisodeDomainEntityRelations(projectId, input.episodeId) ?? [] : [])
          .filter((item) => item.role === type)
          .map((item) => item.entityId)
      );
      const storyboardIds = new Set(
        (input.storyboardId ? this.store.listStoryboardDomainEntityRelations(projectId, input.storyboardId) ?? [] : [])
          .filter((item) => item.role === type)
          .map((item) => item.entityId)
      );
      const preferredIds = storyboardIds.size > 0 ? storyboardIds : episodeIds;
      if (preferredIds.size === 0) {
        return all;
      }
      return all.filter((item) => preferredIds.has(item.id));
    };
    return {
      episodeId: input.episodeId,
      characters: pickCandidates('character'),
      scenes: pickCandidates('scene'),
      props: pickCandidates('prop')
    };
  }

  private resolveScriptEntityContext(projectId: string, script: Script): StoryboardEntityContext {
    return this.resolveStoryboardEntityContext(projectId, { episodeId: script.episodeId ?? undefined });
  }

  private buildPlannerEntityCatalog(context: StoryboardEntityContext): string {
    const sections: string[] = [];
    const toLines = (label: string, items: DomainEntity[]): string | null => {
      if (items.length === 0) {
        return null;
      }
      return `${label}：\n${items
        .slice(0, 16)
        .map((item) => `- id=${item.id}; name=${item.name}; prompt=${collapseWhitespace(item.prompt).slice(0, 120)}`)
        .join('\n')}`;
    };
    for (const section of [
      toLines('角色候选（若镜头命中请填写 characterIds）', context.characters),
      toLines('场景候选（若镜头命中请填写 sceneEntityId）', context.scenes),
      toLines('道具候选（若镜头命中请填写 propEntityIds）', context.props)
    ]) {
      if (section) {
        sections.push(section);
      }
    }
    return sections.join('\n\n');
  }

  private inferEntityIdsByText(candidates: DomainEntity[], text: string, max = Number.POSITIVE_INFINITY): string[] {
    const scope = collapseWhitespace(text);
    if (!scope) {
      return [];
    }
    return candidates
      .filter((item) => scope.includes(item.name) || item.name.includes(scope))
      .map((item) => item.id)
      .slice(0, max);
  }

  private hydrateStoryboardPlanWithContext(plan: StoryboardPlan, context: StoryboardEntityContext): StoryboardPlan {
    const characterIdSet = new Set(context.characters.map((item) => item.id));
    const sceneIdSet = new Set(context.scenes.map((item) => item.id));
    const propIdSet = new Set(context.props.map((item) => item.id));
    const scopeText = `${plan.subject} ${plan.action} ${plan.scene} ${plan.finalImagePrompt}`;
    const sceneScope = `${plan.scene} ${plan.finalImagePrompt}`;

    const characterIds = uniqueIds(plan.characterIds.filter((item) => characterIdSet.has(item)));
    const sceneEntityId = plan.sceneEntityId && sceneIdSet.has(plan.sceneEntityId) ? plan.sceneEntityId : null;
    const propEntityIds = uniqueIds(plan.propEntityIds.filter((item) => propIdSet.has(item)));
    const resolvedCharacterIds =
      characterIds.length > 0 ? characterIds : this.inferEntityIdsByText(context.characters, scopeText, 4);
    const resolvedSceneEntityId = sceneEntityId ?? this.inferEntityIdsByText(context.scenes, sceneScope, 1)[0] ?? null;

    return {
      ...plan,
      continuityGroupId:
        plan.continuityGroupId ||
        deriveContinuityGroupId({
          scene: plan.scene,
          time: plan.time,
          sceneEntityId: resolvedSceneEntityId,
          characterIds: resolvedCharacterIds,
          subject: plan.subject,
        }),
      characterIds: resolvedCharacterIds,
      sceneEntityId: resolvedSceneEntityId,
      propEntityIds: propEntityIds.length > 0 ? propEntityIds : this.inferEntityIdsByText(context.props, scopeText, 6)
    };
  }

  private findFallbackBaseSceneAsset(projectId: string, plan: StoryboardPlan, assets: Asset[]): Asset | null {
    const candidates = assets.filter((item) => item.type === 'scene' && item.scope === 'base');
    if (plan.baseSceneAssetId) {
      return candidates.find((item) => item.id === plan.baseSceneAssetId) ?? null;
    }
    if (plan.sceneEntityId) {
      const sceneEntity = this.store.getDomainEntity(projectId, plan.sceneEntityId);
      if (sceneEntity) {
        return candidates.find((item) => item.name === `${sceneEntity.name}-场景主资产`) ?? null;
      }
    }
    const sceneToken = collapseWhitespace(plan.scene);
    if (!sceneToken) {
      return null;
    }
    return candidates.find((item) => item.name.includes(sceneToken) || sceneToken.includes(item.name.replace(/-场景主资产$/u, ''))) ?? null;
  }

  private findFallbackBaseCharacterAssets(projectId: string, plan: StoryboardPlan, assets: Asset[]): Asset[] {
    const candidates = assets.filter((item) => item.type === 'character' && item.scope === 'base');
    const directMatches = uniqueIds(plan.baseCharacterAssetIds)
      .map((assetId) => candidates.find((item) => item.id === assetId) ?? null)
      .filter((item): item is Asset => Boolean(item));
    if (directMatches.length > 0) {
      return directMatches;
    }
    const fromEntityIds = uniqueIds(plan.characterIds)
      .map((entityId) => this.store.getDomainEntity(projectId, entityId))
      .filter((item): item is DomainEntity => Boolean(item))
      .map((entity) => candidates.find((item) => item.name === `${entity.name}-角色主资产`) ?? null)
      .filter((item): item is Asset => Boolean(item));
    if (fromEntityIds.length > 0) {
      return fromEntityIds;
    }
    const subjectToken = collapseWhitespace(plan.subject);
    if (!subjectToken) {
      return [];
    }
    return candidates.filter((item) => item.name.includes(subjectToken)).slice(0, 3);
  }

  private resolveStoryboardRenderTargets(
    projectId: string,
    input: { scriptId?: string; storyboardIds?: string[] }
  ): Storyboard[] | null {
    if (input.scriptId?.trim()) {
      return this.store.listStoryboardsByScript(projectId, input.scriptId.trim());
    }
    if (Array.isArray(input.storyboardIds) && input.storyboardIds.length > 0) {
      const items = input.storyboardIds
        .map((storyboardId) => this.store.getStoryboard(projectId, storyboardId))
        .filter((item): item is Storyboard => Boolean(item));
      return items.length > 0 ? items : null;
    }
    return null;
  }

  private attachStoryboardAssetIds(projectId: string, storyboardId: string, plan: StoryboardPlan): StoryboardPlan {
    const relations = this.store.listStoryboardAssetRelations(projectId, storyboardId) ?? [];
    const projectAssets = this.store.listAssets(projectId) ?? [];
    const relationAssets = relations
      .map((item) => this.store.getAsset(projectId, item.assetId))
      .filter((item): item is Asset => Boolean(item));
    const shotSceneState = relationAssets.find((item) => item.type === 'scene' && item.scope === 'shot') ?? null;
    const shotCharacterStates = relationAssets.filter((item) => item.type === 'character' && item.scope === 'shot');
    const baseSceneAsset =
      (shotSceneState?.baseAssetId ? this.store.getAsset(projectId, shotSceneState.baseAssetId) : null) ??
      this.findFallbackBaseSceneAsset(projectId, plan, projectAssets);
    const baseCharacterAssets = [
      ...shotCharacterStates
        .map((item) => (item.baseAssetId ? this.store.getAsset(projectId, item.baseAssetId) : null))
        .filter((item): item is Asset => Boolean(item)),
      ...this.findFallbackBaseCharacterAssets(projectId, plan, projectAssets),
    ];
    const sceneAssetId = plan.sceneAssetId ?? shotSceneState?.id ?? relations.find((item) => item.role === 'scene')?.assetId ?? null;
    const shotCharacterStateIds = uniqueIds([
      ...plan.shotCharacterStateIds,
      ...shotCharacterStates.map((item) => item.id),
    ]);
    const characterAssetIds = uniqueIds([
      ...plan.characterAssetIds,
      ...shotCharacterStateIds,
      ...relations.filter((item) => item.role === 'character').map((item) => item.assetId)
    ]);
    const propAssetIds = uniqueIds([
      ...plan.propAssetIds,
      ...relations.filter((item) => item.role === 'prop').map((item) => item.assetId)
    ]);
    return {
      ...plan,
      continuityGroupId:
        plan.continuityGroupId ||
        deriveContinuityGroupId({
          scene: plan.scene,
          time: plan.time,
          sceneEntityId: plan.sceneEntityId,
          characterIds: plan.characterIds,
          subject: plan.subject,
        }),
      baseSceneAssetId: plan.baseSceneAssetId ?? baseSceneAsset?.id ?? null,
      baseCharacterAssetIds: uniqueIds([
        ...plan.baseCharacterAssetIds,
        ...baseCharacterAssets.map((item) => item.id),
      ]),
      shotSceneStateId: plan.shotSceneStateId ?? shotSceneState?.id ?? null,
      shotCharacterStateIds,
      sceneAssetId,
      characterAssetIds,
      propAssetIds
    };
  }

  private compileStoryboardRenderPrompt(
    projectId: string,
    plan: StoryboardPlan,
    context: StoryboardEntityContext
  ): string {
    const pickEntity = (items: DomainEntity[], entityId: string | null): DomainEntity | null =>
      entityId ? items.find((item) => item.id === entityId) ?? null : null;
    const sceneEntity = pickEntity(context.scenes, plan.sceneEntityId);
    const characterEntities = plan.characterIds
      .map((entityId) => pickEntity(context.characters, entityId))
      .filter((item): item is DomainEntity => Boolean(item));
    const propEntities = plan.propEntityIds
      .map((entityId) => pickEntity(context.props, entityId))
      .filter((item): item is DomainEntity => Boolean(item));
    const sceneAsset = plan.sceneAssetId ? this.store.getAsset(projectId, plan.sceneAssetId) : null;
    const characterAssets = plan.characterAssetIds
      .map((assetId) => this.store.getAsset(projectId, assetId))
      .filter((item): item is Asset => Boolean(item));
    const propAssets = plan.propAssetIds
      .map((assetId) => this.store.getAsset(projectId, assetId))
      .filter((item): item is Asset => Boolean(item));

    // Get drama style for storyboard generation
    let dramaStyle = '';
    if (context.episodeId) {
      const episode = this.store.getEpisodeById(projectId, context.episodeId);
      if (episode?.dramaId) {
        const drama = this.store.getDramaById(episode.dramaId);
        dramaStyle = drama?.style ?? '';
      }
    }
    const stylePrefix = dramaStyle ? `${dramaStyle}风格，` : '';

    return collapseWhitespace(
      [
        stylePrefix + plan.finalImagePrompt,
        sceneEntity ? `场景设定：${sceneEntity.name}；${sceneEntity.prompt}` : '',
        sceneAsset ? `场景资产基准：${sceneAsset.name}；${sceneAsset.prompt}${sceneAsset.imageUrl ? `；参考图=${sceneAsset.imageUrl}` : ''}` : '',
        ...characterEntities.map((item) => `角色设定：${item.name}；${item.prompt}${item.imageUrl ? `；参考图=${item.imageUrl}` : ''}`),
        ...characterAssets.map((item) => `角色资产基准：${item.name}；${item.prompt}${item.imageUrl ? `；参考图=${item.imageUrl}` : ''}`),
        ...propEntities.map((item) => `道具设定：${item.name}；${item.prompt}${item.imageUrl ? `；参考图=${item.imageUrl}` : ''}`),
        ...propAssets.map((item) => `道具资产基准：${item.name}；${item.prompt}${item.imageUrl ? `；参考图=${item.imageUrl}` : ''}`),
        '保持同一角色、场景、道具在跨镜头中的外观一致，不要随意改造型'
      ]
        .filter(Boolean)
        .join('；')
    );
  }

  private compileStoryboardPromptByStoryboard(
    projectId: string,
    storyboard: Storyboard
  ): { plan: StoryboardPlan; prompt: string } {
    const context = this.resolveStoryboardEntityContext(projectId, {
      episodeId: storyboard.episodeId ?? undefined,
      storyboardId: storyboard.id
    });
    const basePlan =
      storyboard.plan ??
      ({
        shotTitle: storyboard.title,
        continuityGroupId: deriveContinuityGroupId({
          scene: '',
          time: '未明确时段',
          sceneEntityId: null,
          characterIds: [],
          subject: '画面主体人物',
        }),
        scene: '',
        time: '未明确时段',
        subject: '画面主体人物',
        action: storyboard.prompt,
        composition: '电影感中景构图，主体明确，景别和空间关系清楚',
        lighting: '自然主光明确，前后景层次清楚，画面通透',
        finalImagePrompt: storyboard.prompt,
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
      } satisfies StoryboardPlan);
    const hydrated = this.attachStoryboardAssetIds(projectId, storyboard.id, this.hydrateStoryboardPlanWithContext(basePlan, context));
    return {
      plan: hydrated,
      prompt: this.compileStoryboardRenderPrompt(projectId, hydrated, context)
    };
  }

  private buildStoryboardAssetSeeds(projectId: string, storyboard: Storyboard): StoryboardAssetSeed[] {
    const compiled = this.compileStoryboardPromptByStoryboard(projectId, storyboard);
    const context = this.resolveStoryboardEntityContext(projectId, {
      episodeId: storyboard.episodeId ?? undefined,
      storyboardId: storyboard.id
    });
    const sceneEntity = compiled.plan.sceneEntityId ? context.scenes.find((item) => item.id === compiled.plan.sceneEntityId) ?? null : null;
    const characterEntities = compiled.plan.characterIds
      .map((entityId) => context.characters.find((item) => item.id === entityId) ?? null)
      .filter((item): item is DomainEntity => Boolean(item));
    const propEntities = compiled.plan.propEntityIds
      .map((entityId) => context.props.find((item) => item.id === entityId) ?? null)
      .filter((item): item is DomainEntity => Boolean(item));

    const seeds: StoryboardAssetSeed[] = [];
    if (sceneEntity) {
      seeds.push({
        role: 'scene',
        scope: 'base',
        shareScope: 'project',
        bindToStoryboard: false,
        reuseAcrossProject: true,
        entityId: sceneEntity.id,
        name: `${sceneEntity.name}-场景主资产`,
        prompt: sceneEntity.prompt,
        statePrompt: null,
        state: null,
        baseAssetName: null,
        voiceProfile: null,
        imageUrl: sceneEntity.imageUrl
      });
    }
    const relatedAssets = this.store.listAssets(projectId) ?? [];
    if (characterEntities.length > 0) {
      for (const entity of characterEntities) {
        const voiceProfile =
          relatedAssets.find((item) => item.type === 'character' && item.scope === 'base' && item.name.includes(entity.name))
            ?.voiceProfile ?? null;
        seeds.push({
          role: 'character',
          scope: 'base',
          shareScope: 'project',
          bindToStoryboard: false,
          reuseAcrossProject: true,
          entityId: entity.id,
          name: `${entity.name}-角色主资产`,
          prompt: collapseWhitespace(
            [
              `项目角色主资产：${entity.name}`,
              entity.prompt,
              '统一角色三视图、面部一致性、固定服装方案和体态比例'
            ].join('；')
          ),
          statePrompt: null,
          state: null,
          baseAssetName: null,
          voiceProfile: voiceProfile,
          imageUrl: entity.imageUrl
        });
      }
    } else {
      const fallbackCharacterToken = deriveCharacterSeedToken(compiled.plan);
      if (fallbackCharacterToken) {
        const fallbackCharacterBaseName = deriveCharacterBaseLabel(storyboard, compiled.plan);
        const voiceProfile =
          relatedAssets.find(
            (item) =>
              item.type === 'character' &&
              item.scope === 'base' &&
              item.name.trim().toLowerCase() === fallbackCharacterBaseName.trim().toLowerCase()
          )?.voiceProfile ?? null;
        seeds.push({
          role: 'character',
          scope: 'base',
          shareScope: 'project',
          bindToStoryboard: false,
          reuseAcrossProject: true,
          entityId: null,
          name: fallbackCharacterBaseName,
          prompt: buildCharacterBasePrompt(storyboard, compiled.plan),
          statePrompt: null,
          state: null,
          baseAssetName: null,
          voiceProfile,
          imageUrl: null
        });
      }
    }
    for (const entity of propEntities) {
      seeds.push({
        role: 'prop',
        scope: 'base',
        shareScope: 'project',
        bindToStoryboard: false,
        reuseAcrossProject: true,
        entityId: entity.id,
        name: `${entity.name}-道具主资产`,
        prompt: entity.prompt,
        statePrompt: null,
        state: null,
        baseAssetName: null,
        voiceProfile: null,
        imageUrl: entity.imageUrl
      });
    }

    const sceneBaseName =
      sceneEntity?.name ? `${sceneEntity.name}-场景主资产` : deriveSceneBaseLabel(storyboard, compiled.plan);
    if (!sceneEntity) {
      seeds.push({
        role: 'scene',
        scope: 'base',
        shareScope: 'project',
        bindToStoryboard: false,
        reuseAcrossProject: true,
        entityId: null,
        name: sceneBaseName,
        prompt: buildSceneBasePrompt(storyboard, compiled.plan),
        statePrompt: null,
        state: null,
        baseAssetName: null,
        voiceProfile: null,
        imageUrl: null
      });
    }

    if (characterEntities.length > 0) {
      for (const entity of characterEntities) {
        seeds.push({
          role: 'character',
          scope: 'shot',
          shareScope: 'project',
          bindToStoryboard: true,
          reuseAcrossProject: false,
          entityId: entity.id,
          name: `${storyboard.title}-${entity.name}-角色镜头状态`,
          prompt: compiled.prompt,
          statePrompt: collapseWhitespace(
            [
              `镜头级角色状态：${entity.name}`,
              `镜头：${compiled.plan.shotTitle}`,
              `动作：${compiled.plan.action}`,
              `情绪：${inferEmotionFromAction(compiled.plan.action)}`,
              '沿用角色主资产的面部、发型和固定服装方案'
            ].join('；')
          ),
          state: buildCharacterShotState(compiled.plan),
          baseAssetName: `${entity.name}-角色主资产`,
          voiceProfile: null,
          imageUrl: null
        });
      }
    } else {
      const fallbackCharacterToken = deriveCharacterSeedToken(compiled.plan);
      if (fallbackCharacterToken) {
        const fallbackCharacterBaseName = deriveCharacterBaseLabel(storyboard, compiled.plan);
        seeds.push({
          role: 'character',
          scope: 'shot',
          shareScope: 'project',
          bindToStoryboard: true,
          reuseAcrossProject: false,
          entityId: null,
          name: `${storyboard.title}-${fallbackCharacterToken}-角色镜头状态`,
          prompt: compiled.prompt,
          statePrompt: collapseWhitespace(
            [
              `镜头级角色状态：${fallbackCharacterToken}`,
              `镜头：${compiled.plan.shotTitle}`,
              `动作：${compiled.plan.action}`,
              `情绪：${inferEmotionFromAction(compiled.plan.action)}`,
              '沿用角色主资产的面部、发型和固定服装方案'
            ].join('；')
          ),
          state: buildCharacterShotState(compiled.plan),
          baseAssetName: fallbackCharacterBaseName,
          voiceProfile: null,
          imageUrl: null
        });
      }
    }

    seeds.push({
      role: 'scene',
      scope: 'shot',
      shareScope: 'project',
      bindToStoryboard: true,
      reuseAcrossProject: false,
      entityId: null,
      name: `${storyboard.title}-场景镜头状态`,
      prompt: compiled.prompt,
      statePrompt: collapseWhitespace(
        [
          `镜头级场景状态：${compiled.plan.shotTitle}`,
          compiled.plan.scene ? `场景：${compiled.plan.scene}` : '',
          compiled.plan.time ? `时间：${compiled.plan.time}` : '',
          `光线：${compiled.plan.lighting}`,
          `机位：${compiled.plan.composition}`,
          `局部变化：${compiled.plan.action}`
        ]
          .filter(Boolean)
          .join('；')
      ),
      state: buildSceneShotState(compiled.plan),
      baseAssetName: sceneBaseName,
      voiceProfile: null,
      imageUrl: null
    });
    return seeds;
  }

  private buildAssetPrompt(seed: StoryboardAssetSeed, baseAsset: Asset | null = null, dramaStyle: string = ''): string {
    const baseReference = baseAsset
      ? collapseWhitespace(
          [
            `基础资产：${baseAsset.name}`,
            baseAsset.prompt,
            baseAsset.imageUrl ? `参考图=${baseAsset.imageUrl}` : ''
          ]
            .filter(Boolean)
            .join('；')
        )
      : '';

    // Add style prefix if drama style is set
    const stylePrefix = dramaStyle ? `${dramaStyle}风格，` : '';

    if (seed.role === 'character') {
      if (seed.scope === 'base') {
        return `${stylePrefix}${seed.prompt}；角色主资产设定图，输出三视图与标准像，统一造型、服装、面部一致性。`;
      }
      return collapseWhitespace(
        [
          stylePrefix + (seed.statePrompt ?? seed.prompt),
          baseReference,
          '镜头级角色状态图，以主资产的角色脸、发型和服装为主体，动作和情绪为核心，场景仅作为背景衬托，勿让人物被场景抢夺主体'
        ]
          .filter(Boolean)
          .join('；')
      );
    }
    if (seed.role === 'scene') {
      if (seed.scope === 'base') {
        return `${stylePrefix}${seed.prompt}；场景主资产设定图，环境结构稳定，空间关系清晰，强调材质与固定机位参考。`;
      }
      return collapseWhitespace(
        [
          stylePrefix + (seed.statePrompt ?? seed.prompt),
          baseReference,
          '镜头级场景状态图，沿用场景主资产的空间结构，在当前时间、天气、光照和机位下表现局部变化，务必保持无人画面，不要出现任何人物'
        ]
          .filter(Boolean)
          .join('；')
      );
    }
    return collapseWhitespace(
      [
        stylePrefix + seed.prompt,
        baseReference,
        seed.scope === 'base' ? '道具主资产设定图，单体展示，材质清楚，轮廓明确。' : '镜头级道具状态图，沿用主资产外观并表现当前镜头下的使用状态。'
      ]
        .filter(Boolean)
        .join('；')
    );
  }

  private assetSeedKey(input: { role: 'character' | 'scene' | 'prop'; scope: 'base' | 'shot'; name: string }): string {
    return `${input.scope}:${input.role}:${input.name.trim().toLowerCase()}`;
  }

  private resolveMissingStoryboardAssetSeeds(projectId: string, storyboard: Storyboard, assets: Asset[]): StoryboardAssetSeed[] {
    const storyboardAssets = assets.filter((item) => item.storyboardId === storyboard.id);
    return this.buildStoryboardAssetSeeds(projectId, storyboard).filter((seed) => {
      const pool = seed.reuseAcrossProject ? assets : storyboardAssets;
      return !pool.some(
        (item) =>
          item.type === seed.role &&
          item.scope === seed.scope &&
          item.name.trim().toLowerCase() === seed.name.trim().toLowerCase()
      );
    });
  }

  private hasCompleteStoryboardAssets(projectId: string, storyboard: Storyboard, assets: Asset[]): boolean {
    return this.resolveMissingStoryboardAssetSeeds(projectId, storyboard, assets).length === 0;
  }

  private hasCompleteBaseAssets(projectId: string, storyboard: Storyboard, assets: Asset[]): boolean {
    const seeds = this.buildStoryboardAssetSeeds(projectId, storyboard);
    const baseSeeds = seeds.filter((s) => s.scope === 'base');
    if (baseSeeds.length === 0) return true;
    for (const seed of baseSeeds) {
      const exists = assets.some(
        (a) =>
          a.scope === 'base' &&
          a.type === seed.role &&
          a.name.trim().toLowerCase() === seed.name.trim().toLowerCase()
      );
      if (!exists) return false;
    }
    return true;
  }

  private hasCompleteShotAssets(projectId: string, storyboard: Storyboard, assets: Asset[]): boolean {
    const seeds = this.buildStoryboardAssetSeeds(projectId, storyboard);
    const shotSeeds = seeds.filter((s) => s.scope === 'shot');
    if (shotSeeds.length === 0) return true;
    const existingShotAssets = assets.filter((a) => a.storyboardId === storyboard.id && a.scope === 'shot');
    return existingShotAssets.length >= shotSeeds.length;
  }

  private syncStoryboardAssetBindings(projectId: string, storyboardId: string, assets: Asset[]): void {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return;
    }
    const compiled = this.compileStoryboardPromptByStoryboard(projectId, storyboard);
    const scopedAssets = assets.filter((item) => item.scope === 'shot');
    const sceneShotAsset = scopedAssets.find((item) => item.type === 'scene') ?? null;
    const characterShotAssets = scopedAssets.filter((item) => item.type === 'character');
    const sceneAssetId = sceneShotAsset?.id ?? compiled.plan.sceneAssetId ?? null;
    const characterAssetIds = uniqueIds([
      ...compiled.plan.characterAssetIds,
      ...characterShotAssets.map((item) => item.id)
    ]);
    const propAssetIds = uniqueIds([
      ...compiled.plan.propAssetIds,
      ...scopedAssets.filter((item) => item.type === 'prop').map((item) => item.id)
    ]);
    this.store.replaceStoryboardAssetRelations(projectId, storyboardId, {
      sceneAssetId,
      characterAssetIds,
      propAssetIds
    });
    const nextPlan: StoryboardPlan = {
      ...compiled.plan,
      baseSceneAssetId:
        compiled.plan.baseSceneAssetId ??
        (sceneShotAsset?.baseAssetId ? this.store.getAsset(projectId, sceneShotAsset.baseAssetId)?.id ?? null : null),
      baseCharacterAssetIds: uniqueIds([
        ...compiled.plan.baseCharacterAssetIds,
        ...characterShotAssets
          .map((item) => (item.baseAssetId ? this.store.getAsset(projectId, item.baseAssetId)?.id ?? null : null))
          .filter((item): item is string => Boolean(item)),
      ]),
      shotSceneStateId: sceneShotAsset?.id ?? compiled.plan.shotSceneStateId ?? null,
      shotCharacterStateIds: uniqueIds([
        ...compiled.plan.shotCharacterStateIds,
        ...characterShotAssets.map((item) => item.id),
      ]),
      sceneAssetId,
      characterAssetIds,
      propAssetIds
    };
    const nextPrompt = this.compileStoryboardRenderPrompt(
      projectId,
      nextPlan,
      this.resolveStoryboardEntityContext(projectId, {
        episodeId: storyboard.episodeId ?? undefined,
        storyboardId
      })
    );
    this.store.updateStoryboard(projectId, storyboardId, {
      title: nextPlan.shotTitle,
      prompt: nextPrompt,
      plan: {
        ...nextPlan,
        finalImagePrompt: nextPrompt
      }
    });
  }

  private buildTextRequest(
    modelId?: string,
    customModel?: string
  ): {
    model?: string;
    modelConfig?: ProviderModelConfig;
  } {
    const resolvedModelName = this.deps.resolveModelName('text', modelId, customModel);
    const pickedModelConfig = this.deps.pickModelConfig('text', customModel?.trim() || resolvedModelName);
    return {
      model: this.resolveRequestedModel(pickedModelConfig, resolvedModelName, customModel),
      modelConfig: pickedModelConfig ? this.deps.toProviderModelConfig(pickedModelConfig) : undefined
    };
  }

  private resolveRequestedModel(modelConfig: ModelConfig | null, resolvedModelName?: string, customModel?: string): string | undefined {
    const custom = customModel?.trim();
    if (custom) {
      const matchedExact = modelConfig && (modelConfig.name === custom || modelConfig.model === custom);
      return matchedExact ? modelConfig.model : custom;
    }
    return modelConfig?.model ?? resolvedModelName;
  }

  private async planStoryboardShots(
    projectId: string,
    script: Script,
    context: StoryboardEntityContext,
    maxCount = MAX_STORYBOARD_PLAN_COUNT
  ): Promise<StoryboardPlan[]> {
    try {
      const viaModel = await this.planStoryboardShotsWithModel(projectId, script, context, maxCount);
      if (viaModel.length > 0) {
        return viaModel;
      }
    } catch {
      // Fall back to deterministic parsing when the planner response is malformed or temporarily unavailable.
    }
    const fallback = buildFallbackStoryboardPlans(script, maxCount).map((item) => this.hydrateStoryboardPlanWithContext(item, context));
    if (fallback.length > 0) {
      return fallback;
    }
    throw new Error('Storyboard planning did not produce valid structured shots');
  }

  private async planStoryboardShotsWithModel(
    projectId: string,
    script: Script,
    context: StoryboardEntityContext,
    maxCount: number
  ): Promise<StoryboardPlan[]> {
    const { model, modelConfig } = this.buildTextRequest();
    const entityCatalog = this.buildPlannerEntityCatalog(context);
    const prompt = [
      `你是资深分镜导演。请把下面的中文分场脚本拆成 ${Math.max(1, maxCount)} 条可直接出图的结构化分镜。`,
      '要求：',
      '1. 只输出严格 JSON，不要解释，不要 Markdown 代码块。',
      '2. JSON 格式必须为：{"storyboards":[{"shotTitle":"...","scene":"...","time":"...","subject":"...","action":"...","composition":"...","lighting":"...","finalImagePrompt":"...","characterIds":["..."],"sceneEntityId":"...","propEntityIds":["..."]}]}',
      '3. shotTitle 必须是具体镜头标题，不能出现【场次标题】、【剧情概述】、【分场脚本】等脚本标签。',
      '4. scene 只写地点；time 只写时段；subject 只写画面主体；action 只写可拍摄动作；composition 只写镜头构图；lighting 只写光线氛围。',
      '5. finalImagePrompt 必须是适合中文图片模型的完整视觉提示词，要把 scene/time/subject/action/composition/lighting 整合进去，禁止直接复制脚本标签。',
      '6. characterIds / sceneEntityId / propEntityIds 只允许填写候选实体清单中的 id；没有命中则输出 [] 或 null。',
      '7. 丢弃空行、章节标题、纯字段名行，不要输出“时间：傍晚”“场景：某地”这种单独条目。',
      entityCatalog ? `候选实体清单：\n${entityCatalog}` : '当前没有可用实体候选，characterIds / sceneEntityId / propEntityIds 保持空值。',
      `脚本标题：${script.title}`,
      '脚本正文：',
      truncateForModel(script.content, MAX_STORYBOARD_SOURCE_CHARS)
    ].join('\n');
    const result = await this.provider.generateText({
      prompt,
      projectId,
      model,
      modelConfig
    });
    return this.parseStoryboardPlans(result.text, context, maxCount);
  }

  private parseStoryboardPlans(text: string, context: StoryboardEntityContext, maxCount: number): StoryboardPlan[] {
    const payload = this.parseLooseJson(text);
    const payloadRecord = asRecord(payload);
    const rawItems = Array.isArray(payload)
      ? payload
      : Array.isArray(payloadRecord?.storyboards)
        ? payloadRecord!.storyboards
        : Array.isArray(payloadRecord?.shots)
          ? payloadRecord!.shots
          : Array.isArray(payloadRecord?.items)
            ? payloadRecord!.items
            : [];
    const items = rawItems
      .map((item, index) => {
        const record = asRecord(item);
        const normalized = record ? normalizeStoryboardPlanRecord(record, index) : null;
        return normalized ? this.hydrateStoryboardPlanWithContext(normalized, context) : null;
      })
      .filter((item): item is StoryboardPlan => Boolean(item))
      .slice(0, maxCount);
    if (items.length === 0) {
      throw new Error('Storyboard planner returned invalid JSON payload');
    }
    return items;
  }

  private parseLooseJson(text: string): unknown {
    const normalized = trimModelText(text);
    const candidates = [normalized];
    const arrayStart = normalized.indexOf('[');
    const arrayEnd = normalized.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      candidates.push(normalized.slice(arrayStart, arrayEnd + 1));
    }
    const objectStart = normalized.indexOf('{');
    const objectEnd = normalized.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      candidates.push(normalized.slice(objectStart, objectEnd + 1));
    }
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // try next candidate
      }
    }
    throw new Error('Storyboard planner did not return parseable JSON');
  }
}
