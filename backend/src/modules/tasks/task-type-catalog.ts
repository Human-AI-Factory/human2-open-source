export type TaskCatalogItem = {
  taskType: 'video' | 'audio' | 'video_merge';
  queueTopic: string;
  terminalStatuses: string[];
  retryableStatuses: string[];
  defaultPriority: 'low' | 'medium' | 'high';
};

export const TASK_TYPE_CATALOG: TaskCatalogItem[] = [
  {
    taskType: 'video',
    queueTopic: 'video_task',
    terminalStatuses: ['done', 'failed', 'cancelled'],
    retryableStatuses: ['failed', 'cancelled'],
    defaultPriority: 'medium'
  },
  {
    taskType: 'audio',
    queueTopic: 'audio_task',
    terminalStatuses: ['done', 'failed'],
    retryableStatuses: ['failed'],
    defaultPriority: 'medium'
  },
  {
    taskType: 'video_merge',
    queueTopic: 'video_merge',
    terminalStatuses: ['done', 'failed'],
    retryableStatuses: ['failed'],
    defaultPriority: 'medium'
  }
];

