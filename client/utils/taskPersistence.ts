import { UnifiedProduct } from '@shared/types';

export interface ImportTask {
    id: string;
    brandId: string;
    brandName: string;
    keywords: string;
    limit: number;
    status: 'searching' | 'completed' | 'failed' | 'importing';
    progress: number;
    searchResults: UnifiedProduct[];
    selectedProducts: string[];
    importProgress: number;
    createdAt: Date;
    errorMessage?: string;
    searchJobId?: string;
    importJobId?: string;
    lastUpdated: Date;
}

export interface TaskHistory {
    tasks: ImportTask[];
    lastCleanup: Date;
}

const STORAGE_KEY = 'import_tasks';
const HISTORY_KEY = 'import_task_history';
const MAX_HISTORY_ITEMS = 50;
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export class TaskPersistence {
    private static instance: TaskPersistence;
    
    private constructor() {}
    
    static getInstance(): TaskPersistence {
        if (!TaskPersistence.instance) {
            TaskPersistence.instance = new TaskPersistence();
        }
        return TaskPersistence.instance;
    }
    
    // Save current active tasks
    saveTasks(tasks: ImportTask[]): void {
        try {
            const taskData = {
                tasks: tasks.map(task => ({
                    ...task,
                    createdAt: task.createdAt.toISOString(),
                    lastUpdated: new Date().toISOString()
                })),
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(taskData));
        } catch (error) {
            console.error('Failed to save tasks:', error);
        }
    }
    
    // Load active tasks
    loadTasks(): ImportTask[] {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (!data) return [];
            
            const taskData = JSON.parse(data);
            return taskData.tasks.map((task: any) => ({
                ...task,
                createdAt: new Date(task.createdAt),
                lastUpdated: new Date(task.lastUpdated)
            }));
        } catch (error) {
            console.error('Failed to load tasks:', error);
            return [];
        }
    }
    
    // Save task to history
    saveToHistory(task: ImportTask): void {
        try {
            const history = this.loadHistory();
            const updatedHistory = {
                tasks: [
                    {
                        ...task,
                        createdAt: task.createdAt.toISOString(),
                        lastUpdated: new Date().toISOString()
                    },
                    ...history.tasks.filter(t => t.id !== task.id)
                ].slice(0, MAX_HISTORY_ITEMS),
                lastCleanup: new Date().toISOString()
            };
            
            localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
        } catch (error) {
            console.error('Failed to save task to history:', error);
        }
    }
    
    // Load task history
    loadHistory(): TaskHistory {
        try {
            const data = localStorage.getItem(HISTORY_KEY);
            if (!data) {
                return {
                    tasks: [],
                    lastCleanup: new Date()
                };
            }
            
            const history = JSON.parse(data);
            return {
                tasks: history.tasks.map((task: any) => ({
                    ...task,
                    createdAt: new Date(task.createdAt),
                    lastUpdated: new Date(task.lastUpdated)
                })),
                lastCleanup: new Date(history.lastCleanup)
            };
        } catch (error) {
            console.error('Failed to load task history:', error);
            return {
                tasks: [],
                lastCleanup: new Date()
            };
        }
    }
    
    // Clean up old completed tasks
    cleanupOldTasks(): void {
        try {
            const history = this.loadHistory();
            const now = new Date();
            
            // Only cleanup if it's been more than CLEANUP_INTERVAL since last cleanup
            if (now.getTime() - history.lastCleanup.getTime() < CLEANUP_INTERVAL) {
                return;
            }
            
            const activeTasks = this.loadTasks();
            const runningTasks = activeTasks.filter(task => 
                task.status === 'searching' || task.status === 'importing'
            );
            
            // Remove running tasks older than 6 hours (likely stuck)
            const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
            const cleanedTasks = runningTasks.filter(task => 
                task.lastUpdated > sixHoursAgo
            );
            
            this.saveTasks(cleanedTasks);
            
            // Clean up history - keep only last 50 items
            const cleanedHistory = {
                tasks: history.tasks.slice(0, MAX_HISTORY_ITEMS),
                lastCleanup: now
            };
            
            localStorage.setItem(HISTORY_KEY, JSON.stringify({
                ...cleanedHistory,
                lastCleanup: cleanedHistory.lastCleanup.toISOString()
            }));
        } catch (error) {
            console.error('Failed to cleanup old tasks:', error);
        }
    }
    
    // Remove specific task
    removeTask(taskId: string): void {
        try {
            const tasks = this.loadTasks();
            const updatedTasks = tasks.filter(task => task.id !== taskId);
            this.saveTasks(updatedTasks);
        } catch (error) {
            console.error('Failed to remove task:', error);
        }
    }
    
    // Update specific task
    updateTask(taskId: string, updates: Partial<ImportTask>): void {
        try {
            const tasks = this.loadTasks();
            const updatedTasks = tasks.map(task => 
                task.id === taskId 
                    ? { ...task, ...updates, lastUpdated: new Date() }
                    : task
            );
            this.saveTasks(updatedTasks);
        } catch (error) {
            console.error('Failed to update task:', error);
        }
    }
    
    // Get task by ID
    getTask(taskId: string): ImportTask | undefined {
        try {
            const tasks = this.loadTasks();
            return tasks.find(task => task.id === taskId);
        } catch (error) {
            console.error('Failed to get task:', error);
            return undefined;
        }
    }
    
    // Clear all data (for debugging)
    clearAll(): void {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(HISTORY_KEY);
        } catch (error) {
            console.error('Failed to clear all data:', error);
        }
    }
}