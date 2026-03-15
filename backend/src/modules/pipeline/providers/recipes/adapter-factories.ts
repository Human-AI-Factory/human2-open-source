import { ProviderAudioInput, ProviderImageInput, ProviderModelConfig, ProviderTextInput, ProviderVideoInput } from '../types.js';
import { ProviderValidationError } from '../errors.js';
import { pollWithTimeout } from '../vendors/video/common.js';
import { HttpRequestSpec, executeHttpRequest } from './http-transport.js';
import { VendorTextAdapter, VendorTextGenerateInput } from '../vendors/text/types.js';
import { VendorImageAdapter, VendorImageGenerateInput } from '../vendors/image/types.js';
import { VendorVideoAdapter, VendorVideoGenerateInput } from '../vendors/video/types.js';
import { VendorAudioAdapter, VendorAudioGenerateInput } from '../vendors/audio/types.js';

type RecipeContext<TInput> = {
  input: TInput;
  config: ProviderModelConfig;
  timeoutMs: number;
  defaultEndpoint: string;
  defaultAuthHeader: string;
};

type PollStep<TResult> =
  | { done: false; error?: string }
  | { done: true; value: TResult };

type PollingState<TSubmit> = {
  taskId: string;
  submitResponse: TSubmit | null;
  resumed: boolean;
};

type DirectRecipe<TInput, TResult> = {
  manufacturer: string;
  buildRequest: (ctx: RecipeContext<TInput>) => HttpRequestSpec;
  extract: (ctx: RecipeContext<TInput>, response: unknown) => TResult;
};

type PollingRecipe<TInput, TResult, TSubmit = unknown> = {
  manufacturer: string;
  buildSubmitRequest: (ctx: RecipeContext<TInput>) => HttpRequestSpec;
  onSubmit: (ctx: RecipeContext<TInput>, response: TSubmit) => { directResult?: TResult; taskId?: string };
  buildPollRequest: (ctx: RecipeContext<TInput>, state: PollingState<TSubmit>) => HttpRequestSpec;
  onPoll: (ctx: RecipeContext<TInput>, response: unknown, state: PollingState<TSubmit>) => PollStep<TResult>;
  resumeTaskId?: (ctx: RecipeContext<TInput>) => string | undefined;
  onTaskAccepted?: (ctx: RecipeContext<TInput>, state: PollingState<TSubmit>) => void | Promise<void>;
  intervalMs?: number;
  initialIntervalMs?: number;
  maxIntervalMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: (ctx: RecipeContext<TInput>, state: PollingState<TSubmit>) => number;
  fallbackError?: (ctx: RecipeContext<TInput>, state: PollingState<TSubmit>) => string;
};

const requireConfig = (config: ProviderModelConfig | undefined, label: string): ProviderModelConfig => {
  if (!config) {
    throw new ProviderValidationError(`Missing model config for ${label}`);
  }
  return config;
};

const createContext = <TInput>(
  args: { input: TInput; timeoutMs: number; defaultEndpoint: string; defaultAuthHeader: string },
  label: string,
  config: ProviderModelConfig | undefined
): RecipeContext<TInput> => ({
  input: args.input,
  config: requireConfig(config, label),
  timeoutMs: args.timeoutMs,
  defaultEndpoint: args.defaultEndpoint,
  defaultAuthHeader: args.defaultAuthHeader
});

const runDirectRecipe = async <TInput, TResult>(ctx: RecipeContext<TInput>, recipe: DirectRecipe<TInput, TResult>): Promise<TResult> => {
  const response = await executeHttpRequest(recipe.buildRequest(ctx));
  return recipe.extract(ctx, response);
};

