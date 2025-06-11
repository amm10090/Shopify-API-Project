import React, { useState, useEffect } from 'react';
import {
    Card,
    BlockStack,
    InlineStack,
    Text,
    Button,
    Badge,
    Collapsible,
    Banner,
    List,
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronUpIcon, RefreshIcon, DeleteIcon } from '@shopify/polaris-icons';
import { TaskPersistence } from '../utils/taskPersistence';
import { ErrorRecovery } from '../utils/errorRecovery';
import { PollManager } from '../utils/pollManager';

interface ImportDebugPanelProps {
    pollManager: PollManager;
    onRecoveryAction?: () => void;
}

const ImportDebugPanel: React.FC<ImportDebugPanelProps> = ({
    pollManager,
    onRecoveryAction
}) => {
    const [showDebug, setShowDebug] = useState(false);
    const [debugStats, setDebugStats] = useState({
        stuckTasks: 0,
        totalRetries: 0,
        activePolls: 0,
        totalTasks: 0,
        historyCount: 0
    });
    const [isRecovering, setIsRecovering] = useState(false);
    
    const taskPersistence = TaskPersistence.getInstance();
    const errorRecovery = ErrorRecovery.getInstance();
    
    useEffect(() => {
        errorRecovery.setPollManager(pollManager);
    }, [pollManager, errorRecovery]);
    
    const updateStats = () => {
        const recoveryStats = errorRecovery.getRecoveryStats();
        const tasks = taskPersistence.loadTasks();
        const history = taskPersistence.loadHistory();
        
        setDebugStats({
            ...recoveryStats,
            totalTasks: tasks.length,
            historyCount: history.tasks.length
        });
    };
    
    useEffect(() => {
        if (showDebug) {
            updateStats();
            const interval = setInterval(updateStats, 5000); // Update every 5 seconds
            return () => clearInterval(interval);
        }
    }, [showDebug]);
    
    const handleAutoRecovery = async () => {
        setIsRecovering(true);
        try {
            await errorRecovery.recoverStuckTasks({
                maxRetries: 3,
                autoRecover: true
            });
            updateStats();
            onRecoveryAction?.();
        } catch (error) {
            console.error('Auto recovery failed:', error);
        } finally {
            setIsRecovering(false);
        }
    };
    
    const handleForceReset = () => {
        if (window.confirm('This will stop all active tasks and mark them as failed. Continue?')) {
            errorRecovery.forceResetAllTasks();
            updateStats();
            onRecoveryAction?.();
        }
    };
    
    const handleCleanupData = () => {
        if (window.confirm('This will clear all task history and orphaned data. Continue?')) {
            taskPersistence.clearAll();
            errorRecovery.cleanupOrphanedData();
            updateStats();
            onRecoveryAction?.();
        }
    };
    
    const getStatusColor = (value: number, threshold: number) => {
        if (value === 0) return 'success';
        if (value > threshold) return 'critical';
        return 'warning';
    };

    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">Debug & Recovery Panel</Text>
                    <Button
                        variant="plain"
                        icon={showDebug ? ChevronUpIcon : ChevronDownIcon}
                        onClick={() => setShowDebug(!showDebug)}
                    >
                        {showDebug ? 'Hide' : 'Show'}
                    </Button>
                </InlineStack>

                <Collapsible
                    open={showDebug}
                    id="debug-panel"
                    transition={{duration: '500ms', timingFunction: 'ease-in-out'}}
                >
                    <BlockStack gap="400">
                        {/* Status Overview */}
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h3" variant="headingSm">System Status</Text>
                                <InlineStack gap="300" wrap>
                                    <Badge tone={getStatusColor(debugStats.stuckTasks, 2)}>
                                        {`Stuck Tasks: ${debugStats.stuckTasks}`}
                                    </Badge>
                                    <Badge tone={debugStats.activePolls > 0 ? 'info' : undefined}>
                                        {`Active Polls: ${debugStats.activePolls}`}
                                    </Badge>
                                    <Badge>
                                        {`Total Tasks: ${debugStats.totalTasks}`}
                                    </Badge>
                                    <Badge>
                                        {`History Items: ${debugStats.historyCount}`}
                                    </Badge>
                                    <Badge tone={getStatusColor(debugStats.totalRetries, 5)}>
                                        {`Total Retries: ${debugStats.totalRetries}`}
                                    </Badge>
                                </InlineStack>
                                
                                <Button
                                    variant="plain"
                                    icon={RefreshIcon}
                                    onClick={updateStats}
                                    size="slim"
                                >
                                    Refresh Stats
                                </Button>
                            </BlockStack>
                        </Card>

                        {/* Alerts */}
                        {debugStats.stuckTasks > 0 && (
                            <Banner tone="warning">
                                <p>
                                    {debugStats.stuckTasks} task(s) appear to be stuck. 
                                    Consider running auto-recovery or manual intervention.
                                </p>
                            </Banner>
                        )}
                        
                        {debugStats.activePolls === 0 && debugStats.totalTasks > 0 && (
                            <Banner tone="info">
                                <p>
                                    No active polling detected but tasks exist. 
                                    Some tasks may need recovery.
                                </p>
                            </Banner>
                        )}

                        {/* Recovery Actions */}
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h3" variant="headingSm">Recovery Actions</Text>
                                
                                <InlineStack gap="200" wrap>
                                    <Button
                                        variant="primary"
                                        size="slim"
                                        onClick={handleAutoRecovery}
                                        loading={isRecovering}
                                        disabled={debugStats.stuckTasks === 0}
                                    >
                                        Auto Recover Stuck Tasks
                                    </Button>
                                    
                                    <Button
                                        variant="secondary"
                                        size="slim"
                                        tone="critical"
                                        onClick={handleForceReset}
                                        disabled={debugStats.totalTasks === 0}
                                    >
                                        Force Reset All Tasks
                                    </Button>
                                    
                                    <Button
                                        variant="plain"
                                        size="slim"
                                        icon={DeleteIcon}
                                        tone="critical"
                                        onClick={handleCleanupData}
                                    >
                                        Clear All Data
                                    </Button>
                                </InlineStack>
                            </BlockStack>
                        </Card>

                        {/* Debug Information */}
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h3" variant="headingSm">Debug Information</Text>
                                
                                <List type="bullet">
                                    <List.Item>
                                        <strong>Polling System:</strong> {debugStats.activePolls > 0 ? 'Active' : 'Inactive'}
                                    </List.Item>
                                    <List.Item>
                                        <strong>Persistence:</strong> {debugStats.totalTasks > 0 ? 'Working' : 'Empty'}
                                    </List.Item>
                                    <List.Item>
                                        <strong>Error Recovery:</strong> Enabled
                                    </List.Item>
                                    <List.Item>
                                        <strong>Browser Storage:</strong> LocalStorage
                                    </List.Item>
                                </List>
                                
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Last updated: {new Date().toLocaleTimeString()}
                                </Text>
                            </BlockStack>
                        </Card>

                        {/* Usage Tips */}
                        <Card>
                            <BlockStack gap="300">
                                <Text as="h3" variant="headingSm">Troubleshooting Tips</Text>
                                
                                <List type="number">
                                    <List.Item>
                                        If tasks are stuck, try <strong>Auto Recover</strong> first
                                    </List.Item>
                                    <List.Item>
                                        If polling seems inactive, refresh the page
                                    </List.Item>
                                    <List.Item>
                                        Use <strong>Force Reset</strong> only if auto recovery fails
                                    </List.Item>
                                    <List.Item>
                                        <strong>Clear All Data</strong> will reset everything to fresh state
                                    </List.Item>
                                    <List.Item>
                                        Check browser console for detailed error messages
                                    </List.Item>
                                </List>
                            </BlockStack>
                        </Card>
                    </BlockStack>
                </Collapsible>
            </BlockStack>
        </Card>
    );
};

export default ImportDebugPanel;