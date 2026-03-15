import type { Storyboard, StoryboardPlan } from '../../core/types.js';
import { type SqliteStore } from '../../db/sqlite.js';

const cleanValue = (value: string | null | undefined): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[；;，,]+$/g, '')
    .trim();

const splitPromptSegments = (prompt: string): string[] =>
  prompt
    .split(/[；;\n]+/g)
    .map((item) => cleanValue(item))
    .filter(Boolean);

const clampText = (value: string, maxLength: number): string => {
  const text = cleanValue(value);
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

const stripLeadingLabel = (value: string): string =>
  cleanValue(value).replace(/^(场景|时间|主体|动作|构图|光线|镜头标题)[：:]\s*/u, '');

export class AudioPromptCompilerService {
  constructor(private readonly store: SqliteStore) {}

  compile(projectId: string, storyboardId: string): string | null {
    const storyboard = this.store.getStoryboard(projectId, storyboardId);
    if (!storyboard) {
      return null;
    }
    return this.compileStoryboard(storyboard);
  }

  compileStoryboard(storyboard: Storyboard): string {
    const plan = storyboard.plan ?? this.buildFallbackPlan(storyboard);
    const scene = cleanValue(plan.scene);
    const time = cleanValue(plan.time);
    const subject = cleanValue(plan.subject || storyboard.title);
    const action = cleanValue(plan.action || storyboard.prompt);
    const lighting = cleanValue(plan.lighting);
    const atmosphere = [time, scene].filter(Boolean).join('，');
    const actionSentence = stripLeadingLabel(action || subject || storyboard.title);
    const subjectSentence = stripLeadingLabel(subject || storyboard.title);
    const lightingSentence = stripLeadingLabel(lighting);

    const narrationParts = [
      atmosphere ? `${clampText(atmosphere, 18)}。` : '',
      subjectSentence ? `${clampText(subjectSentence, 18)}，` : '',
      actionSentence ? `${clampText(actionSentence, 46)}。` : '',
      lightingSentence ? `整体氛围${clampText(lightingSentence, 18)}。` : '',
    ]
      .filter(Boolean)
      .join('');

    return clampText(narrationParts || storyboard.title, 96);
  }

  private buildFallbackPlan(storyboard: Storyboard): StoryboardPlan {
    const segments = splitPromptSegments(storyboard.prompt);
    const primary = cleanValue(segments[0] ?? storyboard.title);
    const secondary = cleanValue(segments[1] ?? primary);
    return {
      shotTitle: cleanValue(storyboard.title || primary),
      scene: '',
      time: '',
      subject: '',
      action: primary,
      composition: secondary === primary ? '' : secondary,
      lighting: '',
      finalImagePrompt: primary,
      continuityGroupId: 'standalone',
      characterIds: [],
      sceneEntityId: null,
      propEntityIds: [],
      baseSceneAssetId: null,
      baseCharacterAssetIds: [],
      shotSceneStateId: null,
      shotCharacterStateIds: [],
      sceneAssetId: null,
      characterAssetIds: [],
      propAssetIds: [],
    };
  }
}
