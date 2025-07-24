// electron/IPCTypes.ts
// Type definitions for IPC communication between main and renderer processes

import type { 
  APIProvider, 
  Config, 
  ConfigUpdate, 
  CLIStatus, 
  CLIModelsResponse, 
  CLIError,
  CLIExecutionResult 
} from './CLITypes';

/**
 * IPC Channel names for type-safe communication
 */
export const IPC_CHANNELS = {
  // Configuration channels
  GET_CONFIG: 'get-config',
  UPDATE_CONFIG: 'update-config',
  VALIDATE_API_KEY: 'validate-api-key',
  CHECK_API_KEY: 'check-api-key',
  
  // CLI-specific channels
  CHECK_GEMINI_CLI_STATUS: 'check-gemini-cli-status',
  GET_GEMINI_CLI_MODELS: 'get-gemini-cli-models',
  REFRESH_CLI_STATUS: 'refresh-cli-status',
  TEST_CLI_CONNECTION: 'test-cli-connection',
  EXECUTE_CLI_COMMAND: 'execute-cli-command',
  
  // Processing channels
  PROCESS_SCREENSHOTS: 'process-screenshots',
  DEBUG_CODE: 'debug-code',
  EXTRACT_PROBLEM: 'extract-problem',
  GENERATE_SOLUTION: 'generate-solution',
  
  // Event channels
  API_KEY_INVALID: 'api-key-invalid',
  CONFIG_UPDATED: 'config-updated',
  CLI_STATUS_CHANGED: 'cli-status-changed',
  PROCESSING_START: 'processing-start',
  PROCESSING_SUCCESS: 'processing-success',
  PROCESSING_ERROR: 'processing-error'
} as const;

/**
 * IPC Request/Response type definitions
 */

// Configuration IPC types
export interface GetConfigRequest {}
export interface GetConfigResponse extends Config {}

export interface UpdateConfigRequest extends ConfigUpdate {}
export interface UpdateConfigResponse {
  success: boolean;
  error?: string;
}

export interface ValidateApiKeyRequest {
  apiKey: string;
  provider?: APIProvider;
}
export interface ValidateApiKeyResponse {
  valid: boolean;
  error?: string;
}

export interface CheckApiKeyRequest {}
export interface CheckApiKeyResponse {
  valid: boolean;
  provider?: APIProvider;
}

// CLI IPC types
export interface CheckGeminiCLIStatusRequest {}
export interface CheckGeminiCLIStatusResponse extends CLIStatus {}

export interface GetGeminiCLIModelsRequest {}
export interface GetGeminiCLIModelsResponse extends CLIModelsResponse {}

export interface RefreshCLIStatusRequest {}
export interface RefreshCLIStatusResponse extends CLIStatus {}

export interface TestCLIConnectionRequest {}
export interface TestCLIConnectionResponse {
  success: boolean;
  error?: CLIError;
}

export interface ExecuteCLICommandRequest {
  command: string;
  args: string[];
  options?: {
    timeout?: number;
    retries?: number;
  };
}
export interface ExecuteCLICommandResponse extends CLIExecutionResult {}

// Processing IPC types
export interface ProcessScreenshotsRequest {
  screenshotPaths?: string[];
}
export interface ProcessScreenshotsResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface DebugCodeRequest {
  code: string;
  error?: string;
  language?: string;
}
export interface DebugCodeResponse {
  success: boolean;
  result?: any;
  error?: string;
}

export interface ExtractProblemRequest {
  imagePath: string;
  model?: string;
}
export interface ExtractProblemResponse {
  success: boolean;
  problem?: any;
  error?: string;
}

export interface GenerateSolutionRequest {
  problem: any;
  model?: string;
}
export interface GenerateSolutionResponse {
  success: boolean;
  solution?: any;
  error?: string;
}

/**
 * Event payload types
 */
export interface ApiKeyInvalidEvent {
  provider: APIProvider;
  error: string;
}

export interface ConfigUpdatedEvent {
  config: Config;
  changes: ConfigUpdate;
}

export interface CLIStatusChangedEvent {
  status: CLIStatus;
  previousStatus?: CLIStatus;
}

export interface ProcessingStartEvent {
  type: 'extraction' | 'solution' | 'debugging';
  timestamp: Date;
}

export interface ProcessingSuccessEvent {
  type: 'extraction' | 'solution' | 'debugging';
  result: any;
  timestamp: Date;
  duration: number;
}

export interface ProcessingErrorEvent {
  type: 'extraction' | 'solution' | 'debugging';
  error: string | CLIError;
  timestamp: Date;
  duration: number;
}

/**
 * Type-safe IPC handler definitions
 */
