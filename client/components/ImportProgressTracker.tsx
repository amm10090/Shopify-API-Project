import React, { useState, useEffect, useCallback } from 'react';
import { Card, ProgressBar, Text, InlineStack, BlockStack, Box, Badge } from '@shopify/polaris';
import { shopifyApi } from '../services/api';

interface ImportTask {
    taskId: string;
    status: string;
    total: number;
    processed: number;
    success: number;
    failed: number;
    progress: number;
    productIds: string[];
    startTime: Date;
}

interface ImportProgressTrackerProps {
    taskIds: string[];
    onTaskComplete?: (taskId: string, success: number, failed: number) => void;
    onTaskFailed?: (taskId: string, error: string) => void;
}

export const ImportProgressTracker: React.FC<ImportProgressTrackerProps> = ({
    taskIds,
    onTaskComplete,
    onTaskFailed
}) => {
    const [tasks, setTasks] = useState<{ [taskId: string]: ImportTask }>({});

    const pollTask = useCallback(async (taskId: string) => {
        try {
            const response = await shopifyApi.getImportProgress(taskId);
            if (response.success && response.data) {
                const { status, total, processed, success, failed, progress } = response.data;
                
                setTasks(prev => ({
                    ...prev,
                    [taskId]: {
                        ...prev[taskId],
                        status,
                        total,
                        processed,
                        success,
                        failed,
                        progress
                    }
                }));

                if (status === 'completed') {
                    onTaskComplete?.(taskId, success, failed);
                    // 清理完成的任务
                    setTimeout(() => {
                        setTasks(prev => {
                            const newTasks = { ...prev };
                            delete newTasks[taskId];
                            return newTasks;
                        });
                    }, 3000);
                } else if (status === 'failed') {
                    onTaskFailed?.(taskId, response.data.errorMessage || 'Import failed');
                    // 清理失败的任务
                    setTimeout(() => {
                        setTasks(prev => {
                            const newTasks = { ...prev };
                            delete newTasks[taskId];
                            return newTasks;
                        });
                    }, 3000);
                } else {
                    // 继续轮询
                    setTimeout(() => pollTask(taskId), 2000);
                }
            }
        } catch (error) {
            console.error('Error polling task:', error);
            // 清理错误的任务
            setTasks(prev => {
                const newTasks = { ...prev };
                delete newTasks[taskId];
                return newTasks;
            });
        }
    }, [onTaskComplete, onTaskFailed]);

    // 监听新的任务ID
    useEffect(() => {
        taskIds.forEach(taskId => {
            if (!tasks[taskId]) {
                // 初始化任务状态
                setTasks(prev => ({
                    ...prev,
                    [taskId]: {
                        taskId,
                        status: 'running',
                        total: 0,
                        processed: 0,
                        success: 0,
                        failed: 0,
                        progress: 0,
                        productIds: [],
                        startTime: new Date()
                    }
                }));
                
                // 开始轮询
                setTimeout(() => pollTask(taskId), 1000);
            }
        });
    }, [taskIds, tasks, pollTask]);

    const activeTasks = Object.values(tasks);

    if (activeTasks.length === 0) {
        return null;
    }

    return (
        <Card>
            <Box padding="400">
                <BlockStack gap="400">
                    <Text as="h3" variant="headingSm" fontWeight="semibold">
                        Import Progress
                    </Text>
                    {activeTasks.map((task) => (
                        <Box key={task.taskId} padding="300" background="bg-surface-secondary" borderRadius="200">
                            <BlockStack gap="200">
                                <InlineStack align="space-between">
                                    <Text as="p" variant="bodySm">
                                        Importing {task.total} products
                                    </Text>
                                    <Badge tone={
                                        task.status === 'completed' ? 'success' :
                                        task.status === 'failed' ? 'critical' :
                                        'attention'
                                    }>
                                        {task.status === 'running' ? 'In Progress' : 
                                         task.status === 'completed' ? 'Completed' :
                                         task.status === 'failed' ? 'Failed' :
                                         task.status}
                                    </Badge>
                                </InlineStack>
                                <ProgressBar progress={task.progress} />
                                <InlineStack align="space-between">
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        {task.processed} / {task.total} processed
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        ✅ {task.success} success, ❌ {task.failed} failed
                                    </Text>
                                </InlineStack>
                            </BlockStack>
                        </Box>
                    ))}
                </BlockStack>
            </Box>
        </Card>
    );
}; 