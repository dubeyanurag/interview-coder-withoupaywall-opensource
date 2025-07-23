// CLIErrorTypes.ts
// CLI-specific error types and messages for Gemini CLI provider

/**
 * Enumeration of CLI error categories for better error handling and user guidance
 */
export enum CLIErrorCategory {
  INSTALLATION = 'installation',
  AUTHENTICATION = 'authentication',
  EXECUTION = 'execution',
  RESPONSE = 'response',
  TIMEOUT = 'timeout',
  NETWORK = 'network',
  PERMISSION = 'permission',
  QUOTA = 'quota',
  UNKNOWN = 'unknown'
}

/**
 * CLI error severity levels for appropriate user feedback
 */
export enum CLIErrorSeverity {
  CRITICAL = 'critical',    // Blocks all functionality
  HIGH = 'high',           // Blocks current operation
  MEDIUM = 'medium',       // Degrades functionality
  LOW = 'low'              // Minor issues
}

/**
 * Structured CLI error interface with actionable guidance
 */
export interface CLIError {
  category: CLIErrorCategory;
  severity: CLIErrorSeverity;
  code: string;
  message: string;
  userMessage: string;
  actionableSteps: string[];
  technicalDetails?: string;
  retryable: boolean;
  helpUrl?: string;
}

/**
 * CLI error codes for specific error identification
 */