export type IPCHandler<TRequest, TResponse> = (
  event: Electron.IpcMainInvokeEvent,
  request: TRequest
) => Promise<TResponse>;

export type IPCEventEmitter<TPayload> = (payload: TPayload) => void;

/**
 * IPC Handler registry type for type-safe handler registration
 */
export interface IPCHandlerRegistry {
  // Configuration handlers
  [IPC_CHANNELS.GET_CONFIG]: IPCHandler<GetConfigRequest, GetConfigResponse>;
  [IPC_CHANNELS.UPDATE_CONFIG]: IPCHandler<UpdateConfigRequest, UpdateConfigResponse>;
  [IPC_CHANNELS.VALIDATE_API_KEY]: IPCHandler<ValidateApiKeyRequest, ValidateApiKeyResponse>;
  [IPC_CHANNELS.CHECK_API_KEY]: IPCHandler<CheckApiKeyRequest, CheckApiKeyResponse>;
  
  // CLI handlers
  [IPC_CHANNELS.CHECK_GEMINI_CLI_STATUS]: IPCHandler<CheckGeminiCLIStatusRequest, CheckGeminiCLIStatusResponse>;
  [IPC_CHANNELS.GET_GEMINI_CLI_MODELS]: IPCHandler<GetGeminiCLIModelsRequest, GetGeminiCLIModelsResponse>;
  [IPC_CHANNELS.REFRESH_CLI_STATUS]: IPCHandler<RefreshCLIStatusRequest, RefreshCLIStatusResponse>;
  [IPC_CHANNELS.TEST_CLI_CONNECTION]: IPCHandler<TestCLIConnectionRequest, TestCLIConnectionResponse>;
  [IPC_CHANNELS.EXECUTE_CLI_COMMAND]: IPCHandler<ExecuteCLICommandRequest, ExecuteCLICommandResponse>;
  
  // Processing handlers
  [IPC_CHANNELS.PROCESS_SCREENSHOTS]: IPCHandler<ProcessScreenshotsRequest, ProcessScreenshotsResponse>;
  [IPC_CHANNELS.DEBUG_CODE]: IPCHandler<DebugCodeRequest, DebugCodeResponse>;
  [IPC_CHANNELS.EXTRACT_PROBLEM]: IPCHandler<ExtractProblemRequest, ExtractProblemResponse>;
  [IPC_CHANNELS.GENERATE_SOLUTION]: IPCHandler<GenerateSolutionRequest, GenerateSolutionResponse>;
}

/**
 * IPC Event emitter registry type
 */
export interface IPCEventRegistry {
  [IPC_CHANNELS.API_KEY_INVALID]: IPCEventEmitter<ApiKeyInvalidEvent>;
  [IPC_CHANNELS.CONFIG_UPDATED]: IPCEventEmitter<ConfigUpdatedEvent>;
  [IPC_CHANNELS.CLI_STATUS_CHANGED]: IPCEventEmitter<CLIStatusChangedEvent>;
  [IPC_CHANNELS.PROCESSING_START]: IPCEventEmitter<ProcessingStartEvent>;
  [IPC_CHANNELS.PROCESSING_SUCCESS]: IPCEventEmitter<ProcessingSuccessEvent>;
  [IPC_CHANNELS.PROCESSING_ERROR]: IPCEventEmitter<ProcessingErrorEvent>;
}

/**
 * Utility types for IPC communication
 */
export type IPCChannelName = keyof typeof IPC_CHANNELS;
export type IPCChannelValue = typeof IPC_CHANNELS[IPCChannelName];

/**
 * Type guard functions for runtime type checking
 */
export function isValidIPCChannel(channel: string): channel is IPCChannelValue {
  return Object.values(IPC_CHANNELS).includes(channel as IPCChannelValue);
}

export function isConfigRequest(request: any): request is UpdateConfigRequest {
  return request && typeof request === 'object';
}

export function isCLICommandRequest(request: any): request is ExecuteCLICommandRequest {
  return request && 
         typeof request === 'object' &&
         'command' in request &&
         'args' in request &&
         typeof request.command === 'string' &&
         Array.isArray(request.args);
}

/**
 * Error response helper
 */
export function createErrorResponse<T>(error: string | Error | CLIError): T & { success: false; error: string } {
  const errorMessage = typeof error === 'string' ? error : 
                      error instanceof Error ? error.message :
                      error.message || 'Unknown error';
  
  return {
    success: false,
    error: errorMessage
  } as T & { success: false; error: string };
}

/**
 * Success response helper
 */
export function createSuccessResponse<T>(data: T): T & { success: true } {
  return {
    ...data,
    success: true
  } as T & { success: true };
}