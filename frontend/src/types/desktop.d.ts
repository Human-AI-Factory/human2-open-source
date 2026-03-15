export {};

declare global {
  interface Window {
    human2Desktop?: {
      getRuntime: () => Promise<{
        isDesktop: boolean;
        platform: string;
        appVersion: string;
        localResourceDir: string;
        defaultResourceDir: string;
        queueSummary?: {
          total: number;
          paused?: boolean;
          recoveredTaskCount?: number;
          queued: number;
          running: number;
          done: number;
          failed: number;
          cancelled: number;
        };
        queuePaused?: boolean;
      }>;
      getLocalQueue: () => Promise<{
        tasks: Array<{
          id: string;
          type: string;
          source: string;
          payload: Record<string, unknown>;
          status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
          createdAt: string;
          updatedAt: string;
          startedAt: string | null;
          finishedAt: string | null;
          error: string | null;
          result: Record<string, unknown> | null;
        }>;
        summary: {
          total: number;
          paused?: boolean;
          recoveredTaskCount?: number;
          queued: number;
          running: number;
          done: number;
          failed: number;
          cancelled: number;
        };
        logs?: Array<{
          time: string;
          level: 'info' | 'warn' | 'error';
          message: string;
          meta?: Record<string, unknown>;
        }>;
        updatedAt: string;
      }>;
      enqueueLocalTask: (input: {
        type: string;
        payload?: Record<string, unknown>;
        source?: string;
      }) => Promise<{ id: string }>;
      cancelLocalTask: (input: { taskId: string }) => Promise<boolean>;
      clearLocalQueue: () => Promise<boolean>;
      setQueuePaused: (input: { paused: boolean }) => Promise<{
        total: number;
        paused?: boolean;
        recoveredTaskCount?: number;
        queued: number;
        running: number;
        done: number;
        failed: number;
        cancelled: number;
      }>;
      processLocalQueueNow: () => Promise<{
        total: number;
        paused?: boolean;
        recoveredTaskCount?: number;
        queued: number;
        running: number;
        done: number;
        failed: number;
        cancelled: number;
      }>;
      exportDiagnostics: () => Promise<{ filePath: string } | null>;
      pickResourceDirectory: () => Promise<string | null>;
      indexResourceDirectory: (input: {
        dir: string;
        maxItems?: number;
      }) => Promise<{
        dir: string;
        files: Array<{
          path: string;
          relativePath: string;
          size: number;
          updatedAt: string;
          ext: string;
        }>;
      }>;
      pickLocalMediaFiles: () => Promise<string[]>;
      revealPath: (targetPath: string) => Promise<boolean>;
      readWorkspaceFile: (input: { filePath: string }) => Promise<
        | {
            filePath: string;
            raw: string;
            parsed: unknown;
          }
        | {
            filePath: string;
            error: string;
          }
        | null
      >;
      onLocalQueueUpdated: (
        listener: (payload: {
          tasks: Array<{
            id: string;
            type: string;
            source: string;
            payload: Record<string, unknown>;
            status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
            createdAt: string;
            updatedAt: string;
            startedAt: string | null;
            finishedAt: string | null;
            error: string | null;
            result: Record<string, unknown> | null;
          }>;
          summary: {
            total: number;
            paused?: boolean;
            recoveredTaskCount?: number;
            queued: number;
            running: number;
            done: number;
            failed: number;
            cancelled: number;
          };
          logs?: Array<{
            time: string;
            level: 'info' | 'warn' | 'error';
            message: string;
            meta?: Record<string, unknown>;
          }>;
          updatedAt: string;
        }) => void
      ) => () => void;
      onResourceIndexUpdated: (
        listener: (payload: {
          dir: string;
          files: Array<{
            path: string;
            relativePath: string;
            size: number;
            updatedAt: string;
            ext: string;
          }>;
          count: number;
          updatedAt: string;
        }) => void
      ) => () => void;
      onMenuCommand: (
        listener: (payload: {
          command?: 'focus-command' | 'save-timeline' | 'merge-timeline' | 'toggle-playback' | string;
        }) => void
      ) => () => void;
      onWorkspaceFileOpened: (
        listener: (payload: {
          filePath: string;
          openedAt: string;
        }) => void
      ) => () => void;
    };
  }
}
