// ProcessingHelper.ts
import fs from "node:fs"
import path from "node:path"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import * as axios from "axios"
import { app, BrowserWindow, dialog } from "electron"
import { OpenAI } from "openai"
import { configHelper } from "./ConfigHelper"
import Anthropic from '@anthropic-ai/sdk';
import { spawn, ChildProcess } from "child_process";
import { 
  APIProvider,
  Config,
  CLIStatus,
  CLIExecutionResult,
  CLIError, 
  CLIErrorCategory, 
  CLIErrorSeverity,
  CLI_ERROR_CODES,
  createCLIError,
  categorizeCLIError,
  isErrorRetryable,
  formatErrorForUser,
  getRetryDelay
} from "./CLITypes";

// Interface for Gemini API requests
interface GeminiMessage {
  role: string;
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    }
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}

// CLI Command Interfaces
interface GeminiCLICommand {
  command: string;
  args: string[];
  input?: string;
  timeout?: number;
}

interface GeminiCLIResponse {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  cliError?: CLIError;
}
export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper
  private openaiClient: OpenAI | null = null
  private geminiApiKey: string | null = null
  private anthropicClient: Anthropic | null = null
  
  // CLI client state management
  private cliClientState: {
    isInitialized: boolean;
    isInstalled: boolean;
    isAuthenticated: boolean;
    availableModels: string[];
    lastChecked: number;
    error?: string;
  } = {
    isInitialized: false,
    isInstalled: false,
    isAuthenticated: false,
    availableModels: [],
    lastChecked: 0
  };

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()
    
    // Initialize AI client based on config (async, but don't wait)
    this.initializeAIClient().catch(error => {
      console.error('Failed to initialize AI client in constructor:', error);
    });
    
    // Listen for config changes to re-initialize the AI client
    configHelper.on('config-updated', () => {
      this.initializeAIClient().catch(error => {
        console.error('Failed to initialize AI client on config update:', error);
      });
    });
  }
  
  /**
   * Initialize or reinitialize the AI client with current config
   */
  private async initializeAIClient(): Promise<void> {
    try {
      const config = configHelper.loadConfig();
      
      if (config.apiProvider === "openai") {
        if (config.apiKey) {
          this.openaiClient = new OpenAI({ 
            apiKey: config.apiKey,
            timeout: 60000, // 60 second timeout
            maxRetries: 2   // Retry up to 2 times
          });
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.log("OpenAI client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, OpenAI client not initialized");
        }
      } else if (config.apiProvider === "gemini"){
        // Gemini client initialization
        this.openaiClient = null;
        this.anthropicClient = null;
        if (config.apiKey) {
          this.geminiApiKey = config.apiKey;
          console.log("Gemini API key set successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, Gemini client not initialized");
        }
      } else if (config.apiProvider === "anthropic") {
        // Reset other clients
        this.openaiClient = null;
        this.geminiApiKey = null;
        if (config.apiKey) {
          this.anthropicClient = new Anthropic({
            apiKey: config.apiKey,
            timeout: 60000,
            maxRetries: 2
          });
          console.log("Anthropic client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, Anthropic client not initialized");
        }
      } else if (config.apiProvider === "gemini-cli") {
        // Reset other clients for CLI provider
        this.openaiClient = null;
        this.geminiApiKey = null;
        this.anthropicClient = null;
        
        // Initialize CLI client state
        await this.initializeCLIClient();
        console.log("Gemini CLI provider initialized successfully");
      }
    } catch (error) {
      console.error("Failed to initialize AI client:", error);
      this.openaiClient = null;
      this.geminiApiKey = null;
      this.anthropicClient = null;
    }
  }

  /**
   * Initialize CLI client state and validate CLI installation/authentication
   */
  private async initializeCLIClient(): Promise<void> {
    try {
      // Reset CLI state
      this.cliClientState = {
        isInitialized: false,
        isInstalled: false,
        isAuthenticated: false,
        availableModels: [],
        lastChecked: Date.now(),
        error: undefined
      };

      // Check CLI installation with error handling
      if (typeof configHelper.detectGeminiCLIInstallation === 'function') {
        const installationResult = await configHelper.detectGeminiCLIInstallation();
        this.cliClientState.isInstalled = installationResult.isInstalled;
        
        if (!installationResult.isInstalled) {
          this.cliClientState.error = installationResult.error || 'Gemini CLI not installed';
          console.warn('Gemini CLI not installed:', this.cliClientState.error);
          return;
        }
      } else {
        console.warn('detectGeminiCLIInstallation method not available');
        this.cliClientState.error = 'CLI detection method not available';
        return;
      }

      // Check CLI authentication with error handling
      if (typeof configHelper.validateGeminiCLIAuthentication === 'function') {
        const authResult = await configHelper.validateGeminiCLIAuthentication();
        this.cliClientState.isAuthenticated = authResult.isAuthenticated;
        
        if (!authResult.isAuthenticated) {
          this.cliClientState.error = authResult.error || 'Gemini CLI not authenticated';
          console.warn('Gemini CLI not authenticated:', this.cliClientState.error);
          return;
        }
      } else {
        console.warn('validateGeminiCLIAuthentication method not available');
        this.cliClientState.error = 'CLI authentication method not available';
        return;
      }

      // Get available models with error handling
      if (typeof configHelper.getGeminiCLIModels === 'function') {
        const modelsResult = await configHelper.getGeminiCLIModels();
        this.cliClientState.availableModels = modelsResult.models || [];
        
        if (modelsResult.error) {
          console.warn('Error getting CLI models:', modelsResult.error);
          // Don't fail initialization if we can't get models - use defaults
          this.cliClientState.availableModels = ['gemini-2.0-flash', 'gemini-1.5-pro'];
        }
      } else {
        console.warn('getGeminiCLIModels method not available, using defaults');
        this.cliClientState.availableModels = ['gemini-2.0-flash', 'gemini-1.5-pro'];
      }

      // Mark as successfully initialized
      this.cliClientState.isInitialized = true;
      this.cliClientState.error = undefined;
      
      console.log('CLI client state initialized successfully:', {
        installed: this.cliClientState.isInstalled,
        authenticated: this.cliClientState.isAuthenticated,
        models: this.cliClientState.availableModels.length
      });

    } catch (error: any) {
      console.error('Failed to initialize CLI client:', error);
      this.cliClientState.error = `Initialization failed: ${error.message}`;
      this.cliClientState.isInitialized = false;
    }
  }

  /**
   * Get CLI client state for external access
   */
  public getCLIClientState(): typeof this.cliClientState {
    return { ...this.cliClientState };
  }

  /**
   * Check if CLI provider is ready for use
   */
  public isCLIProviderReady(): boolean {
    return this.cliClientState.isInitialized && 
           this.cliClientState.isInstalled && 
           this.cliClientState.isAuthenticated;
  }

  /**
   * Refresh CLI client state (useful for checking after user fixes issues)
   */
  public async refreshCLIClientState(): Promise<void> {
    const config = configHelper.loadConfig();
    if (config.apiProvider === "gemini-cli") {
      await this.initializeCLIClient();
    }
  }

  /**
   * Execute a Gemini CLI command with timeout handling and security sanitization
   */
  private async executeGeminiCLI(command: GeminiCLICommand, signal?: AbortSignal): Promise<GeminiCLIResponse> {
    return new Promise((resolve) => {
      const config = configHelper.loadConfig();
      const timeout = command.timeout || config.cliTimeout || 30000;
      
      // Sanitize command arguments for security
      const sanitizedArgs = this.sanitizeCliArguments(command.args);
      
      console.log(`Executing Gemini CLI: ${command.command} ${sanitizedArgs.join(' ')}`);
      
      // Spawn the CLI process
      const childProcess = spawn(command.command, sanitizedArgs, {
        stdio: 'pipe',
        shell: true,
        env: { ...process.env }
      });
      
      let stdout = '';
      let stderr = '';
      let isResolved = false;
      let timeoutId: NodeJS.Timeout;
      
      // Set up timeout handling
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (childProcess && !childProcess.killed) {
          childProcess.kill('SIGTERM');
          // Force kill after 5 seconds if process doesn't terminate
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }
      };
      
      // Handle timeout
      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          
          // Create structured timeout error
          const cliError = createCLIError(
            CLI_ERROR_CODES.EXEC_TIMEOUT,
            `Command timed out after ${timeout}ms`,
            `Command timed out after ${timeout}ms`
          );
          
          resolve({
            success: false,
            error: `Command timed out after ${timeout}ms`,
            exitCode: -1,
            cliError
          });
        }
      }, timeout);
      
      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            
            // Create structured abort error
            const cliError = createCLIError(
              CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
              'Command was aborted by user',
              'Command was aborted'
            );
            
            resolve({
              success: false,
              error: 'Command was aborted',
              exitCode: -1,
              cliError
            });
          }
        });
      }
      
      // Collect stdout data
      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      // Collect stderr data
      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      // Handle process completion
      childProcess.on('close', (code: number | null) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          
          if (code === 0) {
            resolve({
              success: true,
              output: stdout.trim(),
              exitCode: code
            });
          } else {
            // Categorize the error based on output and exit code
            const errorOutput = stderr.trim() || stdout.trim() || `Process exited with code ${code}`;
            const cliError = categorizeCLIError(errorOutput, code || -1, 'execution');
            
            resolve({
              success: false,
              error: errorOutput,
              exitCode: code || -1,
              cliError
            });
          }
        }
      });
      
      // Handle process errors
      childProcess.on('error', (error: Error) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          
          // Categorize process execution errors
          const cliError = categorizeCLIError(error.message, -1, 'process_error');
          
          resolve({
            success: false,
            error: `Failed to execute command: ${error.message}`,
            exitCode: -1,
            cliError
          });
        }
      });
      
      // Send input if provided
      if (command.input && childProcess.stdin) {
        try {
          childProcess.stdin.write(command.input);
          childProcess.stdin.end();
        } catch (error) {
          console.error('Error writing to CLI stdin:', error);
        }
      }
    });
  }
  
  /**
   * Sanitize CLI arguments to prevent command injection
   */
  private sanitizeCliArguments(args: string[]): string[] {
    return args.map(arg => {
      // Remove or escape potentially dangerous characters
      return arg
        .replace(/[;&|`$(){}[\]<>]/g, '') // Remove shell metacharacters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }).filter(arg => arg.length > 0); // Remove empty arguments
  }
  
  // Circuit breaker state for CLI operations
  private cliCircuitBreaker: {
    failureCount: number;
    lastFailureTime: number;
    state: 'closed' | 'open' | 'half-open';
    threshold: number;
    timeout: number;
  } = {
    failureCount: 0,
    lastFailureTime: 0,
    state: 'closed',
    threshold: 5, // Open circuit after 5 consecutive failures
    timeout: 60000 // Keep circuit open for 1 minute
  };

  /**
   * Check if CLI circuit breaker allows execution
   */
  private canExecuteCLI(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    
    switch (this.cliCircuitBreaker.state) {
      case 'closed':
        return { allowed: true };
        
      case 'open':
        if (now - this.cliCircuitBreaker.lastFailureTime > this.cliCircuitBreaker.timeout) {
          this.cliCircuitBreaker.state = 'half-open';
          return { allowed: true };
        }
        return { 
          allowed: false, 
          reason: `CLI temporarily unavailable due to repeated failures. Will retry after ${Math.ceil((this.cliCircuitBreaker.timeout - (now - this.cliCircuitBreaker.lastFailureTime)) / 1000)} seconds.`
        };
        
      case 'half-open':
        return { allowed: true };
        
      default:
        return { allowed: true };
    }
  }

  /**
   * Record CLI operation result for circuit breaker
   */
  private recordCLIResult(success: boolean, error?: CLIError): void {
    if (success) {
      // Reset circuit breaker on success
      this.cliCircuitBreaker.failureCount = 0;
      this.cliCircuitBreaker.state = 'closed';
    } else {
      // Only count certain types of failures for circuit breaker
      if (error && (
        error.category === CLIErrorCategory.INSTALLATION ||
        error.category === CLIErrorCategory.AUTHENTICATION ||
        error.category === CLIErrorCategory.NETWORK ||
        (error.category === CLIErrorCategory.EXECUTION && error.severity === CLIErrorSeverity.CRITICAL)
      )) {
        this.cliCircuitBreaker.failureCount++;
        this.cliCircuitBreaker.lastFailureTime = Date.now();
        
        if (this.cliCircuitBreaker.failureCount >= this.cliCircuitBreaker.threshold) {
          this.cliCircuitBreaker.state = 'open';
          console.warn(`CLI circuit breaker opened due to ${this.cliCircuitBreaker.failureCount} consecutive failures`);
        }
      }
    }
  }

  /**
   * Send progress notification to renderer process
   */
  private sendProgressNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    try {
      const mainWindow = this.deps.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cli-progress-update', {
          message,
          type,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to send progress notification:', error);
    }
  }

  /**
   * Execute Gemini CLI command with enhanced retry logic, user feedback, and graceful degradation
   */
  private async executeGeminiCLIWithRetry(command: GeminiCLICommand, signal?: AbortSignal): Promise<GeminiCLIResponse> {
    const config = configHelper.loadConfig();
    const maxRetries = config.cliMaxRetries || 3;
    
    // Check circuit breaker before attempting execution
    const circuitCheck = this.canExecuteCLI();
    if (!circuitCheck.allowed) {
      const cliError = createCLIError(
        CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
        circuitCheck.reason || 'CLI temporarily unavailable',
        circuitCheck.reason || 'CLI circuit breaker is open'
      );
      
      this.sendProgressNotification(
        `CLI temporarily unavailable: ${circuitCheck.reason}`,
        'warning'
      );
      
      return {
        success: false,
        error: circuitCheck.reason || 'CLI temporarily unavailable',
        exitCode: -1,
        cliError
      };
    }

    // Check if CLI provider is ready before attempting execution
    if (!this.isCLIProviderReady()) {
      const cliState = this.getCLIClientState();
      let errorMessage = 'CLI provider not ready';
      let errorCode: string = CLI_ERROR_CODES.EXEC_COMMAND_FAILED;
      
      if (!cliState.isInstalled) {
        errorMessage = 'Gemini CLI is not installed';
        errorCode = CLI_ERROR_CODES.CLI_NOT_FOUND;
      } else if (!cliState.isAuthenticated) {
        errorMessage = 'Gemini CLI is not authenticated';
        errorCode = CLI_ERROR_CODES.AUTH_NOT_AUTHENTICATED;
      } else if (cliState.error) {
        errorMessage = cliState.error;
      }
      
      const cliError = createCLIError(errorCode, errorMessage);
      const errorInfo = formatErrorForUser(cliError);
      
      this.sendProgressNotification(
        `CLI setup required: ${errorInfo.message}`,
        'error'
      );
      
      // Record failure for circuit breaker
      this.recordCLIResult(false, cliError);
      
      return {
        success: false,
        error: `${errorInfo.title}: ${errorInfo.message}`,
        exitCode: -1,
        cliError
      };
    }
    
    let lastError: CLIError | undefined;
    let totalRetryTime = 0;
    const maxTotalRetryTime = 300000; // 5 minutes maximum total retry time
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Send progress notification for retry attempts
        if (attempt > 1) {
          this.sendProgressNotification(
            `Retrying CLI command (attempt ${attempt}/${maxRetries})...`,
            'info'
          );
        }
        
        const result = await this.executeGeminiCLI(command, signal);
        
        if (result.success) {
          // Record success for circuit breaker
          this.recordCLIResult(true);
          
          // Send success notification if this was a retry
          if (attempt > 1) {
            this.sendProgressNotification(
              `CLI command succeeded after ${attempt} attempts`,
              'info'
            );
          }
          
          return result;
        }
        
        // Categorize the error for better handling
        const cliError = result.cliError || categorizeCLIError(
          result.error || 'Unknown CLI error',
          result.exitCode,
          attempt > 1 ? 'retry' : 'initial'
        );
        
        lastError = cliError;
        
        // Check if error is retryable using structured error handling
        if (isErrorRetryable(cliError)) {
          if (attempt < maxRetries) {
            const retryDelay = getRetryDelay(cliError, attempt);
            
            // Check if total retry time would exceed maximum
            if (totalRetryTime + retryDelay > maxTotalRetryTime) {
              console.log(`Maximum total retry time (${maxTotalRetryTime}ms) would be exceeded, stopping retries`);
              
              const timeoutError = createCLIError(
                CLI_ERROR_CODES.EXEC_TIMEOUT,
                `Maximum retry time exceeded (${maxTotalRetryTime}ms)`,
                'Retry timeout exceeded'
              );
              const errorInfo = formatErrorForUser(timeoutError);
              
              this.sendProgressNotification(
                `Retry timeout exceeded: ${errorInfo.message}`,
                'error'
              );
              
              this.recordCLIResult(false, timeoutError);
              
              return {
                success: false,
                error: `${errorInfo.title}: ${errorInfo.message}`,
                exitCode: -1,
                cliError: timeoutError
              };
            }
            
            // Enhanced logging with user feedback
            console.log(`CLI command failed (attempt ${attempt}/${maxRetries}), retrying in ${retryDelay}ms...`);
            console.log(`Error category: ${cliError.category}, severity: ${cliError.severity}`);
            console.log(`Error details: ${cliError.message}`);
            
            // Send user-friendly progress notification
            const errorInfo = formatErrorForUser(cliError);
            this.sendProgressNotification(
              `${errorInfo.title}: Retrying in ${Math.ceil(retryDelay / 1000)} seconds... (${attempt}/${maxRetries})`,
              'warning'
            );
            
            // Wait before retry with appropriate delay, but check for abort signal
            try {
              await this.delayWithAbortCheck(retryDelay, signal);
              totalRetryTime += retryDelay;
            } catch (delayError) {
              // Operation was aborted during delay
              const abortError = createCLIError(
                CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
                'Operation was aborted during retry delay'
              );
              
              return {
                success: false,
                error: 'Operation was aborted',
                exitCode: -1,
                cliError: abortError
              };
            }
            
            // Check if operation was aborted during delay
            if (signal?.aborted) {
              const abortError = createCLIError(
                CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
                'Operation was aborted during retry delay'
              );
              
              return {
                success: false,
                error: 'Operation was aborted',
                exitCode: -1,
                cliError: abortError
              };
            }
            
            continue;
          }
        }
        
        // Non-retryable error or max retries reached
        const errorInfo = formatErrorForUser(cliError);
        
        // Record failure for circuit breaker
        this.recordCLIResult(false, cliError);
        
        // Send final error notification with graceful degradation guidance
        this.sendProgressNotification(
          `CLI command failed: ${errorInfo.message}. Consider switching to a different API provider.`,
          'error'
        );
        
        return {
          success: false,
          error: `${errorInfo.title}: ${errorInfo.message}`,
          exitCode: result.exitCode,
          cliError // Include structured error for advanced handling
        };
        
      } catch (error: any) {
        const cliError = categorizeCLIError(error.message, -1, 'exception');
        lastError = cliError;
        
        if (attempt === maxRetries) {
          const finalError = createCLIError(
            CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
            error.message,
            `Failed after ${maxRetries} attempts: ${error.message}`
          );
          const errorInfo = formatErrorForUser(finalError);
          
          // Record failure for circuit breaker
          this.recordCLIResult(false, finalError);
          
          // Send final error notification with graceful degradation guidance
          this.sendProgressNotification(
            `CLI command failed after ${maxRetries} attempts: ${errorInfo.message}. Consider switching to a different API provider.`,
            'error'
          );
          
          return {
            success: false,
            error: `${errorInfo.title}: ${errorInfo.message}`,
            exitCode: -1,
            cliError: finalError
          };
        }
        
        console.log(`CLI execution error (attempt ${attempt}/${maxRetries}):`, error.message);
        
        // Use structured error handling for retry delay
        const retryDelay = getRetryDelay(cliError, attempt);
        
        // Check if total retry time would exceed maximum
        if (totalRetryTime + retryDelay > maxTotalRetryTime) {
          console.log(`Maximum total retry time (${maxTotalRetryTime}ms) would be exceeded, stopping retries`);
          
          const timeoutError = createCLIError(
            CLI_ERROR_CODES.EXEC_TIMEOUT,
            `Maximum retry time exceeded (${maxTotalRetryTime}ms)`,
            'Retry timeout exceeded'
          );
          const errorInfo = formatErrorForUser(timeoutError);
          
          this.sendProgressNotification(
            `Retry timeout exceeded: ${errorInfo.message}`,
            'error'
          );
          
          this.recordCLIResult(false, timeoutError);
          
          return {
            success: false,
            error: `${errorInfo.title}: ${errorInfo.message}`,
            exitCode: -1,
            cliError: timeoutError
          };
        }
        
        // Send progress notification for exception-based retries
        this.sendProgressNotification(
          `CLI execution error: Retrying in ${Math.ceil(retryDelay / 1000)} seconds... (${attempt}/${maxRetries})`,
          'warning'
        );
        
        try {
          await this.delayWithAbortCheck(retryDelay, signal);
          totalRetryTime += retryDelay;
        } catch (delayError) {
          // Operation was aborted during delay
          const abortError = createCLIError(
            CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
            'Operation was aborted during retry delay'
          );
          
          return {
            success: false,
            error: 'Operation was aborted',
            exitCode: -1,
            cliError: abortError
          };
        }
        
        // Check if operation was aborted during delay
        if (signal?.aborted) {
          const abortError = createCLIError(
            CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
            'Operation was aborted during retry delay'
          );
          
          return {
            success: false,
            error: 'Operation was aborted',
            exitCode: -1,
            cliError: abortError
          };
        }
      }
    }
    
    // This should never be reached, but included for completeness
    const finalError = lastError || createCLIError(CLI_ERROR_CODES.EXEC_COMMAND_FAILED, `Failed after ${maxRetries} attempts`);
    const errorInfo = formatErrorForUser(finalError);
    
    // Record failure for circuit breaker
    this.recordCLIResult(false, finalError);
    
    // Send final error notification with graceful degradation guidance
    this.sendProgressNotification(
      `CLI command failed: ${errorInfo.message}. Consider switching to a different API provider.`,
      'error'
    );
    
    return {
      success: false,
      error: `${errorInfo.title}: ${errorInfo.message}`,
      exitCode: -1,
      cliError: finalError
    };
  }

  /**
   * Generate graceful degradation message based on CLI state and operation type
   */
  private generateGracefulDegradationMessage(cliState: typeof this.cliClientState, operationType: 'extraction' | 'solution' | 'debugging'): string {
    const baseMessage = `Failed to process ${operationType} with Gemini CLI.`;
    
    if (!cliState.isInstalled) {
      return `${baseMessage} The Gemini CLI is not installed. Please install it using: pip install google-generativeai[cli], then restart the application. You can also switch to a different API provider in Settings.`;
    }
    
    if (!cliState.isAuthenticated) {
      return `${baseMessage} The Gemini CLI is not authenticated. Please run 'gemini auth login' in your terminal to authenticate, then try again. Alternatively, you can switch to a different API provider in Settings.`;
    }
    
    if (cliState.error) {
      return `${baseMessage} CLI Error: ${cliState.error}. Please check your CLI installation and authentication, or switch to a different API provider in Settings.`;
    }
    
    // Check circuit breaker state
    const circuitCheck = this.canExecuteCLI();
    if (!circuitCheck.allowed) {
      return `${baseMessage} ${circuitCheck.reason} You can wait for the CLI to become available again, or switch to a different API provider in Settings for immediate processing.`;
    }
    
    return `${baseMessage} Please check your CLI installation and authentication, or switch to a different API provider in Settings.`;
  }

  /**
   * Delay with abort signal checking for responsive cancellation
   */
  private async delayWithAbortCheck(delayMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Operation aborted'));
        return;
      }
      
      const timeout = setTimeout(() => {
        resolve();
      }, delayMs);
      
      // Listen for abort signal during delay
      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new Error('Operation aborted'));
      };
      
      signal?.addEventListener('abort', abortHandler, { once: true });
      
      // Clean up abort listener when delay completes
      timeout.unref();
      setTimeout(() => {
        signal?.removeEventListener('abort', abortHandler);
      }, delayMs + 100);
    });
  }

  /**
   * Enhanced timeout handling with user feedback and graceful cancellation
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string,
    signal?: AbortSignal
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Operation aborted before starting'));
        return;
      }

      let isCompleted = false;
      let timeoutId: NodeJS.Timeout;

      // Set up timeout
      timeoutId = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          
          // Send timeout notification to user
          this.sendProgressNotification(
            `${operationName} timed out after ${Math.ceil(timeoutMs / 1000)} seconds`,
            'error'
          );
          
          reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      // Handle abort signal
      const abortHandler = () => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeoutId);
          
          this.sendProgressNotification(
            `${operationName} was cancelled by user`,
            'info'
          );
          
          reject(new Error(`${operationName} was aborted`));
        }
      };

      signal?.addEventListener('abort', abortHandler, { once: true });

      // Execute the operation
      operation()
        .then((result) => {
          if (!isCompleted) {
            isCompleted = true;
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', abortHandler);
            resolve(result);
          }
        })
        .catch((error) => {
          if (!isCompleted) {
            isCompleted = true;
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', abortHandler);
            reject(error);
          }
        });
    });
  }

  /**
   * Parse CLI response with structured error handling and validation
   */
  private parseCLIResponse(rawOutput: string): { success: boolean; data?: any; error?: string; cliError?: CLIError } {
    if (!rawOutput || rawOutput.trim().length === 0) {
      const cliError = createCLIError(CLI_ERROR_CODES.RESPONSE_EMPTY, rawOutput);
      const errorInfo = formatErrorForUser(cliError);
      return {
        success: false,
        error: errorInfo.message,
        cliError
      };
    }

    try {
      // Clean the output - remove any non-JSON content before/after JSON
      const cleanedOutput = this.extractJSONFromCLIOutput(rawOutput);
      
      if (!cleanedOutput) {
        const cliError = createCLIError(
          CLI_ERROR_CODES.RESPONSE_INVALID_JSON,
          rawOutput,
          "No valid JSON found in CLI response"
        );
        const errorInfo = formatErrorForUser(cliError);
        return {
          success: false,
          error: errorInfo.message,
          cliError
        };
      }

      // Parse the JSON
      const parsedData = JSON.parse(cleanedOutput);
      
      // Validate the parsed data structure
      const validationResult = this.validateCLIResponseStructure(parsedData);
      if (!validationResult.valid) {
        const cliError = createCLIError(
          CLI_ERROR_CODES.RESPONSE_VALIDATION_FAILED,
          rawOutput,
          `Invalid response structure: ${validationResult.error}`
        );
        const errorInfo = formatErrorForUser(cliError);
        return {
          success: false,
          error: errorInfo.message,
          cliError
        };
      }

      return {
        success: true,
        data: parsedData
      };
    } catch (error: any) {
      // Handle specific JSON parsing errors with structured error types
      let cliError: CLIError;
      
      if (error instanceof SyntaxError) {
        cliError = createCLIError(
          CLI_ERROR_CODES.RESPONSE_INVALID_JSON,
          rawOutput,
          `Malformed JSON in CLI response: ${error.message}`
        );
      } else {
        cliError = createCLIError(
          CLI_ERROR_CODES.RESPONSE_MALFORMED,
          rawOutput,
          `Failed to parse CLI response: ${error.message}`
        );
      }
      
      const errorInfo = formatErrorForUser(cliError);
      return {
        success: false,
        error: errorInfo.message,
        cliError
      };
    }
  }

  /**
   * Extract JSON content from CLI output that may contain extra text
   */
  private extractJSONFromCLIOutput(output: string): string | null {
    // Remove ANSI color codes and control characters
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '').trim();
    
    // Try to find JSON content between braces
    const jsonPatterns = [
      // Look for complete JSON objects
      /\{[\s\S]*\}/,
      // Look for JSON arrays
      /\[[\s\S]*\]/
    ];

    for (const pattern of jsonPatterns) {
      const match = cleanOutput.match(pattern);
      if (match) {
        const potentialJson = match[0];
        
        // Validate that it's actually valid JSON by trying to parse it
        try {
          JSON.parse(potentialJson);
          return potentialJson;
        } catch {
          // Continue to next pattern if this doesn't parse
          continue;
        }
      }
    }

    // If no JSON patterns found, try to extract from markdown code blocks
    const codeBlockMatch = cleanOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        const jsonContent = codeBlockMatch[1].trim();
        JSON.parse(jsonContent);
        return jsonContent;
      } catch {
        // Continue if code block doesn't contain valid JSON
      }
    }

    // Last resort: try to parse the entire cleaned output
    try {
      JSON.parse(cleanOutput);
      return cleanOutput;
    } catch {
      return null;
    }
  }

  /**
   * Validate CLI response structure based on expected format
   */
  private validateCLIResponseStructure(data: any): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return {
        valid: false,
        error: "Response must be a valid object"
      };
    }

    // Check for error responses first
    if (data.error) {
      return {
        valid: false,
        error: `CLI returned error: ${data.error}`
      };
    }

    // For problem extraction responses
    if (data.problem_statement !== undefined) {
      const requiredFields = ['problem_statement'];
      const optionalFields = ['constraints', 'example_input', 'example_output'];
      
      for (const field of requiredFields) {
        if (!data[field] || typeof data[field] !== 'string') {
          return {
            valid: false,
            error: `Missing or invalid required field: ${field}`
          };
        }
      }
      
      // Validate optional fields if present
      for (const field of optionalFields) {
        if (data[field] !== undefined && typeof data[field] !== 'string') {
          return {
            valid: false,
            error: `Invalid type for field ${field}: expected string`
          };
        }
      }
      
      return { valid: true };
    }

    // For solution generation responses (text content)
    if (typeof data === 'string' || data.text || data.content) {
      return { valid: true };
    }

    // For structured solution responses
    if (data.code !== undefined || data.thoughts !== undefined) {
      if (data.code && typeof data.code !== 'string') {
        return {
          valid: false,
          error: "Code field must be a string"
        };
      }
      
      if (data.thoughts && !Array.isArray(data.thoughts) && typeof data.thoughts !== 'string') {
        return {
          valid: false,
          error: "Thoughts field must be an array or string"
        };
      }
      
      return { valid: true };
    }

    // For generic text responses (debugging, etc.)
    if (data.response || data.message || data.result) {
      return { valid: true };
    }

    // If we can't identify the structure, but it's a valid object, allow it
    return { valid: true };
  }

  /**
   * Handle malformed CLI responses with recovery strategies using structured error handling
   */
  private handleMalformedCLIResponse(rawOutput: string, originalError: string): { success: boolean; data?: any; error?: string; cliError?: CLIError } {
    console.warn("Attempting to recover from malformed CLI response:", originalError);
    
    // Strategy 1: Try to extract any readable text content
    const textContent = this.extractTextFromMalformedResponse(rawOutput);
    if (textContent && textContent.length > 10) {
      console.log("Recovered text content from malformed response");
      return {
        success: true,
        data: {
          content: textContent,
          recovered: true,
          original_error: originalError
        }
      };
    }

    // Strategy 2: Check if it's a simple error message
    const errorMatch = rawOutput.match(/error[:\s]+(.*)/i);
    if (errorMatch) {
      const cliError = createCLIError(
        CLI_ERROR_CODES.EXEC_COMMAND_FAILED,
        rawOutput,
        `CLI error: ${errorMatch[1].trim()}`
      );
      const errorInfo = formatErrorForUser(cliError);
      return {
        success: false,
        error: errorInfo.message,
        cliError
      };
    }

    // Strategy 3: Check for authentication issues
    if (rawOutput.toLowerCase().includes('auth') || rawOutput.toLowerCase().includes('login')) {
      const cliError = createCLIError(
        CLI_ERROR_CODES.AUTH_NOT_AUTHENTICATED,
        rawOutput,
        "CLI authentication required. Please run 'gemini auth login' first."
      );
      const errorInfo = formatErrorForUser(cliError);
      return {
        success: false,
        error: errorInfo.message,
        cliError
      };
    }

    // Strategy 4: Check for installation issues
    if (rawOutput.toLowerCase().includes('command not found') || rawOutput.toLowerCase().includes('not recognized')) {
      const cliError = createCLIError(
        CLI_ERROR_CODES.CLI_NOT_FOUND,
        rawOutput,
        "Gemini CLI not found. Please install the Gemini CLI tool first."
      );
      const errorInfo = formatErrorForUser(cliError);
      return {
        success: false,
        error: errorInfo.message,
        cliError
      };
    }

    // If all recovery strategies fail, return structured unknown error
    const cliError = createCLIError(
      CLI_ERROR_CODES.RESPONSE_MALFORMED,
      rawOutput,
      `Failed to parse CLI response: ${originalError}. Raw output: ${rawOutput.substring(0, 200)}...`
    );
    const errorInfo = formatErrorForUser(cliError);
    
    return {
      success: false,
      error: errorInfo.message,
      cliError
    };
  }

  /**
   * Extract readable text content from malformed responses
   */
  private extractTextFromMalformedResponse(output: string): string | null {
    // Remove ANSI codes and control characters
    let cleaned = output.replace(/\x1b\[[0-9;]*m/g, '').trim();
    
    // Remove common CLI prefixes and formatting
    cleaned = cleaned.replace(/^(>|\$|#|\*|\-|\+)\s*/gm, '');
    
    // Remove empty lines and excessive whitespace
    cleaned = cleaned.replace(/\n\s*\n/g, '\n').trim();
    
    // If the cleaned content is substantial, return it
    if (cleaned.length > 10 && !cleaned.match(/^[\s\n\r]*$/)) {
      return cleaned;
    }
    
    return null;
  }

  // CLI Command Templates for different operations
  private readonly CLI_COMMAND_TEMPLATES = {
    EXTRACTION: {
      command: "gemini",
      baseArgs: ["generate", "--model", "{model}", "--temperature", "0.2"],
      systemPrompt: "You are a coding challenge interpreter. Analyze the screenshot of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text.",
      userPromptTemplate: "Extract the coding problem details from these screenshots. Return in JSON format. Preferred coding language we gonna use for this problem is {language}."
    },
    SOLUTION: {
      command: "gemini", 
      baseArgs: ["generate", "--model", "{model}", "--temperature", "0.2"],
      systemPrompt: "You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations.",
      userPromptTemplate: `Generate a detailed solution for the following coding problem:

PROBLEM STATEMENT:
{problem_statement}

CONSTRAINTS:
{constraints}

EXAMPLE INPUT:
{example_input}

EXAMPLE OUTPUT:
{example_output}

LANGUAGE: {language}

I need the response in the following format:
1. Code: A clean, optimized implementation in {language}
2. Your Thoughts: A list of key insights and reasoning behind your approach
3. Time complexity: O(X) with a detailed explanation (at least 2 sentences)
4. Space complexity: O(X) with a detailed explanation (at least 2 sentences)

For complexity explanations, please be thorough. For example: "Time complexity: O(n) because we iterate through the array only once. This is optimal as we need to examine each element at least once to find the solution." or "Space complexity: O(n) because in the worst case, we store all elements in the hashmap. The additional space scales linearly with the input size."

Your solution should be efficient, well-commented, and handle edge cases.`
    },
    DEBUG: {
      command: "gemini",
      baseArgs: ["generate", "--model", "{model}", "--temperature", "0.2"],
      systemPrompt: `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).`,
      userPromptTemplate: `I'm solving this coding problem: "{problem_statement}" in {language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. What issues you found in my code
2. Specific improvements and corrections
3. Any optimizations that would make the solution better
4. A clear explanation of the changes needed`
    }
  };

  /**
   * Format CLI command for different AI operations
   */
  private formatCLICommand(
    operationType: 'EXTRACTION' | 'SOLUTION' | 'DEBUG',
    model: string,
    variables: Record<string, string> = {},
    imageDataList?: string[]
  ): GeminiCLICommand {
    const template = this.CLI_COMMAND_TEMPLATES[operationType];
    const config = configHelper.loadConfig();
    
    // Replace model placeholder in args
    const args = template.baseArgs.map(arg => 
      arg.replace('{model}', model)
    );
    
    // Format user prompt with variables
    let userPrompt = template.userPromptTemplate;
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      userPrompt = userPrompt.replace(new RegExp(placeholder, 'g'), value || 'Not provided');
    });
    
    // Create the full prompt
    const fullPrompt = this.formatCLIPrompt(
      template.systemPrompt,
      userPrompt,
      imageDataList
    );
    
    return {
      command: template.command,
      args: args,
      input: fullPrompt,
      timeout: config.cliTimeout || 30000
    };
  }

  /**
   * Format prompt for CLI input with image data handling
   */
  private formatCLIPrompt(systemPrompt: string, userPrompt: string, imageDataList?: string[]): string {
    let prompt = `${systemPrompt}\n\n${userPrompt}`;
    
    // Handle image data for CLI input
    if (imageDataList && imageDataList.length > 0) {
      prompt += `\n\n[IMAGE DATA]`;
      prompt += `\nNumber of images: ${imageDataList.length}`;
      
      // Add image data in a format that CLI can potentially process
      // Note: This depends on CLI capabilities - some CLIs might support base64 input
      imageDataList.forEach((imageData, index) => {
        prompt += `\n\nImage ${index + 1}:`;
        prompt += `\ndata:image/png;base64,${imageData.substring(0, 100)}...`;
        prompt += `\n[Full image data available for processing]`;
      });
      
      prompt += `\n\n[END IMAGE DATA]`;
      prompt += `\n\nPlease analyze the provided images along with the text prompt above.`;
    }
    
    return prompt;
  }

  /**
   * Format CLI prompt for problem extraction
   */
  private formatExtractionCLIPrompt(language: string, imageDataList: string[]): GeminiCLICommand {
    const config = configHelper.loadConfig();
    return this.formatCLICommand('EXTRACTION', config.extractionModel || "gemini-2.0-flash", {
      language: language
    }, imageDataList);
  }

  /**
   * Format CLI prompt for solution generation
   */
  private formatSolutionCLIPrompt(
    problemInfo: any,
    language: string
  ): GeminiCLICommand {
    const config = configHelper.loadConfig();
    return this.formatCLICommand('SOLUTION', config.solutionModel || "gemini-2.0-flash", {
      problem_statement: problemInfo.problem_statement || 'No problem statement provided',
      constraints: problemInfo.constraints || 'No specific constraints provided.',
      example_input: problemInfo.example_input || 'No example input provided.',
      example_output: problemInfo.example_output || 'No example output provided.',
      language: language
    });
  }

  /**
   * Format CLI prompt for debugging assistance
   */
  private formatDebugCLIPrompt(
    problemInfo: any,
    language: string,
    imageDataList: string[]
  ): GeminiCLICommand {
    const config = configHelper.loadConfig();
    return this.formatCLICommand('DEBUG', config.debuggingModel || "gemini-2.0-flash", {
      problem_statement: problemInfo.problem_statement || 'No problem statement provided',
      language: language
    }, imageDataList);
  }

  /**
   * Validate CLI prompt formatting
   */
  private validateCLIPrompt(prompt: string): { valid: boolean; error?: string } {
    if (!prompt || prompt.trim().length === 0) {
      return {
        valid: false,
        error: "Prompt cannot be empty"
      };
    }
    
    // Check for minimum prompt length
    if (prompt.length < 10) {
      return {
        valid: false,
        error: "Prompt too short - must be at least 10 characters"
      };
    }
    
    // Check for maximum prompt length (CLI might have limits)
    const maxLength = 50000; // Reasonable limit for CLI input
    if (prompt.length > maxLength) {
      return {
        valid: false,
        error: `Prompt too long - maximum ${maxLength} characters allowed`
      };
    }
    
    // Check for potentially problematic characters that might break CLI
    const problematicChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
    if (problematicChars.test(prompt)) {
      return {
        valid: false,
        error: "Prompt contains invalid control characters"
      };
    }
    
    return { valid: true };
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getCredits(): Promise<number> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return 999 // Unlimited credits in this version

    try {
      await this.waitForInitialization(mainWindow)
      return 999 // Always return sufficient credits to work
    } catch (error) {
      console.error("Error getting credits:", error)
      return 999 // Unlimited credits as fallback
    }
  }

  private async getLanguage(): Promise<string> {
    try {
      // Get language from config
      const config = configHelper.loadConfig();
      if (config.language) {
        return config.language;
      }
      
      // Fallback to window variable if config doesn't have language
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        try {
          await this.waitForInitialization(mainWindow)
          const language = await mainWindow.webContents.executeJavaScript(
            "window.__LANGUAGE__"
          )

          if (
            typeof language === "string" &&
            language !== undefined &&
            language !== null
          ) {
            return language;
          }
        } catch (err) {
          console.warn("Could not get language from window", err);
        }
      }
      
      // Default fallback
      return "python";
    } catch (error) {
      console.error("Error getting language:", error)
      return "python"
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    const config = configHelper.loadConfig();
    
    // First verify we have a valid AI client
    if (config.apiProvider === "openai" && !this.openaiClient) {
      await this.initializeAIClient();
      
      if (!this.openaiClient) {
        console.error("OpenAI client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "gemini" && !this.geminiApiKey) {
      await this.initializeAIClient();
      
      if (!this.geminiApiKey) {
        console.error("Gemini API key not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "anthropic" && !this.anthropicClient) {
      // Add check for Anthropic client
      await this.initializeAIClient();
      
      if (!this.anthropicClient) {
        console.error("Anthropic client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "gemini-cli") {
      // Check CLI provider readiness
      if (!this.isCLIProviderReady()) {
        // Try to re-initialize CLI client
        await this.initializeCLIClient();
        
        if (!this.isCLIProviderReady()) {
          console.error("Gemini CLI provider not ready:", this.cliClientState.error);
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.API_KEY_INVALID
          );
          return;
        }
      }
    }

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots:", screenshotQueue)
      
      // Check if the queue is empty
      if (!screenshotQueue || screenshotQueue.length === 0) {
        console.log("No screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      // Check that files actually exist
      const existingScreenshots = screenshotQueue.filter(path => fs.existsSync(path));
      if (existingScreenshots.length === 0) {
        console.log("Screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const screenshots = await Promise.all(
          existingScreenshots.map(async (path) => {
            try {
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )

        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data");
        }

        const result = await this.processScreenshotsHelper(validScreenshots, signal)

        if (!result.success) {
          console.log("Processing failed:", result.error)
          if (result.error?.includes("API Key") || result.error?.includes("OpenAI") || result.error?.includes("Gemini")) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.API_KEY_INVALID
            )
          } else {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              result.error
            )
          }
          // Reset view back to queue on error
          console.log("Resetting view to queue due to error")
          this.deps.setView("queue")
          return
        }

        // Only set view to solutions if processing succeeded
        console.log("Setting view to solutions after successful processing")
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
        this.deps.setView("solutions")
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error
        )
        console.error("Processing error:", error)
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          )
        }
        // Reset view back to queue on error
        console.log("Resetting view to queue due to error")
        this.deps.setView("queue")
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      // view == 'solutions'
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)
      
      // Check if the extra queue is empty
      if (!extraScreenshotQueue || extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        
        return;
      }

      // Check that files actually exist
      const existingExtraScreenshots = extraScreenshotQueue.filter(path => fs.existsSync(path));
      if (existingExtraScreenshots.length === 0) {
        console.log("Extra screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }
      
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        // Get all screenshots (both main and extra) for processing
        const allPaths = [
          ...this.screenshotHelper.getScreenshotQueue(),
          ...existingExtraScreenshots
        ];
        
        const screenshots = await Promise.all(
          allPaths.map(async (path) => {
            try {
              if (!fs.existsSync(path)) {
                console.warn(`Screenshot file does not exist: ${path}`);
                return null;
              }
              
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )
        
        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data for debugging");
        }
        
        console.log(
          "Combined screenshots for processing:",
          validScreenshots.map((s) => s.path)
        )

        const result = await this.processExtraScreenshotsHelper(
          validScreenshots,
          signal
        )

        if (result.success) {
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const config = configHelper.loadConfig();
      const language = await this.getLanguage();
      const mainWindow = this.deps.getMainWindow();
      
      // Step 1: Extract problem info using AI Vision API (OpenAI or Gemini)
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      
      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Analyzing problem from screenshots...",
          progress: 20
        });
      }

      let problemInfo;
      
      if (config.apiProvider === "openai") {
        // Verify OpenAI client
        if (!this.openaiClient) {
          this.initializeAIClient(); // Try to reinitialize
          
          if (!this.openaiClient) {
            return {
              success: false,
              error: "OpenAI API key not configured or invalid. Please check your settings."
            };
          }
        }

        // Use OpenAI for processing
        const messages = [
          {
            role: "system" as const, 
            content: "You are a coding challenge interpreter. Analyze the screenshot of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text."
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const, 
                text: `Extract the coding problem details from these screenshots. Return in JSON format. Preferred coding language we gonna use for this problem is ${language}.`
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        // Send to OpenAI Vision API
        const extractionResponse = await this.openaiClient.chat.completions.create({
          model: config.extractionModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2
        });

        // Parse the response
        try {
          const responseText = extractionResponse.choices[0].message.content;
          // Handle when OpenAI might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error) {
          console.error("Error parsing OpenAI response:", error);
          return {
            success: false,
            error: "Failed to parse problem information. Please try again or use clearer screenshots."
          };
        }
      } else if (config.apiProvider === "gemini")  {
        // Use Gemini API
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }

        try {
          // Create Gemini message structure
          const geminiMessages: GeminiMessage[] = [
            {
              role: "user",
              parts: [
                {
                  text: `You are a coding challenge interpreter. Analyze the screenshots of the coding problem and extract all relevant information. Return the information in JSON format with these fields: problem_statement, constraints, example_input, example_output. Just return the structured JSON without any other text. Preferred coding language we gonna use for this problem is ${language}.`
                },
                ...imageDataList.map(data => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data
                  }
                }))
              ]
            }
          ];

          // Make API request to Gemini
          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.extractionModel || "gemini-2.0-flash"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000
              }
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error("Empty response from Gemini API");
          }
          
          const responseText = responseData.candidates[0].content.parts[0].text;
          
          // Handle when Gemini might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error) {
          console.error("Error using Gemini API:", error);
          return {
            success: false,
            error: "Failed to process with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "gemini-cli") {
        // Use Gemini CLI for processing
        try {
          const cliCommand = this.formatExtractionCLIPrompt(language, imageDataList);

          const cliResult = await this.executeGeminiCLIWithRetry(cliCommand, signal);
          
          if (!cliResult.success) {
            throw new Error(cliResult.error || "CLI command failed");
          }

          // Parse the CLI response
          const parseResult = this.parseCLIResponse(cliResult.output || "");
          
          if (!parseResult.success) {
            // Try to recover from malformed response
            const recoveryResult = this.handleMalformedCLIResponse(cliResult.output || "", parseResult.error || "Unknown parsing error");
            
            if (!recoveryResult.success) {
              throw new Error(recoveryResult.error || "Failed to parse CLI response");
            }
            
            // Use recovered data if available
            problemInfo = recoveryResult.data?.content ? {
              problem_statement: recoveryResult.data.content,
              constraints: "No specific constraints provided.",
              example_input: "No example input provided.",
              example_output: "No example output provided."
            } : recoveryResult.data;
          } else {
            problemInfo = parseResult.data;
          }
        } catch (error: any) {
          console.error("Error using Gemini CLI:", error);
          // Graceful degradation: provide helpful guidance based on CLI state
          const cliState = this.getCLIClientState();
          const degradationMessage = this.generateGracefulDegradationMessage(cliState, 'extraction');
          
          return {
            success: false,
            error: degradationMessage
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }

        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `Extract the coding problem details from these screenshots. Return in JSON format with these fields: problem_statement, constraints, example_input, example_output. Preferred coding language is ${language}.`
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: data
                  }
                }))
              ]
            }
          ];

          const response = await this.anthropicClient.messages.create({
            model: config.extractionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });

          const responseText = (response.content[0] as { type: 'text', text: string }).text;
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error: any) {
          console.error("Error using Anthropic API:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }

          return {
            success: false,
            error: "Failed to process with Anthropic API. Please check your API key or try again later."
          };
        }
      }
      
      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Problem analyzed successfully. Preparing to generate solution...",
          progress: 40
        });
      }

      // Store problem info in AppState
      this.deps.setProblemInfo(problemInfo);

      // Send first success event
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        );

        // Generate solutions after successful extraction
        const solutionsResult = await this.generateSolutionsHelper(signal);
        if (solutionsResult.success) {
          // Clear any existing extra screenshots before transitioning to solutions view
          this.screenshotHelper.clearExtraScreenshotQueue();
          
          // Final progress update
          mainWindow.webContents.send("processing-status", {
            message: "Solution generated successfully",
            progress: 100
          });
          
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          );
          return { success: true, data: solutionsResult.data };
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          );
        }
      }

      return { success: false, error: "Failed to process screenshots" };
    } catch (error: any) {
      // If the request was cancelled, don't retry
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      // Handle OpenAI API errors specifically
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
        };
      } else if (error?.response?.status === 500) {
        return {
          success: false,
          error: "OpenAI server error. Please try again later."
        };
      }

      console.error("API Error Details:", error);
      return { 
        success: false, 
        error: error.message || "Failed to process screenshots. Please try again." 
      };
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Creating optimal solution with detailed explanations...",
          progress: 60
        });
      }

      // Create prompt for solution generation
      const promptText = `
Generate a detailed solution for the following coding problem:

PROBLEM STATEMENT:
${problemInfo.problem_statement}

CONSTRAINTS:
${problemInfo.constraints || "No specific constraints provided."}

EXAMPLE INPUT:
${problemInfo.example_input || "No example input provided."}

EXAMPLE OUTPUT:
${problemInfo.example_output || "No example output provided."}

LANGUAGE: ${language}

I need the response in the following format:
1. Code: A clean, optimized implementation in ${language}
2. Your Thoughts: A list of key insights and reasoning behind your approach
3. Time complexity: O(X) with a detailed explanation (at least 2 sentences)
4. Space complexity: O(X) with a detailed explanation (at least 2 sentences)

For complexity explanations, please be thorough. For example: "Time complexity: O(n) because we iterate through the array only once. This is optimal as we need to examine each element at least once to find the solution." or "Space complexity: O(n) because in the worst case, we store all elements in the hashmap. The additional space scales linearly with the input size."

Your solution should be efficient, well-commented, and handle edge cases.
`;

      let responseContent;
      
      if (config.apiProvider === "openai") {
        // OpenAI processing
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        // Send to OpenAI API
        const solutionResponse = await this.openaiClient.chat.completions.create({
          model: config.solutionModel || "gpt-4o",
          messages: [
            { role: "system", content: "You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations." },
            { role: "user", content: promptText }
          ],
          max_tokens: 4000,
          temperature: 0.2
        });

        responseContent = solutionResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini")  {
        // Gemini processing
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }
        
        try {
          // Create Gemini message structure
          const geminiMessages = [
            {
              role: "user",
              parts: [
                {
                  text: `You are an expert coding interview assistant. Provide a clear, optimal solution with detailed explanations for this problem:\n\n${promptText}`
                }
              ]
            }
          ];

          // Make API request to Gemini
          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.solutionModel || "gemini-2.0-flash"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000
              }
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error("Empty response from Gemini API");
          }
          
          responseContent = responseData.candidates[0].content.parts[0].text;
        } catch (error) {
          console.error("Error using Gemini API for solution:", error);
          return {
            success: false,
            error: "Failed to generate solution with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        // Anthropic processing
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `You are an expert coding interview assistant. Provide a clear, optimal solution with detailed explanations for this problem:\n\n${promptText}`
                }
              ]
            }
          ];

          // Send to Anthropic API
          const response = await this.anthropicClient.messages.create({
            model: config.solutionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });

          responseContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for solution:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }

          return {
            success: false,
            error: "Failed to generate solution with Anthropic API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "gemini-cli") {
        // Gemini CLI processing
        try {
          const cliCommand = this.formatSolutionCLIPrompt(problemInfo, language);

          const cliResult = await this.executeGeminiCLIWithRetry(cliCommand, signal);
          
          if (!cliResult.success) {
            throw new Error(cliResult.error || "CLI command failed");
          }

          // Parse the CLI response
          const parseResult = this.parseCLIResponse(cliResult.output || "");
          
          if (!parseResult.success) {
            // Try to recover from malformed response
            const recoveryResult = this.handleMalformedCLIResponse(cliResult.output || "", parseResult.error || "Unknown parsing error");
            
            if (!recoveryResult.success) {
              throw new Error(recoveryResult.error || "Failed to parse CLI response");
            }
            
            // Use recovered content as response
            responseContent = recoveryResult.data?.content || cliResult.output || "";
          } else {
            // Handle different response formats
            if (typeof parseResult.data === 'string') {
              responseContent = parseResult.data;
            } else if (parseResult.data?.content) {
              responseContent = parseResult.data.content;
            } else if (parseResult.data?.text) {
              responseContent = parseResult.data.text;
            } else {
              responseContent = JSON.stringify(parseResult.data);
            }
          }
        } catch (error: any) {
          console.error("Error using Gemini CLI for solution:", error);
          // Graceful degradation: provide helpful guidance based on CLI state
          const cliState = this.getCLIClientState();
          const degradationMessage = this.generateGracefulDegradationMessage(cliState, 'solution');
          
          return {
            success: false,
            error: degradationMessage
          };
        }
      }
      
      // Extract parts from the response
      const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[1].trim() : responseContent;
      
      // Extract thoughts, looking for bullet points or numbered lists
      const thoughtsRegex = /(?:Thoughts:|Key Insights:|Reasoning:|Approach:)([\s\S]*?)(?:Time complexity:|$)/i;
      const thoughtsMatch = responseContent.match(thoughtsRegex);
      let thoughts: string[] = [];
      
      if (thoughtsMatch && thoughtsMatch[1]) {
        // Extract bullet points or numbered items
        const bulletPoints = thoughtsMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
        if (bulletPoints) {
          thoughts = bulletPoints.map(point => 
            point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()
          ).filter(Boolean);
        } else {
          // If no bullet points found, split by newlines and filter empty lines
          thoughts = thoughtsMatch[1].split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        }
      }
      
      // Extract complexity information
      const timeComplexityPattern = /Time complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:Space complexity|$))/i;
      const spaceComplexityPattern = /Space complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:[A-Z]|$))/i;
      
      let timeComplexity = "O(n) - Linear time complexity because we only iterate through the array once. Each element is processed exactly one time, and the hashmap lookups are O(1) operations.";
      let spaceComplexity = "O(n) - Linear space complexity because we store elements in the hashmap. In the worst case, we might need to store all elements before finding the solution pair.";
      
      const timeMatch = responseContent.match(timeComplexityPattern);
      if (timeMatch && timeMatch[1]) {
        timeComplexity = timeMatch[1].trim();
        if (!timeComplexity.match(/O\([^)]+\)/i)) {
          timeComplexity = `O(n) - ${timeComplexity}`;
        } else if (!timeComplexity.includes('-') && !timeComplexity.includes('because')) {
          const notationMatch = timeComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = timeComplexity.replace(notation, '').trim();
            timeComplexity = `${notation} - ${rest}`;
          }
        }
      }
      
      const spaceMatch = responseContent.match(spaceComplexityPattern);
      if (spaceMatch && spaceMatch[1]) {
        spaceComplexity = spaceMatch[1].trim();
        if (!spaceComplexity.match(/O\([^)]+\)/i)) {
          spaceComplexity = `O(n) - ${spaceComplexity}`;
        } else if (!spaceComplexity.includes('-') && !spaceComplexity.includes('because')) {
          const notationMatch = spaceComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = spaceComplexity.replace(notation, '').trim();
            spaceComplexity = `${notation} - ${rest}`;
          }
        }
      }

      const formattedResponse = {
        code: code,
        thoughts: thoughts.length > 0 ? thoughts : ["Solution approach based on efficiency and readability"],
        time_complexity: timeComplexity,
        space_complexity: spaceComplexity
      };

      return { success: true, data: formattedResponse };
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
        };
      }
      
      console.error("Solution generation error:", error);
      return { success: false, error: error.message || "Failed to generate solution" };
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Processing debug screenshots...",
          progress: 30
        });
      }

      // Prepare the images for the API call
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      
      let debugContent;
      
      if (config.apiProvider === "openai") {
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        const messages = [
          {
            role: "system" as const, 
            content: `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).`
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const, 
                text: `I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. What issues you found in my code
2. Specific improvements and corrections
3. Any optimizations that would make the solution better
4. A clear explanation of the changes needed` 
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Analyzing code and generating debug feedback...",
            progress: 60
          });
        }

        const debugResponse = await this.openaiClient.chat.completions.create({
          model: config.debuggingModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2
        });
        
        debugContent = debugResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini")  {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }
        
        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).
`;

          const geminiMessages = [
            {
              role: "user",
              parts: [
                { text: debugPrompt },
                ...imageDataList.map(data => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data
                  }
                }))
              ]
            }
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Gemini...",
              progress: 60
            });
          }

          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.debuggingModel || "gemini-2.0-flash"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000
              }
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error("Empty response from Gemini API");
          }
          
          debugContent = responseData.candidates[0].content.parts[0].text;
        } catch (error) {
          console.error("Error using Gemini API for debugging:", error);
          return {
            success: false,
            error: "Failed to process debug request with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification.
`;

          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: debugPrompt
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const, 
                    data: data
                  }
                }))
              ]
            }
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Claude...",
              progress: 60
            });
          }

          const response = await this.anthropicClient.messages.create({
            model: config.debuggingModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });
          
          debugContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for debugging:", error);
          
          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }
          
          return {
            success: false,
            error: "Failed to process debug request with Anthropic API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "gemini-cli") {
        // Gemini CLI processing for debugging
        try {
          const cliCommand = this.formatDebugCLIPrompt(problemInfo, language, imageDataList);

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Gemini CLI...",
              progress: 60
            });
          }

          const cliResult = await this.executeGeminiCLIWithRetry(cliCommand, signal);
          
          if (!cliResult.success) {
            throw new Error(cliResult.error || "CLI command failed");
          }

          // Parse the CLI response
          const parseResult = this.parseCLIResponse(cliResult.output || "");
          
          if (!parseResult.success) {
            // Try to recover from malformed response
            const recoveryResult = this.handleMalformedCLIResponse(cliResult.output || "", parseResult.error || "Unknown parsing error");
            
            if (!recoveryResult.success) {
              throw new Error(recoveryResult.error || "Failed to parse CLI response");
            }
            
            // Use recovered content as response
            debugContent = recoveryResult.data?.content || cliResult.output || "";
          } else {
            // Handle different response formats
            if (typeof parseResult.data === 'string') {
              debugContent = parseResult.data;
            } else if (parseResult.data?.content) {
              debugContent = parseResult.data.content;
            } else if (parseResult.data?.text) {
              debugContent = parseResult.data.text;
            } else {
              debugContent = JSON.stringify(parseResult.data);
            }
          }
        } catch (error: any) {
          console.error("Error using Gemini CLI for debugging:", error);
          // Graceful degradation: provide helpful guidance based on CLI state
          const cliState = this.getCLIClientState();
          const degradationMessage = this.generateGracefulDegradationMessage(cliState, 'debugging');
          
          return {
            success: false,
            error: degradationMessage
          };
        }
      }
      
      
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Debug analysis complete",
          progress: 100
        });
      }

      let extractedCode = "// Debug mode - see analysis below";
      const codeMatch = debugContent.match(/```(?:[a-zA-Z]+)?([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        extractedCode = codeMatch[1].trim();
      }

      let formattedDebugContent = debugContent;
      
      if (!debugContent.includes('# ') && !debugContent.includes('## ')) {
        formattedDebugContent = debugContent
          .replace(/issues identified|problems found|bugs found/i, '## Issues Identified')
          .replace(/code improvements|improvements|suggested changes/i, '## Code Improvements')
          .replace(/optimizations|performance improvements/i, '## Optimizations')
          .replace(/explanation|detailed analysis/i, '## Explanation');
      }

      const bulletPoints = formattedDebugContent.match(/(?:^|\n)[ ]*(?:[-*•]|\d+\.)[ ]+([^\n]+)/g);
      const thoughts = bulletPoints 
        ? bulletPoints.map(point => point.replace(/^[ ]*(?:[-*•]|\d+\.)[ ]+/, '').trim()).slice(0, 5)
        : ["Debug analysis based on your screenshots"];
      
      const response = {
        code: extractedCode,
        debug_analysis: formattedDebugContent,
        thoughts: thoughts,
        time_complexity: "N/A - Debug mode",
        space_complexity: "N/A - Debug mode"
      };

      return { success: true, data: response };
    } catch (error: any) {
      console.error("Debug processing error:", error);
      return { success: false, error: error.message || "Failed to process debug request" };
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    this.deps.setHasDebugged(false)

    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }
}
