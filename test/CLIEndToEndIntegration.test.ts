import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProcessingHelper } from '../electron/ProcessingHelper';
import { ConfigHelper } from '../electron/ConfigHelper';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data')
  }
}));

// Mock fs operations
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify({
      apiProvider: 'gemini-cli',
      extractionModel: 'gemini-2.0-flash',
      solutionModel: 'gemini-1.5-pro',
      debuggingModel: 'gemini-2.0-flash',
      cliTimeout: 30000,
      cliMaxRetries: 3
    })),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
}));

// Mock path operations
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn(() => '/mock/dir')
  }
}));

// Mock IProcessingHelperDeps
const mockDeps = {
  getScreenshotHelper: vi.fn(() => ({
    clearExtraScreenshotQueue: vi.fn()
  })),
  getMainWindow: vi.fn(() => ({
    webContents: {
      send: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue('python')
    },
    isDestroyed: vi.fn(() => false)
  })),
  getView: vi.fn(),
  setView: vi.fn(),
  getProblemInfo: vi.fn(),
  setProblemInfo: vi.fn(),
  setHasDebugged: vi.fn(),
  PROCESSING_EVENTS: {
    INITIAL_START: 'initial-start',
    API_KEY_INVALID: 'api-key-invalid',
    NO_SCREENSHOTS: 'no-screenshots',
    PROBLEM_EXTRACTED: 'problem-extracted',
    SOLUTION_SUCCESS: 'solution-success',
    INITIAL_SOLUTION_ERROR: 'initial-solution-error',
    DEBUG_START: 'debug-start',
    DEBUG_SUCCESS: 'debug-success',
    DEBUG_ERROR: 'debug-error'
  }
};

