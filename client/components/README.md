# Import Components Architecture

This document describes the new modular architecture for the product import system.

## Components Overview

### Core Components

#### 1. ImportPage.tsx
- **Purpose**: Main page orchestrator
- **Features**: 
  - Manages overall state
  - Coordinates between components
  - Handles component lifecycle
  - English interface

#### 2. ImportSearchForm.tsx
- **Purpose**: Brand selection and search initiation
- **Features**:
  - Brand dropdown with API type indicators
  - Keyword input with comma separation
  - Product limit configuration
  - Non-blocking form (always available)

#### 3. ImportTaskManager.tsx
- **Purpose**: Task overview and management
- **Features**:
  - Collapsible task list
  - Real-time status indicators
  - Task actions (view, remove, import)
  - Visual progress indicators

#### 4. ImportProductTable.tsx
- **Purpose**: Product search results display
- **Features**:
  - Paginated product table
  - Bulk selection controls
  - Product detail modal integration
  - Import action buttons

#### 5. ImportTaskHistory.tsx
- **Purpose**: Historical task records
- **Features**:
  - Persistent task history
  - Performance metrics
  - Clear history functionality
  - Task duration tracking

#### 6. ImportDebugPanel.tsx
- **Purpose**: Development and troubleshooting
- **Features**:
  - System status monitoring
  - Error recovery tools
  - Data cleanup utilities
  - Performance diagnostics

## Utility Classes

### 1. TaskPersistence.ts
- **Purpose**: Local storage management
- **Features**:
  - Browser storage persistence
  - Automatic cleanup
  - Task history management
  - Data recovery capabilities

### 2. PollManager.ts
- **Purpose**: API polling coordination
- **Features**:
  - Concurrent polling support
  - Stuck task detection
  - Automatic retry logic
  - Resource cleanup

### 3. ErrorRecovery.ts
- **Purpose**: Error handling and recovery
- **Features**:
  - Stuck task identification
  - Automatic recovery attempts
  - Manual intervention tools
  - Data integrity protection

## Key Improvements

### 1. **Persistent State Management**
- Tasks survive browser refreshes
- Automatic state recovery
- History preservation
- Data integrity checks

### 2. **Robust Polling System**
- Stuck task detection (15-minute timeout)
- Automatic retry mechanism
- Resource leak prevention
- Concurrent task support

### 3. **Enhanced Error Handling**
- Multiple recovery strategies
- User-friendly error messages
- Diagnostic information
- Manual intervention options

### 4. **Modular Architecture**
- Component separation
- Clear responsibility boundaries
- Reusable utilities
- Maintainable codebase

### 5. **English Interface**
- All user-facing text in English
- Consistent terminology
- Clear status indicators
- Professional appearance

## Usage Workflow

### Normal Operation
1. User selects brand and keywords
2. System creates new task
3. Background polling monitors progress
4. Results displayed when complete
5. User selects products to import
6. Import process runs concurrently

### Error Recovery
1. System detects stuck tasks
2. Debug panel shows warnings
3. Auto-recovery attempts resolution
4. Manual intervention if needed
5. Data cleanup as last resort

## Configuration

### Polling Settings
- Poll interval: 2 seconds
- Max attempts: 300 (10 minutes)
- Stuck threshold: 15 minutes
- Retry limit: 3 attempts

### Storage Settings
- Max history items: 50
- Cleanup interval: 24 hours
- Storage keys: 'import_tasks', 'import_task_history'

## Development Notes

### Adding New Features
1. Follow component separation principles
2. Use TypeScript for type safety
3. Implement proper error handling
4. Add debug logging
5. Update persistence schema if needed

### Testing Considerations
- Test with multiple concurrent tasks
- Verify persistence across refreshes
- Check error recovery scenarios
- Validate cleanup mechanisms
- Monitor memory usage

### Performance Optimization
- Debounce UI updates
- Limit concurrent polls
- Cleanup orphaned data
- Optimize re-renders
- Monitor bundle size

## Troubleshooting

### Common Issues
1. **Tasks stuck in "searching"**: Use auto-recovery
2. **Missing task history**: Check browser storage
3. **Polling not working**: Refresh page
4. **High memory usage**: Clear all data
5. **UI not updating**: Check console errors

### Debug Tools
- Debug panel provides system status
- Browser console shows detailed logs
- Network tab shows API calls
- Application tab shows storage data