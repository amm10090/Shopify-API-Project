import { ImportTask, TaskPersistence } from './taskPersistence';
import { PollManager } from './pollManager';

export interface ErrorRecoveryOptions {
    maxRetries?: number;
    retryDelay?: number;
    autoRecover?: boolean;
}

export class ErrorRecovery {
    private static instance: ErrorRecovery;
    private taskPersistence: TaskPersistence;
    private pollManager: PollManager | null = null;
    private retryAttempts: Map<string, number> = new Map();
    
    private constructor() {
        this.taskPersistence = TaskPersistence.getInstance();
    }
    
    static getInstance(): ErrorRecovery {
        if (!ErrorRecovery.instance) {
            ErrorRecovery.instance = new ErrorRecovery();
        }
        return ErrorRecovery.instance;
    }
    
    setPollManager(pollManager: PollManager): void {
        this.pollManager = pollManager;
    }
    
    // Recover stuck or failed tasks
    recoverStuckTasks(options: ErrorRecoveryOptions = {}): Promise<void> {
        const { maxRetries = 3, autoRecover = false } = options;
        
        return new Promise((resolve) => {
            const tasks = this.taskPersistence.loadTasks();
            const stuckTasks = this.identifyStuckTasks(tasks);
            
            if (stuckTasks.length === 0) {
                resolve();
                return;
            }
            
            console.warn(`Found ${stuckTasks.length} stuck tasks`);
            
            stuckTasks.forEach(task => {
                const attempts = this.retryAttempts.get(task.id) || 0;
                
                if (attempts >= maxRetries) {
                    // Mark as failed after max retries
                    this.markTaskAsFailed(task, 'Maximum retry attempts exceeded');
                } else if (autoRecover) {
                    // Attempt to recover
                    this.attemptTaskRecovery(task);
                    this.retryAttempts.set(task.id, attempts + 1);
                }
            });
            
            resolve();
        });
    }
    
    // Identify tasks that appear to be stuck
    private identifyStuckTasks(tasks: ImportTask[]): ImportTask[] {
        const now = new Date();
        const stuckThreshold = 15 * 60 * 1000; // 15 minutes
        
        return tasks.filter(task => {
            const timeSinceUpdate = now.getTime() - task.lastUpdated.getTime();
            const isRunning = task.status === 'searching' || task.status === 'importing';
            
            return isRunning && timeSinceUpdate > stuckThreshold;
        });
    }
    
    // Attempt to recover a stuck task
    private attemptTaskRecovery(task: ImportTask): void {
        console.log(`Attempting to recover task ${task.id} (${task.brandName})`);
        
        // Stop existing polling
        if (this.pollManager) {
            this.pollManager.stopTaskPolling(task.id);
        }
        
        // Reset task status based on current state
        if (task.status === 'searching' && task.searchJobId) {
            // Try to restart search polling
            this.taskPersistence.updateTask(task.id, {
                lastUpdated: new Date()
            });
            
            if (this.pollManager) {
                this.pollManager.startSearchPolling(task);
            }
        } else if (task.status === 'importing' && task.importJobId) {
            // Try to restart import polling
            this.taskPersistence.updateTask(task.id, {
                lastUpdated: new Date()
            });
            
            if (this.pollManager) {
                this.pollManager.startImportPolling(task);
            }
        } else {
            // Cannot recover, mark as failed
            this.markTaskAsFailed(task, 'Unable to determine recovery method');
        }
    }
    
    // Mark task as failed
    private markTaskAsFailed(task: ImportTask, reason: string): void {
        const updates = {
            status: 'failed' as const,
            errorMessage: `Recovery failed: ${reason}`,
            lastUpdated: new Date()
        };
        
        this.taskPersistence.updateTask(task.id, updates);
        this.taskPersistence.saveToHistory({ ...task, ...updates });
        
        console.error(`Marked task ${task.id} as failed: ${reason}`);
    }
    
    // Clean up orphaned data
    cleanupOrphanedData(): void {
        try {
            // Clean up retry attempts for non-existent tasks
            const tasks = this.taskPersistence.loadTasks();
            const taskIds = new Set(tasks.map(t => t.id));
            
            for (const [taskId] of this.retryAttempts) {
                if (!taskIds.has(taskId)) {
                    this.retryAttempts.delete(taskId);
                }
            }
            
            // Additional cleanup can be added here
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
    
    // Get recovery statistics
    getRecoveryStats(): {
        stuckTasks: number;
        totalRetries: number;
        activePolls: number;
    } {
        const tasks = this.taskPersistence.loadTasks();
        const stuckTasks = this.identifyStuckTasks(tasks);
        const totalRetries = Array.from(this.retryAttempts.values())
            .reduce((sum, attempts) => sum + attempts, 0);
        
        return {
            stuckTasks: stuckTasks.length,
            totalRetries,
            activePolls: this.pollManager?.getActivePollCount() || 0
        };
    }
    
    // Force reset all tasks (emergency use)
    forceResetAllTasks(): void {
        console.warn('Force resetting all tasks - this will stop all active operations');
        
        if (this.pollManager) {
            this.pollManager.stopAllPolling();
        }
        
        const tasks = this.taskPersistence.loadTasks();
        tasks.forEach(task => {
            if (task.status === 'searching' || task.status === 'importing') {
                this.markTaskAsFailed(task, 'Force reset by user');
            }
        });
        
        this.retryAttempts.clear();
    }
    
    // Check if task is recoverable
    isTaskRecoverable(task: ImportTask): boolean {
        const attempts = this.retryAttempts.get(task.id) || 0;
        const maxRetries = 3;
        
        if (attempts >= maxRetries) {
            return false;
        }
        
        // Task is recoverable if it has the necessary IDs
        if (task.status === 'searching' && task.searchJobId) {
            return true;
        }
        
        if (task.status === 'importing' && task.importJobId) {
            return true;
        }
        
        return false;
    }
    
    // Manual recovery attempt for specific task
    async manualRecovery(taskId: string): Promise<boolean> {
        const task = this.taskPersistence.getTask(taskId);
        
        if (!task || !this.isTaskRecoverable(task)) {
            return false;
        }
        
        try {
            this.attemptTaskRecovery(task);
            return true;
        } catch (error) {
            console.error(`Manual recovery failed for task ${taskId}:`, error);
            this.markTaskAsFailed(task, 'Manual recovery attempt failed');
            return false;
        }
    }
}