describe('CLI End-to-End Integration Tests', () => {
  let processingHelper: ProcessingHelper;
  let configHelper: ConfigHelper;
  let mockProcess: any;
  let mockSpawn: any;
  let mockAbortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAbortController = new AbortController();
    
    // Create a mock process object
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = {
      write: vi.fn(),
      end: vi.fn()
    };
    mockProcess.kill = vi.fn();
    mockProcess.killed = false;
    
    // Mock spawn to return our mock process
    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue(mockProcess);

    configHelper = new ConfigHelper();
    processingHelper = new ProcessingHelper(mockDeps as any);
  });

  afterEach(() => {
    vi.clearAllTimers();
    if (!mockAbortController.signal.aborted) {
      mockAbortController.abort();
    }
  });

  describe('Complete Screenshot Processing with CLI Provider', () => {
    const mockScreenshots = [
      { 
        path: '/path/to/problem.png', 
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' 
      }
    ];

    const mockProblemInfo = {
      problem_statement: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
      constraints: 'Each input would have exactly one solution, and you may not use the same element twice.',
      example_input: 'nums = [2,7,11,15], target = 9',
      example_output: '[0,1]'
    };

    it('should successfully process screenshots with CLI provider when properly configured', async () => {
      // Mock successful CLI responses for initialization
      let callCount = 0;
      mockSpawn.mockImplementation((command, args) => {
        callCount++;
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.stdin = { write: vi.fn(), end: vi.fn() };
        process.kill = vi.fn();
        process.killed = false;

        setTimeout(() => {
          if (args.includes('--version')) {
            process.stdout.emit('data', 'gemini 1.2.3\n');
            process.emit('close', 0);
          } else if (args.includes('auth')) {
            process.stdout.emit('data', 'Authenticated with Google account\n');
            process.emit('close', 0);
          } else if (args.includes('models')) {
            process.stdout.emit('data', 'gemini-1.5-pro\ngemini-2.0-flash\n');
            process.emit('close', 0);
          } else if (args.includes('generate')) {
            process.stdout.emit('data', JSON.stringify(mockProblemInfo));
            process.emit('close', 0);
          }
        }, 10);

        return process;
      });

      // Wait for CLI initialization
      await new Promise(resolve => setTimeout(resolve, 200));

      // Mock solution generation to avoid full workflow
      const mockGenerateSolutionsHelper = vi.spyOn(processingHelper as any, 'generateSolutionsHelper');
      mockGenerateSolutionsHelper.mockResolvedValue({
        success: true,
        data: { solution: 'Mock solution' }
      });

      const result = await (processingHelper as any).processScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(mockDeps.setProblemInfo).toHaveBeenCalledWith(mockProblemInfo);
    }, 10000);

    it('should handle CLI command failures gracefully', async () => {
      // Mock CLI command failure
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.stdin = { write: vi.fn(), end: vi.fn() };
        process.kill = vi.fn();
        process.killed = false;

        setTimeout(() => {
          process.stderr.emit('data', 'CLI command failed\n');
          process.emit('close', 1);
        }, 10);

        return process;
      });

      // Wait for CLI initialization
      await new Promise(resolve => setTimeout(resolve, 200));

      const result = await (processingHelper as any).processScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process');
    }, 10000);

    it('should handle malformed CLI responses with recovery', async () => {
      // Mock CLI returning malformed response
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.stdin = { write: vi.fn(), end: vi.fn() };
        process.kill = vi.fn();
        process.killed = false;

        setTimeout(() => {
          if (process.stdin.write.mock.calls.length > 0) {
            // Return malformed response for extraction
            process.stdout.emit('data', 'This is a readable problem but not JSON');
            process.emit('close', 0);
          } else {
            // Return success for other commands
            process.stdout.emit('data', 'gemini 1.2.3\n');
            process.emit('close', 0);
          }
        }, 10);

        return process;
      });

      // Wait for CLI initialization
      await new Promise(resolve => setTimeout(resolve, 200));

      // Mock solution generation
      const mockGenerateSolutionsHelper = vi.spyOn(processingHelper as any, 'generateSolutionsHelper');
      mockGenerateSolutionsHelper.mockResolvedValue({
        success: true,
        data: { solution: 'Mock solution' }
      });

      const result = await (processingHelper as any).processScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      // Should succeed with recovery
      expect(result.success).toBe(true);
      expect(mockDeps.setProblemInfo).toHaveBeenCalled();
    }, 10000);
  });

  describe('Provider Switching and Configuration Persistence', () => {
    it('should switch from API provider to CLI provider', () => {
      // Test basic provider switching
      const initialConfig = configHelper.loadConfig();
      expect(initialConfig.apiProvider).toBe('gemini-cli');

      const updatedConfig = configHelper.updateConfig({ 
        apiProvider: 'openai',
        apiKey: 'sk-test123'
      });

      expect(updatedConfig.apiProvider).toBe('openai');
      expect(updatedConfig.apiKey).toBe('sk-test123');
    });

    it('should validate CLI configuration parameters', () => {
      // Test CLI timeout validation
      const validTimeout = configHelper.validateCLITimeout(30000);
      expect(validTimeout.valid).toBe(true);

      const invalidTimeout = configHelper.validateCLITimeout(1000);
      expect(invalidTimeout.valid).toBe(false);
      expect(invalidTimeout.sanitized).toBe(5000);

      // Test CLI retry validation
      const validRetries = configHelper.validateCLIMaxRetries(3);
      expect(validRetries.valid).toBe(true);

      const invalidRetries = configHelper.validateCLIMaxRetries(-1);
      expect(invalidRetries.valid).toBe(false);
      expect(invalidRetries.sanitized).toBe(0);
    });

    it('should persist configuration changes', () => {
      const newConfig = {
        apiProvider: 'gemini-cli' as const,
        cliTimeout: 45000,
        cliMaxRetries: 5
      };

      configHelper.updateConfig(newConfig);

      // Verify writeFileSync was called for persistence
      const mockWriteFileSync = vi.mocked(require('node:fs').default.writeFileSync);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('Error Scenarios and Recovery Workflows', () => {
    it('should detect CLI installation errors', async () => {
      // Mock CLI not installed
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.kill = vi.fn();

        setTimeout(() => {
          process.emit('error', new Error('ENOENT: no such file or directory'));
        }, 10);

        return process;
      });

      const installationResult = await configHelper.detectGeminiCLIInstallation();

      expect(installationResult.isInstalled).toBe(false);
      expect(installationResult.error).toContain('Failed to execute Gemini CLI');
    });

    it('should detect CLI authentication errors', async () => {
      // Mock CLI installed but not authenticated
      mockSpawn.mockImplementation((command, args) => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.kill = vi.fn();

        setTimeout(() => {
          if (args.includes('--version')) {
            process.stdout.emit('data', 'gemini 1.2.3\n');
            process.emit('close', 0);
          } else if (args.includes('auth')) {
            process.stderr.emit('data', 'Not authenticated\n');
            process.emit('close', 1);
          }
        }, 10);

        return process;
      });

      const authResult = await configHelper.validateGeminiCLIAuthentication();

      expect(authResult.isAuthenticated).toBe(false);
      expect(authResult.error).toContain('Not authenticated');
    });

    it('should provide comprehensive CLI status with error guidance', async () => {
      // Mock CLI not installed scenario
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.kill = vi.fn();

        setTimeout(() => {
          process.emit('error', new Error('command not found: gemini'));
        }, 10);

        return process;
      });

      const status = await configHelper.getGeminiCLIStatus();

      expect(status.isInstalled).toBe(false);
      expect(status.isAuthenticated).toBe(false);
      expect(status.error).toBeDefined();
      expect(status.errorCategory).toBe('installation');
      expect(status.actionableSteps).toBeInstanceOf(Array);
      expect(status.actionableSteps.length).toBeGreaterThan(0);
    });

    it('should handle CLI timeout scenarios', async () => {
      // Mock CLI timeout
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.kill = vi.fn();
        process.killed = false;

        // Don't emit any events to simulate timeout
        return process;
      });

      const installationResult = await configHelper.detectGeminiCLIInstallation();

      expect(installationResult.isInstalled).toBe(false);
      expect(installationResult.error).toBe('Gemini CLI command timed out');
    }, 10000);

    it('should handle network connectivity issues', async () => {
      // Mock network error
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.stdin = { write: vi.fn(), end: vi.fn() };
        process.kill = vi.fn();
        process.killed = false;

        setTimeout(() => {
          process.stderr.emit('data', 'network connection failed\n');
          process.emit('close', 1);
        }, 10);

        return process;
      });

      // Wait for CLI initialization
      await new Promise(resolve => setTimeout(resolve, 200));

      const result = await (processingHelper as any).processScreenshotsHelper(
        [{ path: '/test.png', data: 'testdata' }],
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process');
      
      // Verify user was notified about network issues
      const mockSend = mockDeps.getMainWindow().webContents.send;
      expect(mockSend).toHaveBeenCalledWith('cli-progress-update', 
        expect.objectContaining({
          type: 'error'
        })
      );
    }, 10000);

    it('should categorize different CLI error types correctly', () => {
      const { categorizeCLIError } = require('../electron/CLIErrorTypes');
      
      // Test different error categorizations
      const installationError = categorizeCLIError('command not found: gemini', 127);
      expect(installationError.category).toBe('installation');

      const authError = categorizeCLIError('not authenticated', 1);
      expect(authError.category).toBe('authentication');

      const networkError = categorizeCLIError('network connection failed', 1);
      expect(networkError.category).toBe('network');

      const quotaError = categorizeCLIError('quota exceeded', 1);
      expect(quotaError.category).toBe('quota');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle process cleanup on abort signals', async () => {
      // Mock long-running CLI process
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.stdin = { write: vi.fn(), end: vi.fn() };
        process.kill = vi.fn();
        process.killed = false;

        // Don't emit close event to simulate hanging process
        return process;
      });

      // Wait for CLI initialization
      await new Promise(resolve => setTimeout(resolve, 200));

      // Start processing
      const processingPromise = (processingHelper as any).processScreenshotsHelper(
        [{ path: '/test.png', data: 'testdata' }],
        mockAbortController.signal
      );

      // Abort after short delay
      setTimeout(() => {
        mockAbortController.abort();
      }, 100);

      const result = await processingPromise;

      expect(result.success).toBe(false);
      
      // Verify process cleanup was attempted
      expect(mockProcess.kill).toHaveBeenCalled();
    }, 10000);

    it('should handle large data processing efficiently', async () => {
      // Create large mock screenshot data
      const largeScreenshots = Array.from({ length: 3 }, (_, i) => ({
        path: `/large_${i}.png`,
        data: 'x'.repeat(5000) // 5KB each
      }));

      // Mock CLI to handle large data
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.stdin = { write: vi.fn(), end: vi.fn() };
        process.kill = vi.fn();
        process.killed = false;

        setTimeout(() => {
          process.stdout.emit('data', JSON.stringify({
            problem_statement: 'Large data processed successfully'
          }));
          process.emit('close', 0);
        }, 50);

        return process;
      });

      // Wait for CLI initialization
      await new Promise(resolve => setTimeout(resolve, 200));

      // Mock solution generation
      const mockGenerateSolutionsHelper = vi.spyOn(processingHelper as any, 'generateSolutionsHelper');
      mockGenerateSolutionsHelper.mockResolvedValue({
        success: true,
        data: { solution: 'Mock solution' }
      });

      const result = await (processingHelper as any).processScreenshotsHelper(
        largeScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(mockDeps.setProblemInfo).toHaveBeenCalled();
    }, 10000);
  });
});