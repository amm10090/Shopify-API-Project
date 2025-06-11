import React, { useState, useEffect } from 'react';
import {
    Card,
    BlockStack,
    InlineStack,
    Text,
    Button,
    Badge,
    DataTable,
    Collapsible,
    EmptyState,
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronUpIcon } from '@shopify/polaris-icons';
import { TaskPersistence, ImportTask } from '../utils/taskPersistence';

interface ImportTaskHistoryProps {
    refreshTrigger?: number; // Use this to trigger refresh from parent
}

const ImportTaskHistory: React.FC<ImportTaskHistoryProps> = ({ refreshTrigger = 0 }) => {
    const [historyTasks, setHistoryTasks] = useState<ImportTask[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    const taskPersistence = TaskPersistence.getInstance();

    const loadHistory = async () => {
        setIsLoading(true);
        try {
            const history = taskPersistence.loadHistory();
            setHistoryTasks(history.tasks);
        } catch (error) {
            console.error('Failed to load task history:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadHistory();
    }, [refreshTrigger]);

    const getStatusBadge = (status: ImportTask['status']) => {
        switch (status) {
            case 'searching':
                return <Badge tone="attention">Searching</Badge>;
            case 'completed':
                return <Badge tone="success">Completed</Badge>;
            case 'failed':
                return <Badge tone="critical">Failed</Badge>;
            case 'importing':
                return <Badge tone="info">Importing</Badge>;
            default:
                return <Badge>Unknown</Badge>;
        }
    };

    const formatDate = (date: Date | string) => {
        const d = new Date(date);
        return d.toLocaleString();
    };

    const formatDuration = (createdAt: Date, lastUpdated: Date) => {
        const duration = lastUpdated.getTime() - createdAt.getTime();
        const minutes = Math.floor(duration / (1000 * 60));
        const seconds = Math.floor((duration % (1000 * 60)) / 1000);
        
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    };

    const getHistoryRows = () => {
        return historyTasks.map((task) => [
            task.brandName,
            task.keywords || 'No keywords',
            task.limit.toString(),
            getStatusBadge(task.status),
            task.searchResults.length.toString(),
            task.selectedProducts.length.toString(),
            formatDuration(task.createdAt, task.lastUpdated),
            formatDate(task.createdAt),
            task.errorMessage || '-'
        ]);
    };

    const clearHistory = () => {
        taskPersistence.clearAll();
        setHistoryTasks([]);
    };

    if (historyTasks.length === 0) {
        return null;
    }

    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                        Task History ({historyTasks.length} tasks)
                    </Text>
                    <InlineStack gap="200">
                        <Button
                            variant="plain"
                            tone="critical"
                            onClick={clearHistory}
                            size="slim"
                        >
                            Clear History
                        </Button>
                        <Button
                            variant="plain"
                            icon={showHistory ? ChevronUpIcon : ChevronDownIcon}
                            onClick={() => setShowHistory(!showHistory)}
                        >
                            {showHistory ? 'Hide' : 'Show'}
                        </Button>
                    </InlineStack>
                </InlineStack>

                <Collapsible
                    open={showHistory}
                    id="task-history"
                    transition={{duration: '500ms', timingFunction: 'ease-in-out'}}
                >
                    {historyTasks.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                            <DataTable
                                columnContentTypes={[
                                    'text', 'text', 'numeric', 'text', 
                                    'numeric', 'numeric', 'text', 'text', 'text'
                                ]}
                                headings={[
                                    'Brand', 'Keywords', 'Limit', 'Status', 
                                    'Found', 'Selected', 'Duration', 'Created', 'Error'
                                ]}
                                rows={getHistoryRows()}
                                truncate
                            />
                        </div>
                    ) : (
                        <EmptyState
                            heading="No task history"
                            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                            <p>Completed tasks will appear here.</p>
                        </EmptyState>
                    )}
                </Collapsible>
            </BlockStack>
        </Card>
    );
};

export default ImportTaskHistory;