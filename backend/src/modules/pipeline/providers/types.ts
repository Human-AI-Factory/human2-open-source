export type ProviderTaskType = 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'asr';
export type ProviderVideoMode = 'text' | 'singleImage' | 'startEnd' | 'multiImage' | 'reference';
export type ProviderImageKind = 'storyboard' | 'asset';
export type ProviderVideoImageRole = 'first_frame' | 'last_frame' | 'reference';
export type ProviderVideoImageWithRole = {
  url: string;
  role: ProviderVideoImageRole;
};

export type ProviderTextInput = {
  prompt: string;
  projectId: string;
  model?: string;
  modelConfig?: ProviderModelConfig;
  providerOptions?: Record<string, unknown>;
};

export type ProviderImageInput = {
  prompt: string;
  kind: ProviderImageKind;
  projectId: string;
  storyboardId?: string;
  model?: string;
  modelConfig?: ProviderModelConfig;
  resolution?: string;
  aspectRatio?: string;
  providerOptions?: Record<string, unknown>;
  /** Reference image URLs for image-to-image generation */
  imageInputs?: string[];
};

export type ProviderVideoInput = {
  prompt: string;
  projectId: string;
  storyboardId: string;
  idempotencyKey?: string;
  providerTaskId?: string;
  model?: string;
  modelConfig?: ProviderModelConfig;
  mode?: ProviderVideoMode;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  audio?: boolean;
  imageInputs?: string[];
  imageWithRoles?: ProviderVideoImageWithRole[];
  endFrame?: string;
  providerOptions?: Record<string, unknown>;
  onProviderTaskAccepted?: (taskId: string) => void | Promise<void>;
};

/**
 * Result from I2V (image-to-video) generation with frame extraction
 * Used for generating shot-level assets and storyboard videos
 */
export type ProviderVideoWithFramesResult = {
  /** The generated video URL */
  videoUrl: string;
  /** First frame extracted from the video - used for storyboard generation */
  firstFrameUrl: string;
  /** Last frame from the video - used for video continuity to next segment */
  lastFrameUrl: string;
  /** Provider's task ID for polling (if async) */
  providerTaskId?: string;
};

/**
 * Input for I2V video generation with frame extraction
 * Used to generate video and automatically extract first/last frames
 */
export type ProviderVideoWithFramesInput = {
  prompt?: string;
  projectId: string;
  storyboardId: string;
  idempotencyKey?: string;
  providerTaskId?: string;
  model?: string;
  modelConfig?: ProviderModelConfig;
  /** Mode: imageToVideo or startEnd (for continuity) */
  mode: 'imageToVideo' | 'startEnd';
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  /** Input images for image-to-video */
  imageInputs?: string[];
  imageWithRoles?: ProviderVideoImageWithRole[];
  /** End frame for startEnd mode (continuity) */
  endFrame?: string;
  providerOptions?: Record<string, unknown>;
  onProviderTaskAccepted?: (taskId: string) => void | Promise<void>;
};

export type ProviderAudioInput = {
  prompt: string;
  projectId: string;
  storyboardId: string;
  model?: string;
  modelConfig?: ProviderModelConfig;
  voice?: string;
  speed?: number;
  emotion?: string;
  format?: string;
  providerOptions?: Record<string, unknown>;
};

export type ProviderEmbeddingInput = {
  prompt: string;
  projectId: string;
  model?: string;
  modelConfig?: ProviderModelConfig;
  dimensions?: number;
  providerOptions?: Record<string, unknown>;
};

export type ProviderAsrInput = {
  audioUrl: string;
  projectId: string;
  storyboardId?: string;
  model?: string;
  modelConfig?: ProviderModelConfig;
  language?: string;
  providerOptions?: Record<string, unknown>;
};

export type ProviderModelConfig = {
  provider: string;
  manufacturer: string;
  model: string;
  authType: 'bearer' | 'api_key' | 'none';
  endpoint: string;
  endpoints: Record<string, string>;
  apiKey: string;
  capabilities: Record<string, unknown>;
};

export interface ProviderCapability {
  provider: string;
  taskType: ProviderTaskType;
  model?: string;
  enabled: boolean;
  modes?: ProviderVideoMode[];
  durations?: number[];
  resolutions?: string[];
  aspectRatios?: string[];
  audioSupported?: boolean;
  voices?: string[];
  speeds?: number[];
  emotions?: string[];
  formats?: string[];
}

export interface AiProvider {
  getCapabilities(): ProviderCapability[];
  generateText(input: ProviderTextInput): Promise<{ text: string }>;
  generateImage(input: ProviderImageInput): Promise<{ url: string }>;
  generateVideo(input: ProviderVideoInput): Promise<{ url: string; providerTaskId?: string }>;
  /** Generate video with frame extraction - used for shot-level assets and storyboard continuity */
  generateVideoWithFrames(input: ProviderVideoWithFramesInput): Promise<ProviderVideoWithFramesResult>;
  generateAudio(input: ProviderAudioInput): Promise<{ url: string }>;
  generateEmbedding(input: ProviderEmbeddingInput): Promise<{ embedding: number[] }>;
  generateAsr(input: ProviderAsrInput): Promise<{ text: string }>;
}
