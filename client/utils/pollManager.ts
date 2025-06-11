import { importApi } from '../services/api';
import { ImportTask, TaskPersistence } from './taskPersistence';

export interface PollManagerCallbacks {
    onTaskUpdate: (taskId: string, updates: Partial<ImportTask>) => void;
    onTaskComplete: (taskId: string, message: string) => void;
    onTaskFailed: (taskId: string, error: string) => void;
    showToast: (message: string) => void;
}

export class PollManager {
    private static instance: PollManager;
    private activePolls: Map<string, NodeJS.Timeout> = new Map();
    private callbacks: PollManagerCallbacks;
    private taskPersistence: TaskPersistence;
    private readonly POLL_INTERVAL = 2000; // 2 seconds
    private readonly MAX_POLL_ATTEMPTS = 300; // 10 minutes max
    private readonly STUCK_TASK_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    
    private constructor(callbacks: PollManagerCallbacks) {
        this.callbacks = callbacks;
        this.taskPersistence = TaskPersistence.getInstance();
    }
    
    static getInstance(callbacks?: PollManagerCallbacks): PollManager {
        if (!PollManager.instance && callbacks) {
            PollManager.instance = new PollManager(callbacks);
        } else if (callbacks) {
            PollManager.instance.callbacks = callbacks;
        }
        return PollManager.instance;
    }
    
    // Start polling for search task
    startSearchPolling(task: ImportTask): void {
        if (!task.searchJobId) {
            console.error('Cannot start search polling: missing searchJobId');
            return;
        }
        
        const pollKey = `search-${task.id}`;
        this.stopPolling(pollKey);
        
        let attempts = 0;
        const startTime = Date.now();
        
        const poll = async () => {
            attempts++;
            
            try {
                // Check if task is stuck
                if (Date.now() - startTime > this.STUCK_TASK_TIMEOUT) {
                    this.handleStuckTask(task.id, 'Search task timeout');
                    return;
                }
                
                const statusResponse = await importApi.getImportStatus(task.searchJobId!);
                
                if (statusResponse.success && statusResponse.data) {
                    const job = statusResponse.data;
                    
                    if (job.status === 'completed') {
                        await this.handleSearchComplete(task);
                    } else if (job.status === 'failed') {
                        this.handleTaskFailed(task.id, job.errorMessage || 'Search failed');
                    } else if (attempts < this.MAX_POLL_ATTEMPTS) {
                        // Continue polling
                        const timeoutId = setTimeout(poll, this.POLL_INTERVAL);
                        this.activePolls.set(pollKey, timeoutId);
                    } else {
                        this.handleTaskFailed(task.id, 'Search polling exceeded maximum attempts');
                    }
                } else {
                    if (attempts < this.MAX_POLL_ATTEMPTS) {
                        const timeoutId = setTimeout(poll, this.POLL_INTERVAL);
                        this.activePolls.set(pollKey, timeoutId);
                    } else {
                        this.handleTaskFailed(task.id, 'Failed to get search status');
                    }
                }
            } catch (error) {
                console.error('Search polling error:', error);
                if (attempts < this.MAX_POLL_ATTEMPTS) {
                    const timeoutId = setTimeout(poll, this.POLL_INTERVAL);
                    this.activePolls.set(pollKey, timeoutId);
                } else {
                    this.handleTaskFailed(task.id, 'Search polling failed');
                }
            }
        };
        
        // Start polling
        const timeoutId = setTimeout(poll, this.POLL_INTERVAL);
        this.activePolls.set(pollKey, timeoutId);
    }
    
    // Start polling for import task
    startImportPolling(task: ImportTask): void {
        if (!task.importJobId) {
            console.error('Cannot start import polling: missing importJobId');
            return;
        }
        
        const pollKey = `import-${task.id}`;
        this.stopPolling(pollKey);
        
        let attempts = 0;
        const startTime = Date.now();
        
        const poll = async () => {
            attempts++;
            
            try {
                // Check if task is stuck
                if (Date.now() - startTime > this.STUCK_TASK_TIMEOUT) {
                    this.handleStuckTask(task.id, 'Import task timeout');
                    return;
                }
                
                const progressResponse = await fetch(`/api/shopify/import/${task.importJobId}/progress`);
                const progressResult = await progressResponse.json();
                
                if (progressResult.success && progressResult.data) {
                    const { status, progress, success, failed, errors } = progressResult.data;
                    
                    // Update progress
                    this.callbacks.onTaskUpdate(task.id, {
                        importProgress: Math.min(progress, 95)
                    });
                    
                    if (status === 'completed') {
                        this.handleImportComplete(task.id, success, failed, errors);
                    } else if (status === 'failed') {
                        this.handleTaskFailed(task.id, progressResult.data.errorMessage || 'Import failed');
                    } else if (attempts < this.MAX_POLL_ATTEMPTS) {
                        // Continue polling
                        const timeoutId = setTimeout(poll, this.POLL_INTERVAL);
                        this.activePolls.set(pollKey, timeoutId);
                    } else {
                        this.handleTaskFailed(task.id, 'Import polling exceeded maximum attempts');
                    }
                } else {
                    if (attempts < this.MAX_POLL_ATTEMPTS) {
                        const timeoutId = setTimeout(poll, this.POLL_INTERVAL);
                        this.activePolls.set(pollKey, timeoutId);
                    } else {
                        this.handleTaskFailed(task.id, 'Failed to get import progress');
                    }
                }
            } catch (error) {
                console.error('Import polling error:', error);
                if (attempts < this.MAX_POLL_ATTEMPTS) {
                    const timeoutId = setTimeout(poll, this.POLL_INTERVAL);
                    this.activePolls.set(pollKey, timeoutId);
                } else {
                    this.handleTaskFailed(task.id, 'Import polling failed');
                }
            }
        };
        
        // Start polling
        const timeoutId = setTimeout(poll, this.POLL_INTERVAL);
        this.activePolls.set(pollKey, timeoutId);
    }
    
