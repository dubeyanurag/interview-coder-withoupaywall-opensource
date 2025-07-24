// test/CLITypes.test.ts
// Comprehensive tests for CLI type definitions and type safety

import { describe, it, expect } from 'vitest';
import type {
  APIProvider,
  Config,
  ConfigUpdate,
  CLIStatus,
  CLIModelsResponse,
  CLIError,
  CLIErrorCategory,
  CLIErrorSeverity,
  AIModel,
  ModelCategory,
  CLIConfig,
  CLICommand,
  CLIExecutionResult,
  CLIProcessOptions,
  CLIProviderState,
  CLIOperation,
  CLIPrompt,
  CLIResponse,
  CLIValidationResult,
  CLIInstallationInfo,
  CLIAuthenticationInfo
} from '../electron/CLITypes';

import {
  isAPIProvider,
  isCLIProvider,
  isCLIError,
  isCLIStatus,
  DEFAULT_CLI_CONFIG,
  CLI_COMMANDS,
  CLI_MODEL_PATTERNS,
  CLI_ERROR_CODES,
  createCLIError,
  categorizeCLIError,
  isErrorRetryable,
  formatErrorForUser,
  getRetryDelay
} from '../electron/CLITypes';

describe('CLI Type Definitions', () => {
  describe('APIProvider Type', () => {
    it('should accept valid API providers', () => {
      const validProviders: APIProvider[] = ['openai', 'gemini', 'anthropic', 'gemini-cli'];
      
      validProviders.forEach(provider => {
        expect(isAPIProvider(provider)).toBe(true);
      });
    });

    it('should reject invalid API providers', () => {
      const invalidProviders = ['invalid', 'gpt', 'claude', '', null, undefined, 123];
      
      invalidProviders.forEach(provider => {
        expect(isAPIProvider(provider)).toBe(false);
      });
    });

    it('should correctly identify CLI provider', () => {
      expect(isCLIProvider('gemini-cli')).toBe(true);
      expect(isCLIProvider('openai')).toBe(false);
      expect(isCLIProvider('gemini')).toBe(false);
      expect(isCLIProvider('anthropic')).toBe(false);
    });
  });

  describe('Config Interface', () => {
    it('should accept valid configuration', () => {
      const validConfig: Config = {
        apiKey: 'test-key',
        apiProvider: 'gemini-cli',
        extractionModel: 'gemini-2.0-flash',
        solutionModel: 'gemini-2.0-flash',
        debuggingModel: 'gemini-2.0-flash',
        language: 'en',
        opacity: 0.95,
        cliTimeout: 30000,
        cliMaxRetries: 3,
        cliRetryDelay: 1000,
        cliEnableLogging: true,
        cliLogLevel: 'info'
      };

      expect(validConfig.apiProvider).toBe('gemini-cli');
      expect(validConfig.cliTimeout).toBe(30000);
      expect(validConfig.cliLogLevel).toBe('info');
    });

    it('should accept partial configuration updates', () => {
      const configUpdate: ConfigUpdate = {
        apiProvider: 'gemini-cli',
        cliTimeout: 45000,
        cliMaxRetries: 5
      };

      expect(configUpdate.apiProvider).toBe('gemini-cli');
      expect(configUpdate.cliTimeout).toBe(45000);
      expect(configUpdate.apiKey).toBeUndefined();
    });
  });

  describe('CLIStatus Interface', () => {
    it('should accept valid CLI status', () => {
      const validStatus: CLIStatus = {
        isInstalled: true,
        isAuthenticated: true,
        isCompatible: true,
        version: '1.0.0',
        isLoading: false,
        errorCategory: 'authentication',
        errorSeverity: 'medium',
        actionableSteps: ['Step 1', 'Step 2'],
        helpUrl: 'https://example.com'
      };

      expect(isCLIStatus(validStatus)).toBe(true);
      expect(validStatus.isInstalled).toBe(true);
      expect(validStatus.actionableSteps).toHaveLength(2);
    });

    it('should reject invalid CLI status', () => {
      const invalidStatus = {
        isInstalled: true,
        // Missing required fields
      };

      expect(isCLIStatus(invalidStatus)).toBe(false);
    });
  });

  describe('CLIError Interface', () => {
    it('should create valid CLI error', () => {
      const error = createCLIError(CLI_ERROR_CODES.CLI_NOT_FOUND, 'Technical details');
      
      expect(isCLIError(error)).toBe(true);
      expect(error.code).toBe(CLI_ERROR_CODES.CLI_NOT_FOUND);
      expect(error.category).toBe('installation');
      expect(error.severity).toBe('critical');
      expect(error.technicalDetails).toBe('Technical details');
      expect(error.retryable).toBe(false);
    });

    it('should categorize raw errors correctly', () => {
      const authError = categorizeCLIError('not authenticated');
      expect(authError.category).toBe('authentication');
      expect(authError.code).toBe(CLI_ERROR_CODES.AUTH_NOT_AUTHENTICATED);

      const networkError = categorizeCLIError('network connection failed');
      expect(networkError.category).toBe('network');
      expect(networkError.code).toBe(CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED);
    });

    it('should determine error retryability', () => {
      const retryableError = createCLIError(CLI_ERROR_CODES.EXEC_TIMEOUT);
      const nonRetryableError = createCLIError(CLI_ERROR_CODES.CLI_NOT_FOUND);

      expect(isErrorRetryable(retryableError)).toBe(true);
      expect(isErrorRetryable(nonRetryableError)).toBe(false);
    });

    it('should format error for user display', () => {
      const error = createCLIError(CLI_ERROR_CODES.AUTH_NOT_AUTHENTICATED);
      const formatted = formatErrorForUser(error);

      expect(formatted.title).toBe('Authentication Error');
      expect(formatted.message).toContain('authenticate');
      expect(formatted.steps).toBeInstanceOf(Array);
      expect(formatted.steps.length).toBeGreaterThan(0);
      expect(formatted.severity).toBe('critical');
    });

    it('should calculate appropriate retry delays', () => {
      const networkError = createCLIError(CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED);
      const timeoutError = createCLIError(CLI_ERROR_CODES.EXEC_TIMEOUT);
      const nonRetryableError = createCLIError(CLI_ERROR_CODES.CLI_NOT_FOUND);

      const networkDelay = getRetryDelay(networkError, 1);
      const timeoutDelay = getRetryDelay(timeoutError, 1);
      const nonRetryableDelay = getRetryDelay(nonRetryableError, 1);

      expect(networkDelay).toBeGreaterThan(0);
      expect(timeoutDelay).toBeGreaterThan(0);
      expect(timeoutDelay).toBeGreaterThan(networkDelay); // Timeout errors should have longer delays
      expect(nonRetryableDelay).toBe(0); // Non-retryable should return 0
    });
  });

  describe('AIModel Interface', () => {
    it('should accept valid AI model definition', () => {
      const model: AIModel = {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        description: 'Fast and efficient model',
        provider: 'gemini-cli',
        capabilities: ['text', 'vision'],
        contextWindow: 32000,
        maxTokens: 8192
      };

      expect(model.provider).toBe('gemini-cli');
      expect(model.capabilities).toContain('text');
      expect(model.contextWindow).toBe(32000);
    });
  });

  describe('ModelCategory Interface', () => {
    it('should accept valid model category', () => {
      const category: ModelCategory = {
        key: 'extractionModel',
        title: 'Problem Extraction',
        description: 'Models for extracting problems from screenshots',
        openaiModels: [],
        geminiModels: [],
        anthropicModels: [],
        geminiCliModels: [
          {
            id: 'gemini-2.0-flash',
            name: 'Gemini 2.0 Flash',
            description: 'Fast model',
            provider: 'gemini-cli'
          }
        ]
      };

      expect(category.key).toBe('extractionModel');
      expect(category.geminiCliModels).toHaveLength(1);
      expect(category.geminiCliModels[0].provider).toBe('gemini-cli');
    });
  });

  describe('CLI Command and Execution Types', () => {
    it('should accept valid CLI command', () => {
      const command: CLICommand = {
        command: 'gemini',
        args: ['generate', '--model', 'gemini-2.0-flash'],
        options: {
          timeout: 30000,
          cwd: '/tmp',
          env: { 'API_KEY': 'test' }
        }
      };

      expect(command.command).toBe('gemini');
      expect(command.args).toContain('generate');
      expect(command.options?.timeout).toBe(30000);
    });

    it('should accept valid CLI execution result', () => {
      const result: CLIExecutionResult = {
        success: true,
        stdout: 'Command output',
        stderr: '',
        exitCode: 0,
        executionTime: 1500
      };

      expect(result.success).toBe(true);
      expect(result.executionTime).toBe(1500);
    });

    it('should accept CLI execution result with error', () => {
      const errorResult: CLIExecutionResult = {
        success: false,
        stderr: 'Command failed',
        exitCode: 1,
        error: createCLIError(CLI_ERROR_CODES.EXEC_COMMAND_FAILED),
        executionTime: 500
      };

      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toBeDefined();
      expect(isCLIError(errorResult.error!)).toBe(true);
    });
  });

  describe('CLI Provider State', () => {
    it('should accept valid CLI provider state', () => {
      const state: CLIProviderState = {
        isReady: true,
        status: {
          isInstalled: true,
          isAuthenticated: true,
          isCompatible: true,
          isLoading: false
        },
        availableModels: ['gemini-2.0-flash', 'gemini-1.5-pro'],
        config: DEFAULT_CLI_CONFIG,
        lastChecked: new Date(),
        lastError: undefined
      };

      expect(state.isReady).toBe(true);
      expect(state.availableModels).toHaveLength(2);
      expect(state.config.timeout).toBe(DEFAULT_CLI_CONFIG.timeout);
    });
  });

  describe('Default Configuration', () => {
    it('should provide valid default CLI config', () => {
      expect(DEFAULT_CLI_CONFIG.timeout).toBe(30000);
      expect(DEFAULT_CLI_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_CLI_CONFIG.retryDelay).toBe(1000);
      expect(DEFAULT_CLI_CONFIG.enableLogging).toBe(false);
      expect(DEFAULT_CLI_CONFIG.logLevel).toBe('error');
    });
  });

  describe('CLI Commands Constants', () => {
    it('should provide valid CLI command templates', () => {
      expect(CLI_COMMANDS.VERSION).toEqual(['--version']);
      expect(CLI_COMMANDS.STATUS).toEqual(['auth', 'status']);
      expect(CLI_COMMANDS.LOGIN).toEqual(['auth', 'login']);
      expect(CLI_COMMANDS.MODELS).toEqual(['models', 'list']);
      expect(CLI_COMMANDS.GENERATE).toEqual(['generate']);
    });
  });

  describe('Model Validation Patterns', () => {
    it('should validate Gemini model names correctly', () => {
      expect(CLI_MODEL_PATTERNS.GEMINI_PRO.test('gemini-1.5-pro')).toBe(true);
      expect(CLI_MODEL_PATTERNS.GEMINI_FLASH.test('gemini-2.0-flash')).toBe(true);
      expect(CLI_MODEL_PATTERNS.VALID_MODEL.test('gemini-1.5-pro')).toBe(true);
      expect(CLI_MODEL_PATTERNS.VALID_MODEL.test('gemini-2.0-flash')).toBe(true);
      expect(CLI_MODEL_PATTERNS.VALID_MODEL.test('invalid-model')).toBe(false);
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify CLI errors', () => {
      const validError = createCLIError(CLI_ERROR_CODES.CLI_NOT_FOUND);
      const invalidError = { message: 'Not a CLI error' };

      expect(isCLIError(validError)).toBe(true);
      expect(isCLIError(invalidError)).toBe(false);
      expect(isCLIError(null)).toBeFalsy();
      expect(isCLIError(undefined)).toBeFalsy();
    });

    it('should correctly identify CLI status objects', () => {
      const validStatus: CLIStatus = {
        isInstalled: true,
        isAuthenticated: false,
        isCompatible: true,
        isLoading: false
      };
      const invalidStatus = { installed: true }; // Wrong property names

      expect(isCLIStatus(validStatus)).toBe(true);
      expect(isCLIStatus(invalidStatus)).toBe(false);
    });
  });
});

