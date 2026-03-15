import { computed } from 'vue';

type DesktopIndexedMedia = {
  dir: string;
  files: Array<{
    path: string;
    relativePath: string;
    size: number;
    updatedAt: string;
    ext: string;
  }>;
};

const getBridge = () => window.human2Desktop;

export const useDesktopLocalMedia = () => {
  const localMediaBridgeAvailable = computed(() => Boolean(getBridge()));

  const indexResourceDirectory = async (input: { dir: string; maxItems?: number }): Promise<DesktopIndexedMedia | null> => {
    const bridge = getBridge();
    if (!bridge || !input.dir) {
      return null;
    }
    return bridge.indexResourceDirectory(input);
  };

  const pickResourceDirectory = async (input: { maxItems?: number } = {}): Promise<DesktopIndexedMedia | null> => {
    const bridge = getBridge();
    if (!bridge) {
      return null;
    }
    const dir = await bridge.pickResourceDirectory();
    if (!dir) {
      return null;
    }
    return bridge.indexResourceDirectory({ dir, maxItems: input.maxItems ?? 1200 });
  };

  const pickLocalMediaFiles = async (): Promise<string[]> => {
    const bridge = getBridge();
    if (!bridge) {
      return [];
    }
    return bridge.pickLocalMediaFiles();
  };

  const revealLocalPath = async (targetPath: string): Promise<boolean> => {
    const bridge = getBridge();
    if (!bridge || !targetPath) {
      return false;
    }
    return bridge.revealPath(targetPath);
  };

  const enqueueLocalMediaIngest = async (
    paths: string[],
    source = 'local-media'
  ): Promise<{ id: string; count: number } | null> => {
    const bridge = getBridge();
    const normalized = paths.map((item) => item.trim()).filter(Boolean);
    if (!bridge || normalized.length === 0) {
      return null;
    }
    const queued = await bridge.enqueueLocalTask({
      type: 'ingest-local-files',
      payload: { paths: normalized },
      source
    });
    return { id: queued.id, count: normalized.length };
  };

  const pickAndEnqueueLocalMediaFiles = async (source = 'local-media'): Promise<{ id: string; count: number } | null> => {
    const files = await pickLocalMediaFiles();
    return enqueueLocalMediaIngest(files, source);
  };

  return {
    localMediaBridgeAvailable,
    indexResourceDirectory,
    pickResourceDirectory,
    pickLocalMediaFiles,
    revealLocalPath,
    enqueueLocalMediaIngest,
    pickAndEnqueueLocalMediaFiles
  };
};
