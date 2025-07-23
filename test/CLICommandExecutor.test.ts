import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock the ProcessingHelper class to test CLI functionality
class MockProcessingHelper {
  private config = {
    cliTimeout: 30000,
    cliMaxRetries: 3
  };

  /**
   * Execute a Gemini CLI command with timeout handling and security sanitization
   */
  async executeGeminiCLI(command: GeminiCLICommand, signal?: AbortSignal): Promise<GeminiCLIResponse> {
    return new Promise((resolve) => {
      const timeout = command.timeout || this.config.cliTimeout || 30000;
      
      // Sanitize command arguments for security
      const sanitizedArgs = this.sanitizeCliArguments(command.args);
      
      console.log(`Executing Gemini CLI: ${command.command} ${sanitizedArgs.join(' ')}`);
      
      // Spawn the CLI process
      const childProcess = spawn(command.command, sanitizedArgs, {
        stdio: 'pipe',
        shell: true,
        env: { ...process.env }
      }) as any;
      
      let stdout = '';
      let stderr = '';
      let isResolved = false;
      let timeoutId: NodeJS.Timeout;
      
      // Set up timeout handling
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (!childProcess.killed) {
          childProcess.kill('SIGTERM');
          // Force kill after 5 seconds if process doesn't terminate
          setTimeout(() => {
            if (!childProcess.killed) {
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
          resolve({
            success: false,
            error: `Command timed out after ${timeout}ms`,
            exitCode: -1
          });
        }
      }, timeout);
      
      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            resolve({
              success: false,
              error: 'Command was aborted',
              exitCode: -1
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
            resolve({
              success: false,
              error: stderr.trim() || stdout.trim() || `Process exited with code ${code}`,
              exitCode: code || -1
            });
          }
        }
      });
      
      // Handle process errors
      childProcess.on('error', (error: Error) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve({
            success: false,
            error: `Failed to execute command: ${error.message}`,
            exitCode: -1
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
  sanitizeCliArguments(args: string[]): string[] {
    return args.map(arg => {
      // Remove or escape potentially dangerous characters
      return arg
        .replace(/[;&|`$(){}[\]<>]/g, '') // Remove shell metacharacters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    }).filter(arg => arg.length > 0); // Remove empty arguments
  }
  
  /**
   * Execute Gemini CLI command with retry logic
   */
  async executeGeminiCLIWithRetry(command: GeminiCLICommand, signal?: AbortSignal): Promise<GeminiCLIResponse> {
    const maxRetries = this.config.cliMaxRetries || 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeGeminiCLI(command, signal);
        
        if (result.success) {
          return result;
        }
        
        // Check if error is retryable
        if (this.isRetryableError(result.error)) {
          if (attempt < maxRetries) {
            console.log(`CLI command failed (attempt ${attempt}/${maxRetries}), retrying...`);
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
            continue;
          }
        }
        
        // Non-retryable error or max retries reached
        return result;
      } catch (error: any) {
        if (attempt === maxRetries) {
          return {
            success: false,
            error: `Failed after ${maxRetries} attempts: ${error.message}`,
            exitCode: -1
          };
        }
        
        console.log(`CLI execution error (attempt ${attempt}/${maxRetries}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }
    }
    
    return {
      success: false,
      error: `Failed after ${maxRetries} attempts`,
      exitCode: -1
    };
  }
  
  /**
   * Check if an error is retryable
   */
  isRetryableError(error?: string): boolean {
    if (!error) return false;
    
    const retryablePatterns = [
      /network/i,
      /connection/i,
      /timeout/i,
      /temporary/i,
      /rate limit/i,
      /server error/i,
      /503/,
      /502/,
      /500/
    ];
    
    return retryablePatterns.some(pattern => pattern.test(error));
  }
}

// Interfaces
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
}

describe('CLI Command Executor', () => {
  let processingHelper: MockProcessingHelper;
  let mockChildProcess: any;
  let mockSpawn: any;

  beforeEach(() => {
    processingHelper = new MockProcessingHelper();
    
    // Create a mock child process
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.stdin = {
      write: vi.fn(),
      end: vi.fn()
    };
    mockChildProcess.kill = vi.fn();
    mockChildProcess.killed = false;
    
    // Mock spawn to return our mock child process
    mockSpawn = vi.mocked(spawn);
    mockSpawn.mockReturnValue(mockChildProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('executeGeminiCLI', () => {
    it('should execute CLI command successfully', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate', '--model', 'gemini-2.0-flash'],
        timeout: 5000
      };

      // Start the execution
      const resultPromise = processingHelper.executeGeminiCLI(command);

      // Simulate successful process execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('{"response": "test output"}'));
        mockChildProcess.emit('close', 0);
      }, 100);

      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.output).toBe('{"response": "test output"}');
      expect(result.exitCode).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith(
        'gemini',
        ['generate', '--model', 'gemini-2.0-flash'],
        expect.objectContaining({
          stdio: 'pipe',
          shell: true,
          env: expect.any(Object)
        })
      );
    });

    it('should handle command timeout', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate'],
        timeout: 100 // Very short timeout
      };

      const result = await processingHelper.executeGeminiCLI(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command timed out after 100ms');
      expect(result.exitCode).toBe(-1);
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle process errors', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate']
      };

      // Start the execution
      const resultPromise = processingHelper.executeGeminiCLI(command);

      // Simulate process error
      setTimeout(() => {
        mockChildProcess.emit('error', new Error('Command not found'));
      }, 50);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to execute command: Command not found');
      expect(result.exitCode).toBe(-1);
    });

    it('should handle non-zero exit codes', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate']
      };

      // Start the execution
      const resultPromise = processingHelper.executeGeminiCLI(command);

      // Simulate process failure
      setTimeout(() => {
        mockChildProcess.stderr.emit('data', Buffer.from('Authentication failed'));
        mockChildProcess.emit('close', 1);
      }, 50);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
      expect(result.exitCode).toBe(1);
    });

    it('should handle abort signal', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate']
      };

      const abortController = new AbortController();
      const resultPromise = processingHelper.executeGeminiCLI(command, abortController.signal);

      // Abort the command
      setTimeout(() => {
        abortController.abort();
      }, 50);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Command was aborted');
      expect(result.exitCode).toBe(-1);
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should send input to process stdin', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate'],
        input: 'test input data'
      };

      // Start the execution
      const resultPromise = processingHelper.executeGeminiCLI(command);

      // Simulate successful execution
      setTimeout(() => {
        mockChildProcess.stdout.emit('data', Buffer.from('success'));
        mockChildProcess.emit('close', 0);
      }, 50);

      await resultPromise;

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith('test input data');
      expect(mockChildProcess.stdin.end).toHaveBeenCalled();
    });
  });

  describe('sanitizeCliArguments', () => {
    it('should remove dangerous shell metacharacters', () => {
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

      const sanitized = processingHelper.sanitizeCliArguments(dangerousArgs);

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

    it('should normalize whitespace', () => {
      const args = ['  arg1  ', 'arg2\t\ttest', 'arg3\n\nvalue'];
      const sanitized = processingHelper.sanitizeCliArguments(args);

      expect(sanitized).toEqual(['arg1', 'arg2 test', 'arg3 value']);
    });

    it('should filter out empty arguments', () => {
      const args = ['valid', '', '   ', 'another'];
      const sanitized = processingHelper.sanitizeCliArguments(args);

      expect(sanitized).toEqual(['valid', 'another']);
    });
  });

  describe('executeGeminiCLIWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate']
      };

      // Mock successful execution
      vi.spyOn(processingHelper, 'executeGeminiCLI').mockResolvedValue({
        success: true,
        output: 'success',
        exitCode: 0
      });

      const result = await processingHelper.executeGeminiCLIWithRetry(command);

      expect(result.success).toBe(true);
      expect(result.output).toBe('success');
      expect(processingHelper.executeGeminiCLI).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate']
      };

      // Mock first two attempts failing with retryable error, third succeeding
      vi.spyOn(processingHelper, 'executeGeminiCLI')
        .mockResolvedValueOnce({
          success: false,
          error: 'Network connection failed',
          exitCode: 1
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Temporary server error',
          exitCode: 1
        })
        .mockResolvedValueOnce({
          success: true,
          output: 'success after retry',
          exitCode: 0
        });

      const result = await processingHelper.executeGeminiCLIWithRetry(command);

      expect(result.success).toBe(true);
      expect(result.output).toBe('success after retry');
      expect(processingHelper.executeGeminiCLI).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate']
      };

      // Mock non-retryable error
      vi.spyOn(processingHelper, 'executeGeminiCLI').mockResolvedValue({
        success: false,
        error: 'Invalid API key',
        exitCode: 1
      });

      const result = await processingHelper.executeGeminiCLIWithRetry(command);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
      expect(processingHelper.executeGeminiCLI).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      const command: GeminiCLICommand = {
        command: 'gemini',
        args: ['generate']
      };

      // Mock all attempts failing with retryable error
      vi.spyOn(processingHelper, 'executeGeminiCLI').mockResolvedValue({
        success: false,
        error: 'Network timeout',
        exitCode: 1
      });

      const result = await processingHelper.executeGeminiCLIWithRetry(command);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(processingHelper.executeGeminiCLI).toHaveBeenCalledTimes(3);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const retryableErrors = [
        'Network connection failed',
        'Connection timeout',
        'Temporary server error',
        'Rate limit exceeded',
        'Server error 500',
        'Service unavailable 503',
        'Bad gateway 502'
      ];

      retryableErrors.forEach(error => {
        expect(processingHelper.isRetryableError(error)).toBe(true);
      });
    });

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        'Invalid API key',
        'Authentication failed',
        'Permission denied',
        'File not found',
        'Invalid argument'
      ];

      nonRetryableErrors.forEach(error => {
        expect(processingHelper.isRetryableError(error)).toBe(false);
      });
    });

    it('should handle undefined/null errors', () => {
      expect(processingHelper.isRetryableError(undefined)).toBe(false);
      expect(processingHelper.isRetryableError('')).toBe(false);
    });
  });
});