const runPollingRecipe = async <TInput, TResult, TSubmit>(
  ctx: RecipeContext<TInput>,
  recipe: PollingRecipe<TInput, TResult, TSubmit>
): Promise<TResult> => {
  const resumedTaskId = recipe.resumeTaskId?.(ctx)?.trim();
  let state: PollingState<TSubmit>;
  if (resumedTaskId) {
    state = {
      taskId: resumedTaskId,
      submitResponse: null,
      resumed: true
    };
  } else {
    const submitResponse = (await executeHttpRequest(recipe.buildSubmitRequest(ctx))) as TSubmit;
    const submitState = recipe.onSubmit(ctx, submitResponse);
    if (submitState.directResult !== undefined) {
      return submitState.directResult;
    }
    if (!submitState.taskId) {
      throw new ProviderValidationError(`${recipe.manufacturer} recipe did not return a task id`);
    }
    state = {
      taskId: submitState.taskId,
      submitResponse,
      resumed: false
    };
    await recipe.onTaskAccepted?.(ctx, state);
  }

  return pollWithTimeout(
    async () => recipe.onPoll(ctx, await executeHttpRequest(recipe.buildPollRequest(ctx, state)), state),
    {
      timeoutMs: recipe.timeoutMs?.(ctx, state) ?? ctx.timeoutMs,
      intervalMs: recipe.intervalMs,
      initialIntervalMs: recipe.initialIntervalMs,
      maxIntervalMs: recipe.maxIntervalMs,
      backoffMultiplier: recipe.backoffMultiplier,
      fallbackError: recipe.fallbackError?.(ctx, state) ?? `${recipe.manufacturer} polling timed out`
    }
  );
};

export const createTextDirectRecipeAdapter = (recipe: DirectRecipe<ProviderTextInput, { text: string }>): VendorTextAdapter => ({
  manufacturer: recipe.manufacturer,
  async generate(args: VendorTextGenerateInput): Promise<{ text: string }> {
    return runDirectRecipe(createContext(args, `${recipe.manufacturer} text`, args.input.modelConfig), recipe);
  }
});

export const createImageDirectRecipeAdapter = (recipe: DirectRecipe<ProviderImageInput, { url: string }>): VendorImageAdapter => ({
  manufacturer: recipe.manufacturer,
  async generate(args: VendorImageGenerateInput): Promise<{ url: string }> {
    return runDirectRecipe(createContext(args, `${recipe.manufacturer} image`, args.input.modelConfig), recipe);
  }
});

export const createImagePollingRecipeAdapter = <TSubmit = unknown>(
  recipe: PollingRecipe<ProviderImageInput, { url: string }, TSubmit>
): VendorImageAdapter => ({
  manufacturer: recipe.manufacturer,
  async generate(args: VendorImageGenerateInput): Promise<{ url: string }> {
    return runPollingRecipe(createContext(args, `${recipe.manufacturer} image`, args.input.modelConfig), recipe);
  }
});

export const createVideoDirectRecipeAdapter = (
  recipe: DirectRecipe<ProviderVideoInput, { url: string; providerTaskId?: string }>
): VendorVideoAdapter => ({
  manufacturer: recipe.manufacturer,
  async generate(args: VendorVideoGenerateInput): Promise<{ url: string; providerTaskId?: string }> {
    return runDirectRecipe(createContext(args, `${recipe.manufacturer} video`, args.input.modelConfig), recipe);
  }
});

export const createVideoPollingRecipeAdapter = <TSubmit = unknown>(
  recipe: PollingRecipe<ProviderVideoInput, { url: string; providerTaskId?: string }, TSubmit>
): VendorVideoAdapter => ({
  manufacturer: recipe.manufacturer,
  async generate(args: VendorVideoGenerateInput): Promise<{ url: string; providerTaskId?: string }> {
    return runPollingRecipe(createContext(args, `${recipe.manufacturer} video`, args.input.modelConfig), recipe);
  }
});

export const createAudioDirectRecipeAdapter = (recipe: DirectRecipe<ProviderAudioInput, { url: string }>): VendorAudioAdapter => ({
  manufacturer: recipe.manufacturer,
  async generate(args: VendorAudioGenerateInput): Promise<{ url: string }> {
    return runDirectRecipe(createContext(args, `${recipe.manufacturer} audio`, args.input.modelConfig), recipe);
  }
});

export const createAudioPollingRecipeAdapter = <TSubmit = unknown>(
  recipe: PollingRecipe<ProviderAudioInput, { url: string }, TSubmit>
): VendorAudioAdapter => ({
  manufacturer: recipe.manufacturer,
  async generate(args: VendorAudioGenerateInput): Promise<{ url: string }> {
    return runPollingRecipe(createContext(args, `${recipe.manufacturer} audio`, args.input.modelConfig), recipe);
  }
});