export const CLI_ERROR_CODES = {
  // Installation errors
  CLI_NOT_FOUND: 'CLI_NOT_FOUND',
  CLI_VERSION_INCOMPATIBLE: 'CLI_VERSION_INCOMPATIBLE',
  CLI_INSTALLATION_CORRUPT: 'CLI_INSTALLATION_CORRUPT',
  CLI_DEPENDENCIES_MISSING: 'CLI_DEPENDENCIES_MISSING',
  
  // Authentication errors
  AUTH_NOT_AUTHENTICATED: 'AUTH_NOT_AUTHENTICATED',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_PERMISSION_DENIED: 'AUTH_PERMISSION_DENIED',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED',
  
  // Execution errors
  EXEC_COMMAND_FAILED: 'EXEC_COMMAND_FAILED',
  EXEC_TIMEOUT: 'EXEC_TIMEOUT',
  EXEC_PROCESS_CRASHED: 'EXEC_PROCESS_CRASHED',
  EXEC_INVALID_ARGUMENTS: 'EXEC_INVALID_ARGUMENTS',
  EXEC_RESOURCE_EXHAUSTED: 'EXEC_RESOURCE_EXHAUSTED',
  
  // Response errors
  RESPONSE_MALFORMED: 'RESPONSE_MALFORMED',
  RESPONSE_EMPTY: 'RESPONSE_EMPTY',
  RESPONSE_INVALID_JSON: 'RESPONSE_INVALID_JSON',
  RESPONSE_MISSING_FIELDS: 'RESPONSE_MISSING_FIELDS',
  RESPONSE_VALIDATION_FAILED: 'RESPONSE_VALIDATION_FAILED',
  
  // Network and quota errors
  NETWORK_CONNECTION_FAILED: 'NETWORK_CONNECTION_FAILED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Generic errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Predefined CLI error definitions with user-friendly messages and actionable guidance
 */
export const CLI_ERROR_DEFINITIONS: Record<string, Omit<CLIError, 'technicalDetails'>> = {
  [CLI_ERROR_CODES.CLI_NOT_FOUND]: {
    category: CLIErrorCategory.INSTALLATION,
    severity: CLIErrorSeverity.CRITICAL,
    code: CLI_ERROR_CODES.CLI_NOT_FOUND,
    message: 'Gemini CLI not found in system PATH',
    userMessage: 'The Gemini CLI tool is not installed or not accessible.',
    actionableSteps: [
      'Install the Gemini CLI using: pip install google-generativeai[cli]',
      'Ensure the CLI is available in your system PATH',
      'Restart the application after installation',
      'Verify installation by running: gemini --version'
    ],
    retryable: false,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.CLI_VERSION_INCOMPATIBLE]: {
    category: CLIErrorCategory.INSTALLATION,
    severity: CLIErrorSeverity.HIGH,
    code: CLI_ERROR_CODES.CLI_VERSION_INCOMPATIBLE,
    message: 'Gemini CLI version is not compatible',
    userMessage: 'Your Gemini CLI version is not supported by this application.',
    actionableSteps: [
      'Update the Gemini CLI to the latest version',
      'Run: pip install --upgrade google-generativeai[cli]',
      'Verify the new version: gemini --version',
      'Restart the application'
    ],
    retryable: false,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.CLI_INSTALLATION_CORRUPT]: {
    category: CLIErrorCategory.INSTALLATION,
    severity: CLIErrorSeverity.HIGH,
    code: CLI_ERROR_CODES.CLI_INSTALLATION_CORRUPT,
    message: 'Gemini CLI installation appears to be corrupted',
    userMessage: 'The Gemini CLI installation is damaged or incomplete.',
    actionableSteps: [
      'Uninstall the current CLI: pip uninstall google-generativeai',
      'Reinstall the CLI: pip install google-generativeai[cli]',
      'Clear any cached CLI data if applicable',
      'Restart the application'
    ],
    retryable: false,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.AUTH_NOT_AUTHENTICATED]: {
    category: CLIErrorCategory.AUTHENTICATION,
    severity: CLIErrorSeverity.CRITICAL,
    code: CLI_ERROR_CODES.AUTH_NOT_AUTHENTICATED,
    message: 'Gemini CLI is not authenticated',
    userMessage: 'You need to authenticate with your Google account to use the Gemini CLI.',
    actionableSteps: [
      'Run: gemini auth login',
      'Follow the authentication prompts in your browser',
      'Ensure you have a valid Google account with Gemini API access',
      'Verify authentication: gemini auth status'
    ],
    retryable: false,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.AUTH_TOKEN_EXPIRED]: {
    category: CLIErrorCategory.AUTHENTICATION,
    severity: CLIErrorSeverity.HIGH,
    code: CLI_ERROR_CODES.AUTH_TOKEN_EXPIRED,
    message: 'Authentication token has expired',
    userMessage: 'Your authentication session has expired and needs to be renewed.',
    actionableSteps: [
      'Re-authenticate with: gemini auth login',
      'Complete the authentication flow in your browser',
      'Verify the new authentication: gemini auth status',
      'Try your request again'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.AUTH_INVALID_CREDENTIALS]: {
    category: CLIErrorCategory.AUTHENTICATION,
    severity: CLIErrorSeverity.HIGH,
    code: CLI_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
    message: 'Invalid authentication credentials',
    userMessage: 'Your authentication credentials are invalid or corrupted.',
    actionableSteps: [
      'Clear existing credentials: gemini auth logout',
      'Re-authenticate with: gemini auth login',
      'Ensure you use valid Google account credentials',
      'Check that your account has Gemini API access'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.AUTH_PERMISSION_DENIED]: {
    category: CLIErrorCategory.PERMISSION,
    severity: CLIErrorSeverity.HIGH,
    code: CLI_ERROR_CODES.AUTH_PERMISSION_DENIED,
    message: 'Permission denied for Gemini API access',
    userMessage: 'Your account does not have permission to access the Gemini API.',
    actionableSteps: [
      'Verify your Google account has Gemini API access',
      'Check if your organization has enabled Gemini API',
      'Ensure you have accepted any required terms of service',
      'Contact your administrator if using a managed account'
    ],
    retryable: false,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.EXEC_COMMAND_FAILED]: {
    category: CLIErrorCategory.EXECUTION,
    severity: CLIErrorSeverity.MEDIUM,
    code: CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
    message: 'CLI command execution failed',
    userMessage: 'The Gemini CLI command could not be executed successfully.',
    actionableSteps: [
      'Check your internet connection',
      'Verify the CLI is properly installed and authenticated',
      'Try the operation again in a few moments',
      'Check the Gemini API status if the problem persists'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.EXEC_TIMEOUT]: {
    category: CLIErrorCategory.TIMEOUT,
    severity: CLIErrorSeverity.MEDIUM,
    code: CLI_ERROR_CODES.EXEC_TIMEOUT,
    message: 'CLI command timed out',
    userMessage: 'The CLI command took too long to complete and was cancelled.',
    actionableSteps: [
      'Check your internet connection speed',
      'Try with a smaller image or simpler request',
      'Increase the timeout setting in CLI configuration',
      'Retry the operation'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.EXEC_PROCESS_CRASHED]: {
    category: CLIErrorCategory.EXECUTION,
    severity: CLIErrorSeverity.HIGH,
    code: CLI_ERROR_CODES.EXEC_PROCESS_CRASHED,
    message: 'CLI process crashed unexpectedly',
    userMessage: 'The Gemini CLI process crashed while processing your request.',
    actionableSteps: [
      'Restart the application',
      'Check if the CLI installation is corrupted',
      'Try with a different or smaller input',
      'Report this issue if it continues to occur'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.RESPONSE_MALFORMED]: {
    category: CLIErrorCategory.RESPONSE,
    severity: CLIErrorSeverity.MEDIUM,
    code: CLI_ERROR_CODES.RESPONSE_MALFORMED,
    message: 'CLI returned malformed response',
    userMessage: 'The CLI returned an unexpected response format.',
    actionableSteps: [
      'Try the operation again',
      'Check if your CLI version is up to date',
      'Verify your input is properly formatted',
      'Contact support if the issue persists'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.RESPONSE_EMPTY]: {
    category: CLIErrorCategory.RESPONSE,
    severity: CLIErrorSeverity.MEDIUM,
    code: CLI_ERROR_CODES.RESPONSE_EMPTY,
    message: 'CLI returned empty response',
    userMessage: 'The CLI did not return any response to your request.',
    actionableSteps: [
      'Verify your input contains valid content',
      'Check your internet connection',
      'Try with different input or a simpler request',
      'Retry the operation'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.RESPONSE_INVALID_JSON]: {
    category: CLIErrorCategory.RESPONSE,
    severity: CLIErrorSeverity.MEDIUM,
    code: CLI_ERROR_CODES.RESPONSE_INVALID_JSON,
    message: 'CLI response contains invalid JSON',
    userMessage: 'The CLI response could not be parsed as valid JSON.',
    actionableSteps: [
      'Try the operation again',
      'Check if the CLI output format has changed',
      'Verify your CLI version is compatible',
      'Report this issue if it continues'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED]: {
    category: CLIErrorCategory.NETWORK,
    severity: CLIErrorSeverity.MEDIUM,
    code: CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED,
    message: 'Network connection failed',
    userMessage: 'Could not connect to the Gemini API servers.',
    actionableSteps: [
      'Check your internet connection',
      'Verify you can access Google services',
      'Try again in a few moments',
      'Check if there are any firewall restrictions'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  },

  [CLI_ERROR_CODES.QUOTA_EXCEEDED]: {
    category: CLIErrorCategory.QUOTA,
    severity: CLIErrorSeverity.HIGH,
    code: CLI_ERROR_CODES.QUOTA_EXCEEDED,
    message: 'API quota exceeded',
    userMessage: 'You have exceeded your Gemini API usage quota.',
    actionableSteps: [
      'Wait for your quota to reset (usually daily or monthly)',
      'Check your API usage in the Google AI Studio console',
      'Consider upgrading your API plan if needed',
      'Reduce the frequency of requests'
    ],
    retryable: false,
    helpUrl: 'https://aistudio.google.com/app/apikey'
  },

  [CLI_ERROR_CODES.RATE_LIMIT_EXCEEDED]: {
    category: CLIErrorCategory.QUOTA,
    severity: CLIErrorSeverity.MEDIUM,
    code: CLI_ERROR_CODES.RATE_LIMIT_EXCEEDED,
    message: 'Rate limit exceeded',
    userMessage: 'You are making requests too quickly. Please slow down.',
    actionableSteps: [
      'Wait a few seconds before trying again',
      'Reduce the frequency of your requests',
      'Consider implementing request batching',
      'Check your API rate limits in the console'
    ],
    retryable: true,
    helpUrl: 'https://aistudio.google.com/app/apikey'
  },

  [CLI_ERROR_CODES.UNKNOWN_ERROR]: {
    category: CLIErrorCategory.UNKNOWN,
    severity: CLIErrorSeverity.MEDIUM,
    code: CLI_ERROR_CODES.UNKNOWN_ERROR,
    message: 'Unknown CLI error occurred',
    userMessage: 'An unexpected error occurred while using the Gemini CLI.',
    actionableSteps: [
      'Try the operation again',
      'Restart the application',
      'Check the CLI installation and authentication',
      'Report this issue with details about what you were doing'
    ],
    retryable: true,
    helpUrl: 'https://ai.google.dev/gemini-api/docs/cli'
  }
};

/**
 * Create a CLI error from an error code with optional technical details
 */
export function createCLIError(
  errorCode: string,
  technicalDetails?: string,
  customMessage?: string
): CLIError {
  const errorDef = CLI_ERROR_DEFINITIONS[errorCode];
  
  if (!errorDef) {
    // Fallback to unknown error if code not found
    const unknownError = CLI_ERROR_DEFINITIONS[CLI_ERROR_CODES.UNKNOWN_ERROR];
    return {
      ...unknownError,
      technicalDetails: technicalDetails || `Unknown error code: ${errorCode}`,
      message: customMessage || unknownError.message
    };
  }

  return {
    ...errorDef,
    technicalDetails,
    message: customMessage || errorDef.message
  };
}

/**
 * Categorize a raw error message/output into a structured CLI error
 */
export function categorizeCLIError(
  rawError: string,
  exitCode?: number,
  context?: string
): CLIError {
  const lowerError = rawError.toLowerCase();
  
  // Installation errors
  if (lowerError.includes('command not found') || 
      lowerError.includes('not recognized') ||
      lowerError.includes('gemini: not found')) {
    return createCLIError(CLI_ERROR_CODES.CLI_NOT_FOUND, rawError);
  }
  
  if (lowerError.includes('version') && 
      (lowerError.includes('incompatible') || lowerError.includes('unsupported'))) {
    return createCLIError(CLI_ERROR_CODES.CLI_VERSION_INCOMPATIBLE, rawError);
  }
  
  // Authentication errors
  if (lowerError.includes('not authenticated') || 
      lowerError.includes('authentication required') ||
      lowerError.includes('not logged in')) {
    return createCLIError(CLI_ERROR_CODES.AUTH_NOT_AUTHENTICATED, rawError);
  }
  
  if (lowerError.includes('token expired') || 
      lowerError.includes('expired') && lowerError.includes('auth')) {
    return createCLIError(CLI_ERROR_CODES.AUTH_TOKEN_EXPIRED, rawError);
  }
  
  if (lowerError.includes('invalid credentials') || 
      lowerError.includes('invalid token') ||
      lowerError.includes('authentication failed')) {
    return createCLIError(CLI_ERROR_CODES.AUTH_INVALID_CREDENTIALS, rawError);
  }
  
  if (lowerError.includes('permission denied') || 
      lowerError.includes('access denied') ||
      lowerError.includes('forbidden')) {
    return createCLIError(CLI_ERROR_CODES.AUTH_PERMISSION_DENIED, rawError);
  }
  
  // Network and quota errors
  if (lowerError.includes('quota') && lowerError.includes('exceeded')) {
    return createCLIError(CLI_ERROR_CODES.QUOTA_EXCEEDED, rawError);
  }
  
  if (lowerError.includes('rate limit') || 
      lowerError.includes('too many requests')) {
    return createCLIError(CLI_ERROR_CODES.RATE_LIMIT_EXCEEDED, rawError);
  }
  
  if (lowerError.includes('network') || 
      lowerError.includes('connection') ||
      lowerError.includes('timeout') && lowerError.includes('network')) {
    return createCLIError(CLI_ERROR_CODES.NETWORK_CONNECTION_FAILED, rawError);
  }
  
  // Execution errors
  if (context === 'timeout' || lowerError.includes('timed out')) {
    return createCLIError(CLI_ERROR_CODES.EXEC_TIMEOUT, rawError);
  }
  
  if (exitCode && exitCode < 0) {
    return createCLIError(CLI_ERROR_CODES.EXEC_PROCESS_CRASHED, rawError);
  }
  
  // Response errors
  if (lowerError.includes('json') && 
      (lowerError.includes('invalid') || lowerError.includes('malformed'))) {
    return createCLIError(CLI_ERROR_CODES.RESPONSE_INVALID_JSON, rawError);
  }
  
  if (lowerError.includes('empty response') || 
      lowerError.includes('no response')) {
    return createCLIError(CLI_ERROR_CODES.RESPONSE_EMPTY, rawError);
  }
  
  if (lowerError.includes('malformed') || 
      lowerError.includes('invalid format')) {
    return createCLIError(CLI_ERROR_CODES.RESPONSE_MALFORMED, rawError);
  }
  
  // Generic execution failure
  if (exitCode && exitCode > 0) {
    return createCLIError(CLI_ERROR_CODES.EXEC_COMMAND_FAILED, rawError);
  }
  
  // Fallback to unknown error
  return createCLIError(CLI_ERROR_CODES.UNKNOWN_ERROR, rawError);
}

/**
 * Check if an error is retryable based on its category and code
 */
export function isErrorRetryable(error: CLIError): boolean {
  return error.retryable;
}

/**
 * Get user-friendly error message with actionable steps
 */
export function formatErrorForUser(error: CLIError): {
  title: string;
  message: string;
  steps: string[];
  helpUrl?: string;
  severity: CLIErrorSeverity;
} {
  return {
    title: `${error.category.charAt(0).toUpperCase() + error.category.slice(1)} Error`,
    message: error.userMessage,
    steps: error.actionableSteps,
    helpUrl: error.helpUrl,
    severity: error.severity
  };
}

/**
 * Get appropriate retry delay based on error type
 */
export function getRetryDelay(error: CLIError, attemptNumber: number): number {
  if (!error.retryable) {
    return 0;
  }
  
  // Base delay in milliseconds
  let baseDelay = 1000;
  
  // Adjust base delay based on error category
  switch (error.category) {
    case CLIErrorCategory.NETWORK:
      baseDelay = 2000;
      break;
    case CLIErrorCategory.QUOTA:
      baseDelay = 5000;
      break;
    case CLIErrorCategory.TIMEOUT:
      baseDelay = 3000;
      break;
    default:
      baseDelay = 1000;
  }
  
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attemptNumber - 1);
  const jitter = Math.random() * 0.1 * exponentialDelay;
  
  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
}