describe('Type Compatibility', () => {
  it('should ensure Config extends base configuration', () => {
    const config: Config = {
      apiKey: 'test',
      apiProvider: 'gemini-cli',
      extractionModel: 'gemini-2.0-flash',
      solutionModel: 'gemini-2.0-flash',
      debuggingModel: 'gemini-2.0-flash',
      language: 'en',
      opacity: 0.95,
      // CLI-specific properties should be optional
      cliTimeout: 30000
    };

    // Should compile without errors
    expect(config.apiProvider).toBe('gemini-cli');
  });

  it('should ensure ConfigUpdate allows partial updates', () => {
    const update: ConfigUpdate = {
      apiProvider: 'gemini-cli',
      cliTimeout: 45000
      // Other properties should be optional
    };

    expect(update.apiProvider).toBe('gemini-cli');
    expect(update.apiKey).toBeUndefined();
  });

  it('should ensure CLIModelsResponse has correct structure', () => {
    const response: CLIModelsResponse = {
      models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
      error: undefined
    };

    expect(response.models).toHaveLength(2);
    expect(response.error).toBeUndefined();

    const errorResponse: CLIModelsResponse = {
      models: [],
      error: 'Failed to fetch models'
    };

    expect(errorResponse.models).toHaveLength(0);
    expect(errorResponse.error).toBe('Failed to fetch models');
  });
});