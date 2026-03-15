export type VendorRegistryContext = {
  manufacturer?: string;
  endpoint?: string;
};

type NormalizedVendorRegistryContext = {
  manufacturer: string;
  endpoint: string;
};

export type VendorRegistryEntry<T extends { manufacturer: string }> = {
  adapter: T;
  aliases?: string[];
  match?: (context: NormalizedVendorRegistryContext) => boolean;
};

const normalizeValue = (value?: string): string => value?.trim().toLowerCase() ?? '';

export const createVendorRegistry = <T extends { manufacturer: string }>(
  entries: VendorRegistryEntry<T>[]
): ((manufacturer?: string, endpoint?: string) => T | null) => {
  const directMap = new Map<string, T>();

  for (const entry of entries) {
    const keys = [entry.adapter.manufacturer, ...(entry.aliases ?? [])]
      .map((value) => normalizeValue(value))
      .filter(Boolean);

    for (const key of keys) {
      if (!directMap.has(key)) {
        directMap.set(key, entry.adapter);
      }
    }
  }

  return (manufacturer?: string, endpoint?: string): T | null => {
    const context: NormalizedVendorRegistryContext = {
      manufacturer: normalizeValue(manufacturer),
      endpoint: normalizeValue(endpoint),
    };

    if (!context.manufacturer && !context.endpoint) {
      return null;
    }

    for (const entry of entries) {
      if (entry.match?.(context)) {
        return entry.adapter;
      }
    }

    if (!context.manufacturer) {
      return null;
    }

    return directMap.get(context.manufacturer) ?? null;
  };
};
