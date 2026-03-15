import {
  AiProvider,
  ProviderAsrInput,
  ProviderAudioInput,
  ProviderCapability,
  ProviderEmbeddingInput,
  ProviderImageInput,
  ProviderTextInput,
  ProviderVideoInput,
  ProviderVideoWithFramesInput,
  ProviderVideoWithFramesResult
} from './types.js';

export class ModelConfigAwareAiProvider implements AiProvider {
  constructor(
    private readonly configuredProvider: AiProvider,
    private readonly fallbackProvider: AiProvider
  ) {}

  getCapabilities(): ProviderCapability[] {
    return [...this.configuredProvider.getCapabilities(), ...this.fallbackProvider.getCapabilities()];
  }

  async generateText(input: ProviderTextInput): Promise<{ text: string }> {
    return this.pickProvider(input).generateText(input);
  }

  async generateImage(input: ProviderImageInput): Promise<{ url: string }> {
    return this.pickProvider(input).generateImage(input);
  }

  async generateVideo(input: ProviderVideoInput): Promise<{ url: string; providerTaskId?: string }> {
    return this.pickProvider(input).generateVideo(input);
  }

  async generateVideoWithFrames(input: ProviderVideoWithFramesInput): Promise<ProviderVideoWithFramesResult> {
    return this.pickProvider(input).generateVideoWithFrames(input);
  }

  async generateAudio(input: ProviderAudioInput): Promise<{ url: string }> {
    return this.pickProvider(input).generateAudio(input);
  }

  async generateEmbedding(input: ProviderEmbeddingInput): Promise<{ embedding: number[] }> {
    return this.pickProvider(input).generateEmbedding(input);
  }

  async generateAsr(input: ProviderAsrInput): Promise<{ text: string }> {
    return this.pickProvider(input).generateAsr(input);
  }

  private pickProvider(
    input: { modelConfig?: ProviderTextInput['modelConfig'] }
  ): AiProvider {
    return input.modelConfig ? this.configuredProvider : this.fallbackProvider;
  }
}
