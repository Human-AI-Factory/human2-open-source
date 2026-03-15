import { DEFAULT_MOCK_PROVIDER_CAPABILITIES } from './capabilities.js';
import { AiProvider, ProviderAsrInput, ProviderAudioInput, ProviderCapability, ProviderEmbeddingInput, ProviderImageInput, ProviderTextInput, ProviderVideoInput, ProviderVideoWithFramesInput, ProviderVideoWithFramesResult } from './types.js';

export class MockAiProvider implements AiProvider {
  getCapabilities(): ProviderCapability[] {
    return DEFAULT_MOCK_PROVIDER_CAPABILITIES;
  }

  async generateText(input: ProviderTextInput): Promise<{ text: string }> {
    if (input.prompt.includes('只输出严格 JSON') && input.prompt.includes('"outlines"')) {
      const countMatch = input.prompt.match(/拆解成\s+(\d+)\s+个连续的大纲章节/);
      const chapterCount = Math.max(1, Math.min(10, Number(countMatch?.[1] ?? 6)));
      const outlines = Array.from({ length: chapterCount }, (_, index) => ({
        title: `第${index + 1}章：关键转折`,
        summary: `本章围绕主角在第${index + 1}阶段的目标推进、冲突升级与情绪变化展开，为后续剧情埋下新的行动压力。`
      }));
      return {
        text: JSON.stringify({ outlines }, null, 2)
      };
    }

    if (input.prompt.includes('"storyboards"') && input.prompt.includes('"finalImagePrompt"')) {
      return {
        text: JSON.stringify(
          {
            storyboards: [
              {
                shotTitle: '雨夜楼下对峙',
                scene: '麻美公寓楼下',
                time: '傍晚雨夜',
                subject: '小圆与沙耶香',
                action: '小圆站在楼下恍惚失神，沙耶香赶来试探性劝说',
                composition: '中近景双人构图，人物一前一后形成情绪张力',
                lighting: '潮湿路面反光配合冷暖对比街灯，氛围压抑',
                finalImagePrompt:
                  '场景：麻美公寓楼下；时间：傍晚雨夜；主体：小圆与沙耶香；动作：小圆站在楼下恍惚失神，沙耶香赶来试探性劝说；构图：中近景双人构图，人物一前一后形成情绪张力；光线：潮湿路面反光配合冷暖对比街灯，氛围压抑；中文影视分镜，电影质感，高细节'
              },
              {
                shotTitle: '走向入口前的犹豫',
                scene: '公寓入口',
                time: '夜',
                subject: '小圆',
                action: '小圆看向楼道入口，迟迟没有迈步',
                composition: '近景人物构图，入口置于画面深处形成心理压迫',
                lighting: '楼道冷光与街灯暖光交错，人物面部层次清楚',
                finalImagePrompt:
                  '场景：公寓入口；时间：夜；主体：小圆；动作：小圆看向楼道入口，迟迟没有迈步；构图：近景人物构图，入口置于画面深处形成心理压迫；光线：楼道冷光与街灯暖光交错，人物面部层次清楚；中文影视分镜，电影质感，高细节'
              }
            ]
          },
          null,
          2
        )
      };
    }

    if (input.prompt.includes('"segments"') && input.prompt.includes('影视对白导演')) {
      return {
        text: JSON.stringify(
          {
            segments: [
              {
                speaker: '小圆',
                text: '我们真的还要进去吗？',
                mood: '迟疑',
                share: 1,
              },
              {
                speaker: '沙耶香',
                text: '别怕，我陪你一起。',
                mood: '坚定',
                share: 1,
              },
            ],
          },
          null,
          2
        ),
      };
    }

    if (input.prompt.includes('你是影视编剧，请把下面的大纲改写成可继续用于分镜拆解的中文分场脚本')) {
      return {
        text: [
          '【场次标题】暴雨夜的抉择',
          '【剧情概述】主角在期限逼近的高压下重新整合提案，并在关键关系冲突中明确真正的创作目标。',
          '【分场脚本】',
          '1. 场景：工作室内景 / 深夜',
          '林远独自盯着被退回的提案，反复修改镜头顺序，手机上催促消息不断跳出，他压住焦躁继续梳理主线。',
          '2. 场景：走廊外景 / 暴雨',
          '制片人打来电话要求凌晨前交最终版本，林远冒雨到走廊透气，在崩溃边缘重新确认这支短片真正要讲的告别主题。',
          '3. 场景：会议室内景 / 凌晨',
          '林远召回团队核心成员，当场讲述新的提案结构，众人从质疑转为投入，开始分头补齐场景和调度细节。',
          '4. 场景：海边外景 / 清晨',
          '主角带着最终提案站在天光初亮的海边，用画外音交代人物成长，故事在希望与代价并存的情绪中收束。'
        ].join('\n')
      };
    }

    const title = input.prompt.slice(0, 20).replace(/\s+/g, ' ').trim() || '故事草稿';
    return {
      text: `【AI小说草稿-${input.model ?? 'default'}】\n题目：${title}\n第一幕：主角登场并建立目标。\n第二幕：冲突升级，出现关键阻碍。\n第三幕：在代价中完成成长并收束主线。`
    };
  }

  async generateImage(input: ProviderImageInput): Promise<{ url: string }> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const base = input.kind === 'storyboard' ? 'storyboards' : 'assets';
    return {
      url: `/mock/${base}/${input.projectId}-${input.storyboardId ?? 'x'}-${input.model ?? 'default'}-${suffix}.png`
    };
  }

  async generateVideo(input: ProviderVideoInput): Promise<{ url: string; providerTaskId?: string }> {
    const suffix = Math.random().toString(36).slice(2, 8);
    return {
      url: `/mock/videos/${input.projectId}-${input.storyboardId}-${input.model ?? 'default'}-${suffix}.mp4`,
      providerTaskId: `mock-video-${suffix}`
    };
  }

  async generateVideoWithFrames(input: ProviderVideoWithFramesInput): Promise<ProviderVideoWithFramesResult> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const videoUrl = `/mock/videos/${input.projectId}-${input.storyboardId}-${input.model ?? 'default'}-${suffix}.mp4`;
    // For mock, return the video URL as both frames
    return {
      videoUrl,
      firstFrameUrl: videoUrl,
      lastFrameUrl: videoUrl,
      providerTaskId: `mock-video-${suffix}`
    };
  }

  async generateAudio(input: ProviderAudioInput): Promise<{ url: string }> {
    const suffix = Math.random().toString(36).slice(2, 8);
    return {
      url: `/mock/audio/${input.projectId}-${input.storyboardId}-${input.model ?? 'default'}-${suffix}.mp3`
    };
  }

  async generateEmbedding(input: ProviderEmbeddingInput): Promise<{ embedding: number[] }> {
    // Return a mock embedding vector of dimension 1024 (default for text-embedding-v4)
    const dimension = input.dimensions || 1024;
    const embedding = Array.from({ length: dimension }, () => (Math.random() - 0.5) * 2);
    return { embedding };
  }

  async generateAsr(input: ProviderAsrInput): Promise<{ text: string }> {
    const suffix = Math.random().toString(36).slice(2, 8);
    return {
      text: `[Mock ASR Result for ${input.audioUrl}]\n这是一段模拟的语音识别文本。\nMock ID: ${suffix}`
    };
  }
}