    // Handle search completion
    private async handleSearchComplete(task: ImportTask): Promise<void> {
        try {
            // Get products from database by brandId with the correct limit
            const productsResponse = await fetch(`/api/products?brandId=${task.brandId}&importStatus=pending&limit=${task.limit}`);
            const productsResult = await productsResponse.json();
            
            let searchResults = [];
            if (productsResult.success && productsResult.data) {
                searchResults = productsResult.data;
            } else {
                console.warn('Failed to fetch products from API:', productsResult.error);
            }
            
            const updates = {
                status: 'completed' as const,
                progress: 100,
                searchResults: searchResults
            };
            
            this.callbacks.onTaskUpdate(task.id, updates);
            this.callbacks.onTaskComplete(
                task.id,
                `${task.brandName} search completed, found ${searchResults.length} products`
            );
            
            // Save to history
            const updatedTask = this.taskPersistence.getTask(task.id);
            if (updatedTask) {
                this.taskPersistence.saveToHistory({ ...updatedTask, ...updates });
            }
        } catch (error) {
            console.error('Error handling search completion:', error);
            this.handleTaskFailed(task.id, 'Failed to fetch search results');
        }
        
        this.stopPolling(`search-${task.id}`);
    }
    
    // Handle import completion
    private handleImportComplete(taskId: string, success: number, failed: number, errors: any[]): void {
        const updates = {
            status: 'completed' as const,
            importProgress: 100
        };
        
        this.callbacks.onTaskUpdate(taskId, updates);
        
        const task = this.taskPersistence.getTask(taskId);
        if (task) {
            let message: string;
            if (failed > 0) {
                message = `${task.brandName} import completed: ${success} successful, ${failed} failed`;
                console.error('Import errors:', errors);
            } else {
                message = `${task.brandName} successfully imported ${success} products to Shopify`;
            }
            
            this.callbacks.onTaskComplete(taskId, message);
            
            // Save to history
            this.taskPersistence.saveToHistory({ ...task, ...updates });
        }
        
        this.stopPolling(`import-${taskId}`);
    }
    
    // Handle task failure
    private handleTaskFailed(taskId: string, errorMessage: string): void {
        const updates = {
            status: 'failed' as const,
            errorMessage
        };
        
        this.callbacks.onTaskUpdate(taskId, updates);
        this.callbacks.onTaskFailed(taskId, errorMessage);
        
        // Save to history
        const task = this.taskPersistence.getTask(taskId);
        if (task) {
            this.taskPersistence.saveToHistory({ ...task, ...updates });
        }
        
        this.stopPolling(`search-${taskId}`);
        this.stopPolling(`import-${taskId}`);
    }
    
    // Handle stuck task
    private handleStuckTask(taskId: string, reason: string): void {
        console.warn(`Task ${taskId} appears to be stuck: ${reason}`);
        this.handleTaskFailed(taskId, `Task timeout: ${reason}`);
    }
    
    // Stop specific polling
    stopPolling(pollKey: string): void {
        const timeoutId = this.activePolls.get(pollKey);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.activePolls.delete(pollKey);
        }
    }
    
    // Stop all polling for a task
    stopTaskPolling(taskId: string): void {
        this.stopPolling(`search-${taskId}`);
        this.stopPolling(`import-${taskId}`);
    }
    
    // Stop all polling
    stopAllPolling(): void {
        this.activePolls.forEach((timeoutId) => {
            clearTimeout(timeoutId);
        });
        this.activePolls.clear();
    }
    
    // Resume polling for existing tasks
    resumePolling(tasks: ImportTask[]): void {
        console.log(`Resuming polling for ${tasks.length} tasks`);
        
        tasks.forEach(task => {
            const timeSinceUpdate = Date.now() - new Date(task.lastUpdated).getTime();
            const isStale = timeSinceUpdate > this.STUCK_TASK_TIMEOUT;
            
            if (isStale) {
                console.warn(`Task ${task.id} appears stale, skipping resume`);
                return;
            }
            
            if (task.status === 'searching' && task.searchJobId) {
                console.log(`Resuming search polling for task ${task.id}`);
                this.startSearchPolling(task);
            } else if (task.status === 'importing' && task.importJobId) {
                console.log(`Resuming import polling for task ${task.id}`);
                this.startImportPolling(task);
            }
        });
    }
    
    // Get active poll count
    getActivePollCount(): number {
        return this.activePolls.size;
    }
}