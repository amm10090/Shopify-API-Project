// Simplified types for import functionality
export interface TaskStatus {
    id: string;
    status: 'searching' | 'completed' | 'failed' | 'importing';
    progress: number;
    lastUpdated: Date;
}

export interface ImportStats {
    totalTasks: number;
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
}

export interface RecoveryAction {
    type: 'retry' | 'reset' | 'cleanup';
    taskId?: string;
    timestamp: Date;
}

// Export commonly used status types
export type TaskStatusType = 'searching' | 'completed' | 'failed' | 'importing';

// Utility functions
export const isActiveStatus = (status: TaskStatusType): boolean => {
    return status === 'searching' || status === 'importing';
};

export const isCompleteStatus = (status: TaskStatusType): boolean => {
    return status === 'completed' || status === 'failed';
};

export const getStatusColor = (status: TaskStatusType): string => {
    switch (status) {
        case 'searching': return '#ffa500';
        case 'completed': return '#00c851';
        case 'failed': return '#ff4444';
        case 'importing': return '#007bff';
        default: return '#6c757d';
    }
};

export const getStatusText = (status: TaskStatusType): string => {
    switch (status) {
        case 'searching': return 'Searching';
        case 'completed': return 'Completed';
        case 'failed': return 'Failed';
        case 'importing': return 'Importing';
        default: return 'Unknown';
    }
};