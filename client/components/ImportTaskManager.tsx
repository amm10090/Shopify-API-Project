import React from 'react';
import {
    Card,
    BlockStack,
    InlineStack,
    Text,
    Button,
    Badge,
    ProgressBar,
    Banner,
    Collapsible,
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronUpIcon, ImportIcon } from '@shopify/polaris-icons';
import { ImportTask } from '../utils/taskPersistence';

interface ImportTaskManagerProps {
    tasks: ImportTask[];
    activeTaskId: string | null;
    showTaskManager: boolean;
    onToggleTaskManager: () => void;
    onViewTask: (taskId: string) => void;
    onRemoveTask: (taskId: string) => void;
    onSelectAll: (taskId: string, selected: boolean) => void;
    onImportTask: (taskId: string) => void;
}

const ImportTaskManager: React.FC<ImportTaskManagerProps> = ({
    tasks,
    activeTaskId,
    showTaskManager,
    onToggleTaskManager,
    onViewTask,
    onRemoveTask,
    onSelectAll,
    onImportTask,
}) => {
    const getTaskStatusBadge = (status: ImportTask['status']) => {
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
        const now = new Date();
        const diffInHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));

        if (diffInHours < 1) {
            return 'Just now';
        } else if (diffInHours < 24) {
            return `${diffInHours} hours ago`;
        } else {
            const diffInDays = Math.floor(diffInHours / 24);
            return `${diffInDays} days ago`;
        }
    };

    if (tasks.length === 0) {
        return null;
    }

    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                        Task Manager ({tasks.length} tasks)
                    </Text>
                    <Button
                        variant="plain"
                        icon={showTaskManager ? ChevronUpIcon : ChevronDownIcon}
                        onClick={onToggleTaskManager}
                    >
                        {showTaskManager ? 'Collapse' : 'Expand'}
                    </Button>
                </InlineStack>

                <Collapsible
                    open={showTaskManager}
                    id="task-manager"
                    transition={{duration: '500ms', timingFunction: 'ease-in-out'}}
                >
                    <BlockStack gap="300">
                        {tasks.map((task) => (
                            <Card key={task.id}>
                                <BlockStack gap="300">
                                    <InlineStack align="space-between">
                                        <InlineStack gap="300" align="center">
                                            <Text as="h3" variant="headingSm">
                                                {task.brandName}
                                            </Text>
                                            {getTaskStatusBadge(task.status)}
                                            {task.keywords && (
                                                <Badge>{`Keywords: ${task.keywords}`}</Badge>
                                            )}
                                        </InlineStack>
                                        <InlineStack gap="200">
                                            {task.status === 'completed' && task.searchResults.length > 0 && (
                                                <Text as="p" variant="bodySm">
                                                    已成功抓取 {task.searchResults.length} 个产品，已选择 {task.selectedProducts.length} 个进行导入
                                                </Text>
                                            )}
                                            <Button
                                                size="slim"
                                                variant={activeTaskId === task.id ? "primary" : "plain"}
                                                onClick={() => onViewTask(task.id)}
                                            >
                                                {activeTaskId === task.id ? 'Currently Viewing' : 'View Details'}
                                            </Button>
                                            <Button
                                                size="slim"
                                                variant="plain"
                                                tone="critical"
                                                onClick={() => onRemoveTask(task.id)}
                                            >
                                                Remove
                                            </Button>
                                        </InlineStack>
                                    </InlineStack>

                                    {/* Search progress */}
                                    {task.status === 'searching' && (
                                        <InlineStack gap="200" align="center">
                                            <div style={{ animation: 'spin 2s linear infinite' }}>⟳</div>
                                            <Text as="p" variant="bodySm">Searching for products...</Text>
                                        </InlineStack>
                                    )}

                                    {/* Import progress */}
                                    {task.status === 'importing' && (
                                        <BlockStack gap="200">
                                            <Text as="p" variant="bodySm">
                                                Import progress: {task.importProgress}%
                                            </Text>
                                            <ProgressBar progress={task.importProgress} />
                                        </BlockStack>
                                    )}

                                    {/* Error message */}
                                    {task.status === 'failed' && task.errorMessage && (
                                        <Banner tone="critical">
                                            <p>{task.errorMessage}</p>
                                        </Banner>
                                    )}

                                    {/* Task action buttons */}
                                    {task.status === 'completed' && task.searchResults.length > 0 && (
                                        <InlineStack gap="200">
                                            <Button
                                                size="slim"
                                                onClick={() => onSelectAll(task.id, task.selectedProducts.length !== task.searchResults.length)}
                                            >
                                                {task.selectedProducts.length === task.searchResults.length ? 'Deselect All' : 'Select All'}
                                            </Button>
                                            <Button
                                                variant="primary"
                                                size="slim"
                                                icon={ImportIcon}
                                                onClick={() => onImportTask(task.id)}
                                                disabled={task.selectedProducts.length === 0}
                                            >
                                                Import Selected Products ({task.selectedProducts.length.toString()})
                                            </Button>
                                        </InlineStack>
                                    )}

                                    <Text as="p" variant="bodySm" tone="subdued">
                                        Created: {formatDate(task.createdAt)}
                                    </Text>
                                </BlockStack>
                            </Card>
                        ))}
                    </BlockStack>
                </Collapsible>
            </BlockStack>
        </Card>
    );
};

export default ImportTaskManager;