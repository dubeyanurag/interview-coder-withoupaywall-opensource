// ConfigHelper.ts
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import { OpenAI } from "openai"
import {
  APIProvider,
  Config,
  ConfigUpdate,
  CLIError,
  CLI_ERROR_CODES,
  createCLIError,
  categorizeCLIError,
  formatErrorForUser
} from "./CLITypes"

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    apiKey: "",
    apiProvider: "gemini", // Default to Gemini
    extractionModel: "gemini-2.0-flash", // Default to Flash for faster responses
    solutionModel: "gemini-2.0-flash",
    debuggingModel: "gemini-2.0-flash",
    language: "python",
    opacity: 1.0,
    // CLI-specific default settings
    cliTimeout: 30000, // 30 seconds default timeout for CLI commands
    cliMaxRetries: 3, // Default retry attempts for CLI failures
    cliRetryDelay: 1000, // 1 second base retry delay
    cliEnableLogging: false, // Disable detailed CLI logging by default
    cliLogLevel: 'error' // Default to error-level logging only
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
      console.log('Config path:', this.configPath);
    } catch (err) {
      console.warn('Could not access user data path, using fallback');
      this.configPath = path.join(process.cwd(), 'config.json');
    }

    // Ensure the initial config file exists
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  /**
   * Validate and sanitize model selection to ensure only allowed models are used
   */
  private sanitizeModelSelection(model: string, provider: APIProvider): string {
    if (provider === "openai") {
      // Only allow gpt-4o and gpt-4o-mini for OpenAI
      const allowedModels = ['gpt-4o', 'gpt-4o-mini'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid OpenAI model specified: ${model}. Using default model: gpt-4o`);
        return 'gpt-4o';
      }
      return model;
    } else if (provider === "gemini") {
      // Only allow gemini-1.5-pro and gemini-2.0-flash for Gemini
      const allowedModels = ['gemini-1.5-pro', 'gemini-2.0-flash'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Gemini model specified: ${model}. Using default model: gemini-2.0-flash`);
        return 'gemini-2.0-flash'; // Changed default to flash
      }
      return model;
    } else if (provider === "anthropic") {
      // Only allow Claude models
      const allowedModels = ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Anthropic model specified: ${model}. Using default model: claude-3-7-sonnet-20250219`);
        return 'claude-3-7-sonnet-20250219';
      }
      return model;
    } else if (provider === "gemini-cli") {
      // For CLI, validate against available models if possible
      return this.sanitizeCLIModelSelection(model);
    }
    // Default fallback
    return model;
  }

  /**
   * Sanitize CLI model selection with dynamic validation
   */
  private sanitizeCLIModelSelection(model: string): string {
    // Default fallback models for CLI
    const fallbackModels = ['gemini-2.0-flash', 'gemini-1.5-pro'];

    // If no model specified, use default
    if (!model) {
      return 'gemini-2.0-flash';
    }

    // Basic validation - ensure it's a Gemini model
    if (!model.startsWith('gemini-')) {
      console.warn(`Invalid CLI model specified: ${model}. Using default model: gemini-2.0-flash`);
      return 'gemini-2.0-flash';
    }

    // If it's in our fallback list, it's definitely valid
    if (fallbackModels.includes(model)) {
      return model;
    }

    // For other Gemini models, allow them but log a warning
    // The actual validation will happen at runtime when CLI models are fetched
    console.log(`CLI model ${model} will be validated against available models at runtime`);
    return model;
  }

  public loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(configData);

        // Ensure apiProvider is a valid value
        if (config.apiProvider !== "openai" && config.apiProvider !== "gemini" && config.apiProvider !== "anthropic" && config.apiProvider !== "gemini-cli") {
          config.apiProvider = "gemini"; // Default to Gemini if invalid
        }

        // Sanitize model selections to ensure only allowed models are used
        if (config.extractionModel) {
          config.extractionModel = this.sanitizeModelSelection(config.extractionModel, config.apiProvider);
        }
        if (config.solutionModel) {
          config.solutionModel = this.sanitizeModelSelection(config.solutionModel, config.apiProvider);
        }
        if (config.debuggingModel) {
          config.debuggingModel = this.sanitizeModelSelection(config.debuggingModel, config.apiProvider);
        }

        // Merge with defaults to ensure all CLI settings are present
        const mergedConfig = {
          ...this.defaultConfig,
          ...config
        };

        // Ensure CLI settings have valid values
        if (mergedConfig.cliTimeout === undefined) {
          mergedConfig.cliTimeout = this.defaultConfig.cliTimeout;
        }
        if (mergedConfig.cliMaxRetries === undefined) {
          mergedConfig.cliMaxRetries = this.defaultConfig.cliMaxRetries;
        }
        if (mergedConfig.cliRetryDelay === undefined) {
          mergedConfig.cliRetryDelay = this.defaultConfig.cliRetryDelay;
        }
        if (mergedConfig.cliEnableLogging === undefined) {
          mergedConfig.cliEnableLogging = this.defaultConfig.cliEnableLogging;
        }
        if (mergedConfig.cliLogLevel === undefined) {
          mergedConfig.cliLogLevel = this.defaultConfig.cliLogLevel;
        }

        return mergedConfig;
      }

      // If no config exists, create a default one
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to disk
   */
  public saveConfig(config: Config): void {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      // Write the config file
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  /**
   * Update specific configuration values
   */
  public updateConfig(updates: ConfigUpdate): Config {
    try {
      const currentConfig = this.loadConfig();
      let provider = updates.apiProvider || currentConfig.apiProvider;

      // Auto-detect provider based on API key format if a new key is provided
      if (updates.apiKey && !updates.apiProvider) {
        // If API key starts with "sk-", it's likely an OpenAI key
        if (updates.apiKey.trim().startsWith('sk-')) {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format");
        } else if (updates.apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format");
        } else {
          provider = "gemini";
          console.log("Using Gemini API key format (default)");
        }

        // Update the provider in the updates object
        updates.apiProvider = provider;
      }

      // If provider is changing, reset models to the default for that provider
      if (updates.apiProvider && updates.apiProvider !== currentConfig.apiProvider) {
        if (updates.apiProvider === "openai") {
          updates.extractionModel = "gpt-4o";
          updates.solutionModel = "gpt-4o";
          updates.debuggingModel = "gpt-4o";
        } else if (updates.apiProvider === "anthropic") {
          updates.extractionModel = "claude-3-7-sonnet-20250219";
          updates.solutionModel = "claude-3-7-sonnet-20250219";
          updates.debuggingModel = "claude-3-7-sonnet-20250219";
        } else if (updates.apiProvider === "gemini-cli") {
          updates.extractionModel = "gemini-2.0-flash";
          updates.solutionModel = "gemini-2.0-flash";
          updates.debuggingModel = "gemini-2.0-flash";
        } else {
          updates.extractionModel = "gemini-2.0-flash";
          updates.solutionModel = "gemini-2.0-flash";
          updates.debuggingModel = "gemini-2.0-flash";
        }
      }

      // Sanitize model selections in the updates
      if (updates.extractionModel) {
        updates.extractionModel = this.sanitizeModelSelection(updates.extractionModel, provider);
      }
      if (updates.solutionModel) {
        updates.solutionModel = this.sanitizeModelSelection(updates.solutionModel, provider);
      }
      if (updates.debuggingModel) {
        updates.debuggingModel = this.sanitizeModelSelection(updates.debuggingModel, provider);
      }

      // Validate and sanitize CLI configuration if CLI-specific settings are being updated
      if (updates.cliTimeout !== undefined || updates.cliMaxRetries !== undefined ||
        updates.cliRetryDelay !== undefined || updates.cliEnableLogging !== undefined ||
        updates.cliLogLevel !== undefined) {
        const cliValidation = this.validateCLIConfig(updates);
        if (!cliValidation.valid) {
          console.warn('CLI configuration validation warnings:', cliValidation.errors);
          // Use sanitized values
          Object.assign(updates, cliValidation.sanitized);
        }
      }

      const newConfig = { ...currentConfig, ...updates };
      this.saveConfig(newConfig);

      // Only emit update event for changes other than opacity
      // This prevents re-initializing the AI client when only opacity changes
      if (updates.apiKey !== undefined || updates.apiProvider !== undefined ||
        updates.extractionModel !== undefined || updates.solutionModel !== undefined ||
        updates.debuggingModel !== undefined || updates.language !== undefined ||
        updates.cliTimeout !== undefined || updates.cliMaxRetries !== undefined ||
        updates.cliRetryDelay !== undefined || updates.cliEnableLogging !== undefined ||
        updates.cliLogLevel !== undefined) {
        this.emit('config-updated', newConfig);
      }

      return newConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Check if the API key is configured
   */
  public hasApiKey(): boolean {
    const config = this.loadConfig();
    return !!config.apiKey && config.apiKey.trim().length > 0;
  }

  /**
   * Validate the API key format
   */
  public isValidApiKeyFormat(apiKey: string, provider?: APIProvider): boolean {
    // If provider is not specified, attempt to auto-detect
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
        } else {
          provider = "openai";
        }
      } else {
        provider = "gemini";
      }
    }

    if (provider === "openai") {
      // Basic format validation for OpenAI API keys
      return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "gemini") {
      // Basic format validation for Gemini API keys (usually alphanumeric with no specific prefix)
      return apiKey.trim().length >= 10; // Assuming Gemini keys are at least 10 chars
    } else if (provider === "anthropic") {
      // Basic format validation for Anthropic API keys
      return /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "gemini-cli") {
      // CLI provider doesn't use API keys - authentication is handled via CLI
      return true;
    }

    return false;
  }

  /**
   * Validate CLI timeout configuration
   */
  public validateCLITimeout(timeout: number): { valid: boolean; error?: string; sanitized?: number } {
    if (typeof timeout !== 'number' || isNaN(timeout)) {
      return {
        valid: false,
        error: 'Timeout must be a valid number',
        sanitized: this.defaultConfig.cliTimeout
      };
    }

    // Minimum timeout: 5 seconds
    if (timeout < 5000) {
      return {
        valid: false,
        error: 'Timeout must be at least 5 seconds (5000ms)',
        sanitized: 5000
      };
    }

    // Maximum timeout: 10 minutes
    if (timeout > 600000) {
      return {
        valid: false,
        error: 'Timeout cannot exceed 10 minutes (600000ms)',
        sanitized: 600000
      };
    }

    return { valid: true, sanitized: timeout };
  }

  /**
   * Validate CLI max retries configuration
   */
  public validateCLIMaxRetries(maxRetries: number): { valid: boolean; error?: string; sanitized?: number } {
    if (typeof maxRetries !== 'number' || isNaN(maxRetries)) {
      return {
        valid: false,
        error: 'Max retries must be a valid number',
        sanitized: this.defaultConfig.cliMaxRetries
      };
    }

    // Minimum retries: 0 (no retries)
    if (maxRetries < 0) {
      return {
        valid: false,
        error: 'Max retries cannot be negative',
        sanitized: 0
      };
    }

    // Maximum retries: 10 (to prevent excessive retry loops)
    if (maxRetries > 10) {
      return {
        valid: false,
        error: 'Max retries cannot exceed 10',
        sanitized: 10
      };
    }

    return { valid: true, sanitized: maxRetries };
  }

  /**
   * Validate CLI retry delay configuration
   */
  public validateCLIRetryDelay(retryDelay: number): { valid: boolean; error?: string; sanitized?: number } {
    if (typeof retryDelay !== 'number' || isNaN(retryDelay)) {
      return {
        valid: false,
        error: 'Retry delay must be a valid number',
        sanitized: this.defaultConfig.cliRetryDelay
      };
    }

    // Minimum retry delay: 100ms
    if (retryDelay < 100) {
      return {
        valid: false,
        error: 'Retry delay must be at least 100 milliseconds',
        sanitized: 100
      };
    }

    // Maximum retry delay: 30 seconds
    if (retryDelay > 30000) {
      return {
        valid: false,
        error: 'Retry delay cannot exceed 30 seconds (30000ms)',
        sanitized: 30000
      };
    }

    return { valid: true, sanitized: retryDelay };
  }

  /**
   * Validate CLI log level configuration
   */
  public validateCLILogLevel(logLevel: string): { valid: boolean; error?: string; sanitized?: 'error' | 'warn' | 'info' | 'debug' } {
    const validLevels: ('error' | 'warn' | 'info' | 'debug')[] = ['error', 'warn', 'info', 'debug'];

    if (typeof logLevel !== 'string' || !validLevels.includes(logLevel as any)) {
      return {
        valid: false,
        error: 'Log level must be one of: error, warn, info, debug',
        sanitized: this.defaultConfig.cliLogLevel
      };
    }

    return { valid: true, sanitized: logLevel as 'error' | 'warn' | 'info' | 'debug' };
  }

  /**
   * Validate and sanitize CLI configuration
   */
  public validateCLIConfig(config: Partial<Config>): { valid: boolean; errors: string[]; sanitized: Partial<Config> } {
    const errors: string[] = [];
    const sanitized: Partial<Config> = { ...config };

    // Validate timeout if provided
    if (config.cliTimeout !== undefined) {
      const timeoutValidation = this.validateCLITimeout(config.cliTimeout);
      if (!timeoutValidation.valid) {
        errors.push(`CLI Timeout: ${timeoutValidation.error}`);
        sanitized.cliTimeout = timeoutValidation.sanitized;
      }
    }

    // Validate max retries if provided
    if (config.cliMaxRetries !== undefined) {
      const retriesValidation = this.validateCLIMaxRetries(config.cliMaxRetries);
      if (!retriesValidation.valid) {
        errors.push(`CLI Max Retries: ${retriesValidation.error}`);
        sanitized.cliMaxRetries = retriesValidation.sanitized;
      }
    }

    // Validate retry delay if provided
    if (config.cliRetryDelay !== undefined) {
      const retryDelayValidation = this.validateCLIRetryDelay(config.cliRetryDelay);
      if (!retryDelayValidation.valid) {
        errors.push(`CLI Retry Delay: ${retryDelayValidation.error}`);
        sanitized.cliRetryDelay = retryDelayValidation.sanitized;
      }
    }

    // Validate enable logging if provided
    if (config.cliEnableLogging !== undefined) {
      if (typeof config.cliEnableLogging !== 'boolean') {
        errors.push('CLI Enable Logging: Must be a boolean value');
        sanitized.cliEnableLogging = this.defaultConfig.cliEnableLogging;
      }
    }

    // Validate log level if provided
    if (config.cliLogLevel !== undefined) {
      const logLevelValidation = this.validateCLILogLevel(config.cliLogLevel);
      if (!logLevelValidation.valid) {
        errors.push(`CLI Log Level: ${logLevelValidation.error}`);
        sanitized.cliLogLevel = logLevelValidation.sanitized;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized
    };
  }

  /**
   * Get the stored opacity value
   */
  public getOpacity(): number {
    const config = this.loadConfig();
    return config.opacity !== undefined ? config.opacity : 1.0;
  }

  /**
   * Set the window opacity value
   */
  public setOpacity(opacity: number): void {
    // Ensure opacity is between 0.1 and 1.0
    const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
    this.updateConfig({ opacity: validOpacity });
  }

  /**
   * Get the preferred programming language
   */
  public getLanguage(): string {
    const config = this.loadConfig();
    return config.language || "python";
  }

  /**
   * Set the preferred programming language
   */
  public setLanguage(language: string): void {
    this.updateConfig({ language });
  }

  /**
   * Test API key with the selected provider
   */
  public async testApiKey(apiKey: string, provider?: APIProvider): Promise<{ valid: boolean, error?: string }> {
    // Auto-detect provider based on key format if not specified
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format for testing");
        } else {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format for testing");
        }
      } else {
        provider = "gemini";
        console.log("Using Gemini API key format for testing (default)");
      }
    }

    if (provider === "openai") {
      return this.testOpenAIKey(apiKey);
    } else if (provider === "gemini") {
      return this.testGeminiKey(apiKey);
    } else if (provider === "anthropic") {
      return this.testAnthropicKey(apiKey);
    } else if (provider === "gemini-cli") {
      return this.testGeminiCLI();
    }

    return { valid: false, error: "Unknown API provider" };
  }

  /**
   * Test OpenAI API key
   */
  private async testOpenAIKey(apiKey: string): Promise<{ valid: boolean, error?: string }> {
    try {
      const openai = new OpenAI({ apiKey });
      // Make a simple API call to test the key
      await openai.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error('OpenAI API key test failed:', error);

      // Determine the specific error type for better error messages
      let errorMessage = 'Unknown error validating OpenAI API key';

      if (error.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI key and try again.';
      } else if (error.status === 429) {
        errorMessage = 'Rate limit exceeded. Your OpenAI API key has reached its request limit or has insufficient quota.';
      } else if (error.status === 500) {
        errorMessage = 'OpenAI server error. Please try again later.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Gemini API key
   * Note: This is a simplified implementation since we don't have the actual Gemini client
   */
  private async testGeminiKey(apiKey: string): Promise<{ valid: boolean, error?: string }> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Gemini API and validate the key
      if (apiKey && apiKey.trim().length >= 20) {
        // Here you would actually validate the key with a Gemini API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Gemini API key format.' };
    } catch (error: any) {
      console.error('Gemini API key test failed:', error);
      let errorMessage = 'Unknown error validating Gemini API key';

      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Anthropic API key
   * Note: This is a simplified implementation since we don't have the actual Anthropic client
   */
  private async testAnthropicKey(apiKey: string): Promise<{ valid: boolean, error?: string }> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Anthropic API and validate the key
      if (apiKey && /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim())) {
        // Here you would actually validate the key with an Anthropic API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Anthropic API key format.' };
    } catch (error: any) {
      console.error('Anthropic API key test failed:', error);
      let errorMessage = 'Unknown error validating Anthropic API key';

      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }

      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Gemini CLI installation and authentication with structured error handling
   */
  private async testGeminiCLI(): Promise<{ valid: boolean, error?: string, cliError?: CLIError }> {
    try {
      // Check if CLI is installed
      const installationResult = await this.detectGeminiCLIInstallation();
      if (!installationResult.isInstalled) {
        const cliError = createCLIError(
          CLI_ERROR_CODES.CLI_NOT_FOUND,
          installationResult.error,
          'Gemini CLI is not installed. Please install the Gemini CLI and ensure it is available in your system PATH.'
        );
        const errorInfo = formatErrorForUser(cliError);
        return {
          valid: false,
          error: errorInfo.message,
          cliError
        };
      }

      // Check version compatibility
      if (!installationResult.isCompatible) {
        const cliError = createCLIError(
          CLI_ERROR_CODES.CLI_VERSION_INCOMPATIBLE,
          installationResult.error,
          installationResult.error || 'Gemini CLI version is not compatible with this application.'
        );
        const errorInfo = formatErrorForUser(cliError);
        return {
          valid: false,
          error: errorInfo.message,
          cliError
        };
      }

      // Check if CLI is authenticated using the dedicated authentication validation method
      const authResult = await this.validateGeminiCLIAuthentication();
      if (!authResult.isAuthenticated) {
        const cliError = categorizeCLIError(
          authResult.error || 'Authentication required',
          0,
          'authentication_check'
        );
        const errorInfo = formatErrorForUser(cliError);
        return {
          valid: false,
          error: errorInfo.message,
          cliError
        };
      }

      return { valid: true };
    } catch (error: any) {
      console.error('Gemini CLI test failed:', error);
      const cliError = createCLIError(
        CLI_ERROR_CODES.UNKNOWN_ERROR,
        error.message,
        `Unknown error validating Gemini CLI: ${error.message}`
      );
      const errorInfo = formatErrorForUser(cliError);

      return {
        valid: false,
        error: errorInfo.message,
        cliError
      };
    }
  }

  /**
   * Get comprehensive CLI status with structured error information for UI display
   */
  public async getGeminiCLIStatus(): Promise<{
    isInstalled: boolean;
    isAuthenticated: boolean;
    version?: string;
    authMethod?: string;
    error?: string;
    errorCategory?: string;
    errorSeverity?: string;
    actionableSteps?: string[];
    helpUrl?: string;
  }> {
    try {
      // Check installation first
      const installationResult = await this.detectGeminiCLIInstallation();

      if (!installationResult.isInstalled) {
        const cliError = createCLIError(
          CLI_ERROR_CODES.CLI_NOT_FOUND,
          installationResult.error
        );
        const errorInfo = formatErrorForUser(cliError);

        return {
          isInstalled: false,
          isAuthenticated: false,
          error: installationResult.error || 'Gemini CLI not found',
          errorCategory: cliError.category,
          errorSeverity: cliError.severity,
          actionableSteps: errorInfo.steps,
          helpUrl: errorInfo.helpUrl
        };
      }

      // Check version compatibility
      if (!installationResult.isCompatible) {
        const cliError = createCLIError(
          CLI_ERROR_CODES.CLI_VERSION_INCOMPATIBLE,
          installationResult.error
        );
        const errorInfo = formatErrorForUser(cliError);

        return {
          isInstalled: true,
          isAuthenticated: false,
          version: installationResult.version,
          error: installationResult.error || 'Incompatible CLI version',
          errorCategory: cliError.category,
          errorSeverity: cliError.severity,
          actionableSteps: errorInfo.steps,
          helpUrl: errorInfo.helpUrl
        };
      }

      // Check authentication
      const authResult = await this.validateGeminiCLIAuthentication();

      if (!authResult.isAuthenticated) {
        const cliError = categorizeCLIError(
          authResult.error || 'Authentication required',
          0,
          'authentication_check'
        );
        const errorInfo = formatErrorForUser(cliError);

        return {
          isInstalled: true,
          isAuthenticated: false,
          version: installationResult.version,
          error: authResult.error || 'Authentication required',
          errorCategory: cliError.category,
          errorSeverity: cliError.severity,
          actionableSteps: errorInfo.steps,
          helpUrl: errorInfo.helpUrl
        };
      }

      // All checks passed
      return {
        isInstalled: true,
        isAuthenticated: true,
        version: installationResult.version,
        authMethod: authResult.authMethod
      };

    } catch (error: any) {
      console.error('Error getting CLI status:', error);
      const cliError = createCLIError(
        CLI_ERROR_CODES.UNKNOWN_ERROR,
        error.message
      );
      const errorInfo = formatErrorForUser(cliError);

      return {
        isInstalled: false,
        isAuthenticated: false,
        error: `Error checking CLI status: ${error.message}`,
        errorCategory: cliError.category,
        errorSeverity: cliError.severity,
        actionableSteps: errorInfo.steps,
        helpUrl: errorInfo.helpUrl
      };
    }
  }

  /**
   * Check if Gemini CLI is installed in system PATH
   */
  private async checkGeminiCLIInstallation(): Promise<boolean> {
    try {
      const installationResult = await this.detectGeminiCLIInstallation();
      return installationResult.isInstalled;
    } catch (error) {
      console.error('Error checking Gemini CLI installation:', error);
      return false;
    }
  }

  /**
   * Detect Gemini CLI installation and version information
   */
  public async detectGeminiCLIInstallation(): Promise<{
    isInstalled: boolean;
    version?: string;
    isCompatible: boolean;
    error?: string;
  }> {
    try {
      const { spawn } = await import('child_process');

      return new Promise((resolve) => {
        const process = spawn('gemini', ['--version'], {
          stdio: 'pipe',
          shell: true
        });

        let stdout = '';
        let stderr = '';

        process.stdout?.on('data', (data: any) => {
          stdout += data.toString();
        });

        process.stderr?.on('data', (data: any) => {
          stderr += data.toString();
        });

        process.on('close', (code: any) => {
          if (code === 0 && stdout) {
            // Parse version from output
            const version = this.parseGeminiCLIVersion(stdout);
            const isCompatible = this.isGeminiCLIVersionCompatible(version);

            resolve({
              isInstalled: true,
              version,
              isCompatible,
              error: !isCompatible ? `Gemini CLI version ${version} is not compatible. Please update to a supported version.` : undefined
            });
          } else {
            resolve({
              isInstalled: false,
              isCompatible: false,
              error: stderr || 'Gemini CLI not found in system PATH'
            });
          }
        });

        process.on('error', (error: any) => {
          resolve({
            isInstalled: false,
            isCompatible: false,
            error: `Failed to execute Gemini CLI: ${error.message}`
          });
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          process.kill();
          resolve({
            isInstalled: false,
            isCompatible: false,
            error: 'Gemini CLI command timed out'
          });
        }, 5000);
      });
    } catch (error: any) {
      console.error('Error detecting Gemini CLI installation:', error);
      return {
        isInstalled: false,
        isCompatible: false,
        error: `Error detecting CLI: ${error.message}`
      };
    }
  }

  /**
   * Parse version string from Gemini CLI output
   */
  private parseGeminiCLIVersion(output: string): string {
    // Look for version patterns like "gemini 1.2.3" or "version 1.2.3"
    const versionMatch = output.match(/(?:gemini|version)\s+(\d+\.\d+\.\d+)/i);
    if (versionMatch) {
      return versionMatch[1];
    }

    // Look for standalone version numbers
    const standaloneMatch = output.match(/(\d+\.\d+\.\d+)/);
    if (standaloneMatch) {
      return standaloneMatch[1];
    }

    return 'unknown';
  }

  /**
   * Check if Gemini CLI version is compatible
   * Following Cline's approach - accept any version that can be parsed
   */
  private isGeminiCLIVersionCompatible(version: string): boolean {
    if (version === 'unknown') {
      return false;
    }

    try {
      const versionParts = version.split('.');

      // Accept versions with 2 or 3 parts (e.g., "0.1" or "0.1.13")
      if (versionParts.length < 2 || versionParts.length > 3) {
        return false;
      }

      const [major, minor, patch] = versionParts.map(Number);

      // Check if major and minor are valid numbers
      if (isNaN(major) || isNaN(minor)) {
        return false;
      }

      // If patch is provided, it should be a valid number
      if (versionParts.length === 3 && isNaN(patch)) {
        return false;
      }

      // Accept any version that has valid major.minor format
      // This includes 0.1.x versions which are valid for Gemini CLI
      return major >= 0 && minor >= 0;

    } catch (error) {
      console.error('Error parsing version for compatibility check:', error);
      return false;
    }
  }

  /**
   * Validate Gemini CLI authentication status by checking for oauth_creds.json
   */
  public async validateGeminiCLIAuthentication(): Promise<{
    isAuthenticated: boolean;
    error?: string;
    authMethod?: string;
  }> {
    try {
      // Check if CLI is installed first
      const installationResult = await this.detectGeminiCLIInstallation();
      if (!installationResult.isInstalled) {
        return {
          isAuthenticated: false,
          error: 'Gemini CLI is not installed'
        };
      }

      // Check for authentication credentials file (oauth_creds.json)
      // Following Cline's approach to check standard locations
      const authResult = await this.checkGeminiCLIAuthFile();

      if (authResult.isAuthenticated) {
        return {
          isAuthenticated: true,
          authMethod: authResult.method || 'OAuth Credentials'
        };
      } else {
        return {
          isAuthenticated: false,
          error: authResult.error || 'No authentication credentials found. Please authenticate with the Gemini CLI.'
        };
      }

    } catch (error: any) {
      console.error('Error validating Gemini CLI authentication:', error);
      return {
        isAuthenticated: false,
        error: `Error checking authentication: ${error.message}`
      };
    }
  }

  /**
   * Check for Gemini CLI authentication file (oauth_creds.json) in standard locations
   */
  private async checkGeminiCLIAuthFile(): Promise<{
    isAuthenticated: boolean;
    error?: string;
    method?: string;
  }> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      // Standard locations where Gemini CLI stores authentication credentials
      // Following Cline's approach for oauth_creds.json
      const possibleAuthPaths = [
        // User's home directory
        path.join(os.homedir(), 'oauth_creds.json'),
        path.join(os.homedir(), '.config', 'gemini', 'oauth_creds.json'),
        path.join(os.homedir(), '.gemini', 'oauth_creds.json'),

        // Platform-specific locations
        ...(process.platform === 'win32' ? [
          path.join(os.homedir(), 'AppData', 'Roaming', 'gemini', 'oauth_creds.json'),
          path.join(os.homedir(), 'AppData', 'Local', 'gemini', 'oauth_creds.json'),
        ] : []),

        ...(process.platform === 'darwin' ? [
          path.join(os.homedir(), 'Library', 'Application Support', 'gemini', 'oauth_creds.json'),
        ] : []),

        ...(process.platform === 'linux' ? [
          path.join(os.homedir(), '.local', 'share', 'gemini', 'oauth_creds.json'),
        ] : []),
      ];

      // Check each possible location
      for (const authPath of possibleAuthPaths) {
        try {
          if (fs.existsSync(authPath)) {
            // Try to read and validate the credentials file
            const credentialsContent = fs.readFileSync(authPath, 'utf8');
            const credentials = JSON.parse(credentialsContent);

            // Basic validation of OAuth credentials structure
            if (this.isValidOAuthCredentials(credentials)) {
              return {
                isAuthenticated: true,
                method: 'OAuth Credentials File'
              };
            }
          }
        } catch (error) {
          // Continue checking other locations if this one fails
          console.debug(`Failed to read auth file at ${authPath}:`, error);
          continue;
        }
      }

      // If no valid credentials file found, check for environment variables
      const envAuth = this.checkEnvironmentAuth();
      if (envAuth.isAuthenticated) {
        return envAuth;
      }

      return {
        isAuthenticated: false,
        error: 'No authentication credentials found. Please run the Gemini CLI authentication setup.'
      };

    } catch (error: any) {
      console.error('Error checking Gemini CLI auth file:', error);
      return {
        isAuthenticated: false,
        error: `Error checking authentication file: ${error.message}`
      };
    }
  }

  /**
   * Validate OAuth credentials structure
   */
  private isValidOAuthCredentials(credentials: any): boolean {
    try {
      // Basic validation for OAuth credentials structure
      // This should match the structure that Gemini CLI uses
      return (
        credentials &&
        typeof credentials === 'object' &&
        (
          // Check for common OAuth fields
          (credentials.access_token && typeof credentials.access_token === 'string') ||
          (credentials.refresh_token && typeof credentials.refresh_token === 'string') ||
          (credentials.client_id && typeof credentials.client_id === 'string') ||
          // Or check for API key
          (credentials.api_key && typeof credentials.api_key === 'string')
        )
      );
    } catch (error) {
      console.debug('Error validating OAuth credentials:', error);
      return false;
    }
  }

  /**
   * Check for authentication via environment variables
   */
  private checkEnvironmentAuth(): {
    isAuthenticated: boolean;
    error?: string;
    method?: string;
  } {
    try {
      // Check for common Gemini API environment variables
      const geminiApiKey = process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      if (geminiApiKey && geminiApiKey.trim().length > 0) {
        return {
          isAuthenticated: true,
          method: 'Environment Variable'
        };
      }

      // Check for Google Cloud credentials
      const googleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (googleCredentials && googleCredentials.trim().length > 0) {
        const fs = require('fs');
        if (fs.existsSync(googleCredentials)) {
          return {
            isAuthenticated: true,
            method: 'Google Cloud Credentials'
          };
        }
      }

      return {
        isAuthenticated: false,
        error: 'No environment authentication found'
      };

    } catch (error: any) {
      console.debug('Error checking environment auth:', error);
      return {
        isAuthenticated: false,
        error: `Error checking environment authentication: ${error.message}`
      };
    }
  }

  /**
   * Parse authentication status from Gemini CLI output
   */
  private parseGeminiCLIAuthStatus(output: string): {
    isAuthenticated: boolean;
    method?: string;
  } {
    const lowerOutput = output.toLowerCase();

    // First check for negative authentication indicators (more specific)
    if (lowerOutput.includes('not authenticated') ||
      lowerOutput.includes('not logged in') ||
      lowerOutput.includes('no active account') ||
      lowerOutput.includes('authentication required')) {
      return {
        isAuthenticated: false
      };
    }

    // Then look for positive authentication indicators
    if (lowerOutput.includes('authenticated') ||
      lowerOutput.includes('logged in') ||
      lowerOutput.includes('active account') ||
      lowerOutput.includes('signed in')) {

      // Try to extract authentication method
      let method = 'unknown';
      if (lowerOutput.includes('oauth') || lowerOutput.includes('google account')) {
        method = 'Google OAuth';
      } else if (lowerOutput.includes('service account')) {
        method = 'Service Account';
      } else if (lowerOutput.includes('api key')) {
        method = 'API Key';
      }

      return {
        isAuthenticated: true,
        method
      };
    }

    // If we can't determine status from output, assume not authenticated
    return {
      isAuthenticated: false
    };
  }

  /**
   * Parse authentication error messages from Gemini CLI
   */
  private parseGeminiCLIAuthError(errorOutput: string): string {
    const lowerError = errorOutput.toLowerCase();

    // Check for specific error patterns and provide helpful messages
    if (lowerError.includes('not authenticated') || lowerError.includes('authentication required')) {
      return 'Gemini CLI is not authenticated. Please run "gemini auth login" to authenticate with your Google account.';
    }

    if (lowerError.includes('expired') || lowerError.includes('token expired')) {
      return 'Authentication token has expired. Please run "gemini auth login" to re-authenticate.';
    }

    if (lowerError.includes('invalid credentials') || lowerError.includes('invalid token')) {
      return 'Invalid authentication credentials. Please run "gemini auth login" to re-authenticate with valid credentials.';
    }

    if (lowerError.includes('permission denied') || lowerError.includes('access denied')) {
      return 'Access denied. Please ensure your account has the necessary permissions to use Gemini API.';
    }

    if (lowerError.includes('quota') || lowerError.includes('rate limit')) {
      return 'API quota exceeded or rate limit reached. Please check your Gemini API usage limits.';
    }

    if (lowerError.includes('network') || lowerError.includes('connection')) {
      return 'Network connection error. Please check your internet connection and try again.';
    }

    // Generic error message if we can't identify the specific issue
    return `Authentication error: ${errorOutput.trim() || 'Unknown authentication issue. Please run "gemini auth login" to authenticate.'}`;
  }

  /**
   * Get available models from Gemini CLI (hardcoded list)
   */
  public async getGeminiCLIModels(): Promise<{
    models: string[];
    error?: string;
  }> {
    // Hardcoded list of available Gemini models that work with the CLI
    // Based on the models available through the Gemini API
    const availableModels = [
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash-thinking-exp-1219',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro',
      'gemini-1.0-pro'
    ];

    try {
      // Filter to only include models that are compatible with our application
      const compatibleModels = this.filterCompatibleModels(availableModels);

      return {
        models: compatibleModels,
        error: compatibleModels.length === 0 ? 'No compatible models found' : undefined
      };
    } catch (error: any) {
      console.error('Error filtering Gemini CLI models:', error);
      return {
        models: ['gemini-2.0-flash', 'gemini-1.5-pro'], // Fallback to basic models
        error: undefined
      };
    }
  }



  /**
   * Filter models to only include compatible ones
   */
  private filterCompatibleModels(models: string[]): string[] {
    // Define the exact models that are supported by the application
    // Only include the core models that are stable and well-tested
    const supportedModels = [
      'gemini-1.5-pro',
      'gemini-2.0-flash'
    ];

    return models.filter(model => supportedModels.includes(model));
  }



  /**
   * Parse model names from Gemini CLI output (legacy method kept for test compatibility)
   * @deprecated This method is no longer used since we use a hardcoded model list
   */
  private parseGeminiCLIModels(output: string): string[] {
    const models: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and headers
      if (!trimmedLine || trimmedLine.includes('Model') || trimmedLine.includes('---')) {
        continue;
      }

      // Look for gemini model patterns
      const match = trimmedLine.match(/gemini-[\d\.]+-[a-z]+/i);
      if (match) {
        models.push(match[0]);
      }
    }

    // Remove duplicates and return
    return [...new Set(models)];
  }

  /**
   * Check if a model version is compatible (legacy method kept for test compatibility)
   * @deprecated This method is no longer used since we use a hardcoded model list
   */
  private isModelVersionCompatible(model: string, supportedModel: string): boolean {
    // Simple compatibility check for legacy tests
    return model === supportedModel;
  }

  /**
   * Parse error messages from Gemini CLI commands (kept for potential future use)
   */
  private parseGeminiCLIModelsError(errorOutput: string): string {
    const lowerError = errorOutput.toLowerCase();

    // Check for specific error patterns
    if (lowerError.includes('not authenticated') || lowerError.includes('authentication required')) {
      return 'Authentication required to list models. Please run "gemini auth login" to authenticate.';
    }

    if (lowerError.includes('permission denied') || lowerError.includes('access denied')) {
      return 'Access denied when listing models. Please ensure your account has the necessary permissions.';
    }

    if (lowerError.includes('quota') || lowerError.includes('rate limit')) {
      return 'API quota exceeded or rate limit reached when listing models.';
    }

    if (lowerError.includes('network') || lowerError.includes('connection')) {
      return 'Network connection error when listing models. Please check your internet connection.';
    }

    if (lowerError.includes('command not found') || lowerError.includes('not found')) {
      return 'Gemini CLI command not found. Please ensure the CLI is properly installed.';
    }

    // Generic error message
    return `Error listing models: ${errorOutput.trim() || 'Unknown error occurred while listing models'}`;
  }
}

// Export a singleton instance
export const configHelper = new ConfigHelper();
