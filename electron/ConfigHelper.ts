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
    cliTimeout: 30000, // 30 seconds default timeout for CLI commands
    cliMaxRetries: 3 // Default retry attempts for CLI failures
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
    } else if (provider === "gemini")  {
      // Only allow gemini-1.5-pro and gemini-2.0-flash for Gemini
      const allowedModels = ['gemini-1.5-pro', 'gemini-2.0-flash'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Gemini model specified: ${model}. Using default model: gemini-2.0-flash`);
        return 'gemini-2.0-flash'; // Changed default to flash
      }
      return model;
    }  else if (provider === "anthropic") {
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
        
        return {
          ...this.defaultConfig,
          ...config
        };
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
      if (updates.cliTimeout !== undefined || updates.cliMaxRetries !== undefined) {
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
          updates.debuggingModel !== undefined || updates.language !== undefined) {
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
  public async testApiKey(apiKey: string, provider?: APIProvider): Promise<{valid: boolean, error?: string}> {
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
  private async testOpenAIKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
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
  private async testGeminiKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
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
  private async testAnthropicKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
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
  private async testGeminiCLI(): Promise<{valid: boolean, error?: string, cliError?: CLIError}> {
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
        version: installationResult.version
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
   */
  private isGeminiCLIVersionCompatible(version: string): boolean {
    if (version === 'unknown') {
      return false;
    }
    
    try {
      const versionParts = version.split('.');
      
      // Ensure we have exactly 3 parts (major.minor.patch)
      if (versionParts.length !== 3) {
        return false;
      }
      
      const [major, minor, patch] = versionParts.map(Number);
      
      // Check if any part is NaN
      if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
        return false;
      }
      
      // Define minimum supported version (example: 1.0.0)
      const minMajor = 1;
      const minMinor = 0;
      const minPatch = 0;
      
      if (major > minMajor) return true;
      if (major === minMajor && minor > minMinor) return true;
      if (major === minMajor && minor === minMinor && patch >= minPatch) return true;
      
      return false;
    } catch (error) {
      console.error('Error parsing version for compatibility check:', error);
      return false;
    }
  }

  /**
   * Validate Gemini CLI authentication status
   */
  public async validateGeminiCLIAuthentication(): Promise<{
    isAuthenticated: boolean;
    error?: string;
    authMethod?: string;
  }> {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        // Try to run a simple authenticated command to test auth status
        const process = spawn('gemini', ['auth', 'status'], { 
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
          if (code === 0) {
            // Parse authentication status from output
            const authInfo = this.parseGeminiCLIAuthStatus(stdout);
            
            if (authInfo.isAuthenticated) {
              resolve({
                isAuthenticated: true,
                authMethod: authInfo.method
              });
            } else {
              resolve({
                isAuthenticated: false,
                error: 'Gemini CLI is not authenticated. Please run "gemini auth login" to authenticate with your Google account.'
              });
            }
          } else {
            // Check for specific authentication error messages
            const errorMessage = this.parseGeminiCLIAuthError(stderr || stdout);
            resolve({
              isAuthenticated: false,
              error: errorMessage
            });
          }
        });
        
        process.on('error', (error: any) => {
          resolve({
            isAuthenticated: false,
            error: `Failed to check authentication status: ${error.message}`
          });
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          process.kill();
          resolve({
            isAuthenticated: false,
            error: 'Authentication check timed out'
          });
        }, 10000);
      });
    } catch (error: any) {
      console.error('Error validating Gemini CLI authentication:', error);
      return {
        isAuthenticated: false,
        error: `Error checking authentication: ${error.message}`
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
   * Get available models from Gemini CLI
   */
  public async getGeminiCLIModels(): Promise<{
    models: string[];
    error?: string;
  }> {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        const process = spawn('gemini', ['models', 'list'], { 
          stdio: 'pipe',
          shell: true 
        });
        
        let stdout = '';
        let stderr = '';
        
        process.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        process.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            try {
              // Parse the output to extract model names
              const models = this.parseGeminiCLIModels(stdout);
              const compatibleModels = this.filterCompatibleModels(models);
              
              resolve({
                models: compatibleModels,
                error: compatibleModels.length === 0 ? 'No compatible models found' : undefined
              });
            } catch (parseError) {
              console.error('Error parsing CLI models output:', parseError);
              resolve({
                models: [],
                error: 'Failed to parse models list from CLI output'
              });
            }
          } else {
            const errorMessage = this.parseGeminiCLIModelsError(stderr || stdout);
            resolve({
              models: [],
              error: errorMessage
            });
          }
        });
        
        process.on('error', (error) => {
          resolve({
            models: [],
            error: `Failed to execute models list command: ${error.message}`
          });
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
          process.kill();
          resolve({
            models: [],
            error: 'Models list command timed out'
          });
        }, 10000);
      });
    } catch (error: any) {
      console.error('Error getting Gemini CLI models:', error);
      return {
        models: [],
        error: `Error retrieving models: ${error.message}`
      };
    }
  }

  /**
   * Parse model names from Gemini CLI output
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
      
      // Look for gemini model patterns in various formats
      // Format 1: "gemini-1.5-pro" or "gemini-2.0-flash"
      let match = trimmedLine.match(/gemini-[\d\.]+-[a-z]+/i);
      if (match) {
        models.push(match[0]);
        continue;
      }
      
      // Format 2: Lines that start with model names
      match = trimmedLine.match(/^(gemini-[\d\.]+-[a-z]+)/i);
      if (match) {
        models.push(match[1]);
        continue;
      }
      
      // Format 3: JSON-like output with model field
      if (trimmedLine.includes('"name"') || trimmedLine.includes('"model"')) {
        match = trimmedLine.match(/"(?:name|model)"\s*:\s*"(gemini-[\d\.]+-[a-z]+)"/i);
        if (match) {
          models.push(match[1]);
          continue;
        }
      }
      
      // Format 4: Table format with model names in columns
      const words = trimmedLine.split(/\s+/);
      for (const word of words) {
        if (/^gemini-[\d\.]+-[a-z]+$/i.test(word)) {
          models.push(word);
          break;
        }
      }
    }
    
    // Remove duplicates and return
    return [...new Set(models)];
  }

  /**
   * Filter models to only include compatible ones
   */
  private filterCompatibleModels(models: string[]): string[] {
    // Define supported models that are compatible with the application
    const supportedModels = ['gemini-1.5-pro', 'gemini-2.0-flash'];
    
    return models.filter(model => {
      // Check if the model is in our supported list
      if (supportedModels.includes(model)) {
        return true;
      }
      
      // Check for version compatibility patterns
      // Accept newer versions of supported model families
      for (const supportedModel of supportedModels) {
        if (this.isModelVersionCompatible(model, supportedModel)) {
          return true;
        }
      }
      
      return false;
    });
  }

  /**
   * Check if a model version is compatible with a supported model family
   */
  private isModelVersionCompatible(model: string, supportedModel: string): boolean {
    try {
      // Extract base model name and version
      const modelMatch = model.match(/^(gemini)-(\d+\.\d+)-([a-z]+)$/i);
      const supportedMatch = supportedModel.match(/^(gemini)-(\d+\.\d+)-([a-z]+)$/i);
      
      if (!modelMatch || !supportedMatch) {
        return false;
      }
      
      const [, modelBase, modelVersion, modelType] = modelMatch;
      const [, supportedBase, supportedVersion, supportedType] = supportedMatch;
      
      // Must be same base (gemini) and type (pro, flash, etc.)
      if (modelBase.toLowerCase() !== supportedBase.toLowerCase() || 
          modelType.toLowerCase() !== supportedType.toLowerCase()) {
        return false;
      }
      
      // Check version compatibility (allow same or newer versions)
      const modelVersionParts = modelVersion.split('.').map(Number);
      const supportedVersionParts = supportedVersion.split('.').map(Number);
      
      // Compare major version
      if (modelVersionParts[0] > supportedVersionParts[0]) {
        return true;
      }
      if (modelVersionParts[0] < supportedVersionParts[0]) {
        return false;
      }
      
      // Compare minor version if major versions are equal
      if (modelVersionParts[1] >= supportedVersionParts[1]) {
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking model version compatibility:', error);
      return false;
    }
  }

  /**
   * Parse error messages from Gemini CLI models command
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
