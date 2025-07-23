// CLITypes.ts
// Core type definitions for Gemini CLI provider integration

import { CLIError, CLIErrorCategory, CLIErrorSeverity } from './CLIErrorTypes';

/**
 * API Provider types - centralized definition
 */
export type APIProvider = "openai" | "gemini" | "anthropic" | "gemini-cli";

/**
 * CLI Status interface for tracking CLI installation and authentication state
 */
export interface CLIStatus {
  isInstalled: boolean;
  isAuthenticated: boolean;
  version?: string;
  isCompatible: boolean;
  error?: string;
  errorCategory?: CLIErrorCategory;
  errorSeverity?: CLIErrorSeverity;
  actionableSteps?: string[];
  helpUrl?: string;
  isLoading: boolean;
}

/**
 * CLI Models response interface
 */
export interface CLIModelsResponse {
  models: string[];
  error?: string;
}

/**
 * CLI Configuration interface for provider-specific settings
 */
export interface CLIConfig {
  timeout: number;           // Command timeout in milliseconds
  maxRetries: number;        // Maximum retry attempts
  retryDelay: number;        // Base retry delay in milliseconds
  enableLogging: boolean;    // Enable detailed CLI logging
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * CLI Command interface for structured command execution
 */
export interface CLICommand {
  command: string;           // Base command (e.g., 'gemini')
  args: string[];           // Command arguments
  options?: {
    timeout?: number;
    cwd?: string;
    env?: Record<string, string>;
  };
}

/**
 * CLI Execution Result interface
 */
export interface CLIExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: CLIError;
  executionTime?: number;   // Execution time in milliseconds
}

/**
 * CLI Process Options interface
 */
export interface CLIProcessOptions {
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  onRetry?: (attempt: number, error: CLIError) => void;
  onProgress?: (message: string) => void;
}

/**
 * Enhanced Configuration interface with CLI support
 */
export interface Config {
  apiKey: string;
  apiProvider: APIProvider;
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  language: string;
  opacity: number;
  
  // CLI-specific configuration
  cliTimeout?: number;
  cliMaxRetries?: number;
  cliRetryDelay?: number;
  cliEnableLogging?: boolean;
  cliLogLevel?: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * Configuration Update interface for partial updates
 */
export interface ConfigUpdate {
  apiKey?: string;
  apiProvider?: APIProvider;
  extractionModel?: string;
  solutionModel?: string;
  debuggingModel?: string;
  language?: string;
  opacity?: number;
  
  // CLI-specific updates
  cliTimeout?: number;
  cliMaxRetries?: number;
  cliRetryDelay?: number;
  cliEnableLogging?: boolean;
  cliLogLevel?: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * AI Model interface for consistent model representation
 */
export interface AIModel {
  id: string;
  name: string;
  description: string;
  provider: APIProvider;
  capabilities?: string[];
  contextWindow?: number;
  maxTokens?: number;
}

/**
 * Model Category interface for organizing models by use case
 */
export interface ModelCategory {
  key: 'extractionModel' | 'solutionModel' | 'debuggingModel';
  title: string;
  description: string;
  openaiModels: AIModel[];
  geminiModels: AIModel[];
  anthropicModels: AIModel[];
  geminiCliModels: AIModel[];
}

/**
 * CLI Provider State interface for tracking provider readiness
 */
export interface CLIProviderState {
  isReady: boolean;
  status: CLIStatus;
  availableModels: string[];
  config: CLIConfig;
  lastChecked?: Date;
  lastError?: CLIError;
}

/**
 * CLI Operation interface for tracking operations
 */
export interface CLIOperation {
  id: string;
  type: 'extraction' | 'solution' | 'debugging' | 'status' | 'models';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  result?: any;
  error?: CLIError;
  retryCount: number;
  maxRetries: number;
}

/**
 * CLI Prompt interface for structured prompt formatting
 */
export interface CLIPrompt {
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  safetySettings?: Record<string, any>;
}

/**
 * CLI Response interface for structured response handling
 */
export interface CLIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  safetyRatings?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * CLI Validation Result interface
 */
export interface CLIValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * CLI Installation Info interface
 */
export interface CLIInstallationInfo {
  isInstalled: boolean;
  version?: string;
  installPath?: string;
  isCompatible: boolean;
  requiredVersion?: string;
  installationMethod?: 'pip' | 'conda' | 'manual' | 'unknown';
}

/**
 * CLI Authentication Info interface
 */
export interface CLIAuthenticationInfo {
  isAuthenticated: boolean;
  authMethod?: 'oauth' | 'api_key' | 'service_account';
  accountInfo?: {
    email?: string;
    projectId?: string;
    quotaInfo?: Record<string, any>;
  };
  tokenExpiry?: Date;
  scopes?: string[];
}

/**
 * Type guards for runtime type checking
 */
export function isAPIProvider(value: any): value is APIProvider {
  return typeof value === 'string' && 
         ['openai', 'gemini', 'anthropic', 'gemini-cli'].includes(value);
}

export function isCLIProvider(provider: APIProvider): provider is 'gemini-cli' {
  return provider === 'gemini-cli';
}

export function isCLIError(error: any): error is CLIError {
  return error && 
         typeof error === 'object' &&
         'category' in error &&
         'severity' in error &&
         'code' in error &&
         'message' in error;
}

export function isCLIStatus(status: any): status is CLIStatus {
  return status &&
         typeof status === 'object' &&
         'isInstalled' in status &&
         'isAuthenticated' in status &&
         'isLoading' in status;
}

/**
 * Default CLI configuration values
 */
export const DEFAULT_CLI_CONFIG: CLIConfig = {
  timeout: 30000,           // 30 seconds
  maxRetries: 3,
  retryDelay: 1000,         // 1 second
  enableLogging: false,
  logLevel: 'error'
};

/**
 * CLI command templates
 */
export const CLI_COMMANDS = {
  VERSION: ['--version'],
  STATUS: ['auth', 'status'],
  LOGIN: ['auth', 'login'],
  LOGOUT: ['auth', 'logout'],
  MODELS: ['models', 'list'],
  GENERATE: ['generate'],
  CHAT: ['chat']
} as const;

/**
 * CLI model validation patterns
 */
export const CLI_MODEL_PATTERNS = {
  GEMINI_PRO: /^gemini-.*-pro$/i,
  GEMINI_FLASH: /^gemini-.*-flash$/i,
  GEMINI_VISION: /^gemini-.*-vision$/i,
  VALID_MODEL: /^gemini-[\d\.]+-(?:pro|flash|vision)(?:-\d+)?$/i
} as const;

/**
 * Export all CLI error types for convenience
 */
export {
  CLIError,
  CLIErrorCategory,
  CLIErrorSeverity,
  CLI_ERROR_CODES,
  CLI_ERROR_DEFINITIONS,
  createCLIError,
  categorizeCLIError,
  isErrorRetryable,
  formatErrorForUser,
  getRetryDelay
} from './CLIErrorTypes';