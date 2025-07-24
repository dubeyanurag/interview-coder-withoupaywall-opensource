// src/types/cli.ts
// Re-export CLI types for React components

export type {
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
} from '../../electron/CLITypes';

export {
  isAPIProvider,
  isCLIProvider,
  isCLIError,
  isCLIStatus,
  DEFAULT_CLI_CONFIG,
  CLI_COMMANDS,
  CLI_MODEL_PATTERNS,
  CLI_ERROR_CODES,
  CLI_ERROR_DEFINITIONS,
  createCLIError,
  categorizeCLIError,
  isErrorRetryable,
  formatErrorForUser,
  getRetryDelay
} from '../../electron/CLITypes';