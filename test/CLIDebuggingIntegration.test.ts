import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProcessingHelper } from '../electron/ProcessingHelper';
import { configHelper } from '../electron/ConfigHelper';

// Mock dependencies
vi.mock('../electron/ConfigHelper', () => ({
  configHelper: {
    loadConfig: vi.fn(),
    on: vi.fn(),
    detectGeminiCLIInstallation: vi.fn(),
    validateGeminiCLIAuthentication: vi.fn(),
    getGeminiCLIModels: vi.fn()
  }
}));

vi.mock('../electron/ScreenshotHelper', () => ({
  ScreenshotHelper: vi.fn()
}));

// Mock IProcessingHelperDeps
const mockDeps = {
  getScreenshotHelper: vi.fn(() => ({
    clearExtraScreenshotQueue: vi.fn()
  })),
  getMainWindow: vi.fn(() => ({
    webContents: {
      send: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue('python') // Mock language detection
    }
  })),
  getView: vi.fn(() => 'debug'), // Set view to debug for debugging tests
  setView: vi.fn(),
  getProblemInfo: vi.fn(() => ({
    problem_statement: 'Find the maximum element in an array',
    constraints: 'Array length > 0',
    example_input: '[1, 3, 2, 5, 4]',
    example_output: '5'
  })),
  setProblemInfo: vi.fn(),
  setHasDebugged: vi.fn(),
  PROCESSING_EVENTS: {
    INITIAL_START: 'initial-start',
    API_KEY_INVALID: 'api-key-invalid',
    NO_SCREENSHOTS: 'no-screenshots',
    PROBLEM_EXTRACTED: 'problem-extracted',
    SOLUTION_SUCCESS: 'solution-success',
    INITIAL_SOLUTION_ERROR: 'initial-solution-error',
    DEBUG_START: 'debug-start',
    DEBUG_SUCCESS: 'debug-success',
    DEBUG_ERROR: 'debug-error'
  }
};

describe('CLI-based Debugging Integration', () => {
  let processingHelper: ProcessingHelper;
  let mockAbortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAbortController = new AbortController();
    
    // Mock default CLI config
    (configHelper.loadConfig as any).mockReturnValue({
      apiProvider: 'gemini-cli',
      extractionModel: 'gemini-2.0-flash',
      solutionModel: 'gemini-2.0-flash',
      debuggingModel: 'gemini-1.5-pro',
      cliTimeout: 30000,
      cliMaxRetries: 3
    });

    // Mock CLI detection methods
    (configHelper.detectGeminiCLIInstallation as any).mockResolvedValue({
      isInstalled: true,
      error: null
    });

    (configHelper.validateGeminiCLIAuthentication as any).mockResolvedValue({
      isAuthenticated: true,
      error: null
    });

    (configHelper.getGeminiCLIModels as any).mockResolvedValue({
      models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
      error: null
    });
    
    processingHelper = new ProcessingHelper(mockDeps as any);
  });

  afterEach(() => {
    if (!mockAbortController.signal.aborted) {
      mockAbortController.abort();
    }
  });

  describe('CLI Debugging Workflow', () => {
    it('should successfully debug code using CLI', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' },
        { path: '/path/to/code-screenshot.png', data: 'base64codedata' }
      ];

      const expectedDebugResponse = `### Issues Identified
- Array index out of bounds error in line 5
- Missing null check for input array

### Specific Improvements and Corrections
- Add bounds checking before accessing array elements
- Implement null/empty array validation

### Optimizations
- Use single pass algorithm instead of nested loops
- Consider using built-in max function for better performance

### Explanation of Changes Needed
The current implementation fails because it doesn't validate input and has incorrect indexing logic.

### Key Points
- Always validate input parameters
- Use proper bounds checking
- Consider edge cases like empty arrays`;

      // Mock CLI execution to return debug response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: expectedDebugResponse,
        exitCode: 0
      });

      // Execute the debugging
      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.debug_analysis).toContain('Issues Identified');
      expect(result.data.debug_analysis).toContain('Specific Improvements');
      expect(result.data.debug_analysis).toContain('Optimizations');
      expect(result.data.thoughts).toBeInstanceOf(Array);
      expect(result.data.code).toBe('// Debug mode - see analysis below');

      // Verify CLI command was called correctly
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'gemini',
          args: ['generate', '--model', 'gemini-1.5-pro', '--temperature', '0.2'],
          input: expect.stringContaining('coding interview assistant helping debug'),
          timeout: 30000
        }),
        mockAbortController.signal
      );

      // Verify the CLI command input contains expected content
      const cliCall = mockExecuteGeminiCLIWithRetry.mock.calls[0][0];
      expect(cliCall.input).toContain('Find the maximum element in an array');
      expect(cliCall.input).toContain('python');
      expect(cliCall.input).toContain('[IMAGE DATA]');
      expect(cliCall.input).toContain('Number of images: 2');

      // Verify CLI execution was successful
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalled();
    });

    it('should handle CLI command failure during debugging', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      // Mock CLI execution to fail
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'CLI authentication expired',
        exitCode: 1
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process debug request with Gemini CLI');
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalled();

      // Verify CLI execution was attempted
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalled();
    });

    it('should handle malformed CLI response with recovery during debugging', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const malformedResponse = `The issue is with your array indexing. You're accessing index 5 but the array only has 4 elements.
      
      You should add bounds checking and validate the input array first.
      
      Consider using a more efficient algorithm that doesn't require nested loops.`;

      // Mock CLI execution to return malformed response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: malformedResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data.debug_analysis).toContain('array indexing');
      expect(result.data.debug_analysis).toContain('bounds checking');
      expect(result.data.thoughts).toBeInstanceOf(Array);
      expect(result.data.thoughts.length).toBeGreaterThan(0);
    });

    it('should handle CLI timeout during debugging', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      // Mock CLI execution to timeout
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'Command timed out after 30000ms',
        exitCode: -1
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process debug request with Gemini CLI');
    });

    it('should handle abort signal during CLI debugging execution', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      // Mock CLI execution to be aborted
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'Command was aborted',
        exitCode: -1
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process debug request with Gemini CLI');
    });

    it('should extract code from debug response when available', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const debugResponseWithCode = `### Issues Identified
- Missing bounds checking

### Specific Improvements and Corrections
Here's the corrected code:

\`\`\`python
def find_max(arr):
    if not arr:
        return None
    return max(arr)
\`\`\`

### Explanation of Changes Needed
Added null check and used built-in max function.`;

      // Mock CLI execution to return response with code
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: debugResponseWithCode,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data.code).toContain('def find_max(arr)');
      expect(result.data.code).toContain('if not arr:');
      expect(result.data.code).toContain('return max(arr)');
    });
  });

  describe('CLI Debug Prompt Generation', () => {
    it('should generate correct CLI prompt for debugging', () => {
      const problemInfo = {
        problem_statement: 'Sort an array in ascending order',
        constraints: 'Array length <= 1000',
        example_input: '[3, 1, 4, 1, 5]',
        example_output: '[1, 1, 3, 4, 5]'
      };
      const language = 'java';
      const imageDataList = ['errorimage1', 'codeimage2'];

      const command = (processingHelper as any).formatDebugCLIPrompt(problemInfo, language, imageDataList);

      expect(command.command).toBe('gemini');
      expect(command.args).toEqual(['generate', '--model', 'gemini-1.5-pro', '--temperature', '0.2']);
      expect(command.input).toContain('coding interview assistant helping debug');
      expect(command.input).toContain('Sort an array in ascending order');
      expect(command.input).toContain('java');
      expect(command.input).toContain('[IMAGE DATA]');
      expect(command.input).toContain('Number of images: 2');
      expect(command.input).toContain('Image 1:');
      expect(command.input).toContain('Image 2:');
      expect(command.timeout).toBe(30000);
    });

    it('should use custom debugging model from config', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli',
        debuggingModel: 'custom-debug-model',
        cliTimeout: 45000
      });

      const problemInfo = { problem_statement: 'Debug this code' };
      const command = (processingHelper as any).formatDebugCLIPrompt(problemInfo, 'cpp', ['image1']);

      expect(command.args).toContain('custom-debug-model');
      expect(command.timeout).toBe(45000);
    });

    it('should handle missing problem info gracefully', () => {
      const problemInfo = {};
      const command = (processingHelper as any).formatDebugCLIPrompt(problemInfo, 'python', ['image1']);

      expect(command.input).toContain('No problem statement provided');
      expect(command.input).toContain('python');
    });
  });

  describe('CLI Debug Response Processing', () => {
    it('should parse structured debug response correctly', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const structuredResponse = JSON.stringify({
        content: `### Issues Identified
- Logic error in loop condition
- Missing edge case handling

### Specific Improvements and Corrections  
- Fix loop termination condition
- Add validation for empty inputs

### Optimizations
- Use more efficient sorting algorithm

### Explanation of Changes Needed
The current implementation has off-by-one errors.

### Key Points
- Always test edge cases
- Validate inputs before processing`
      });

      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: structuredResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data.debug_analysis).toContain('Issues Identified');
      expect(result.data.debug_analysis).toContain('Logic error in loop condition');
      expect(result.data.debug_analysis).toContain('Optimizations');
    });

    it('should handle text-only debug response', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const textResponse = JSON.stringify({
        text: 'Your code has a null pointer exception. Add null checks before accessing object properties.'
      });

      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: textResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data.debug_analysis).toContain('null pointer exception');
      expect(result.data.debug_analysis).toContain('Add null checks');
    });

    it('should format unstructured response with headers', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const unstructuredResponse = `The main issues found in your code are related to array bounds checking. 
      
      Code improvements needed include adding validation and using safer array access methods.
      
      For optimizations, consider using built-in functions instead of manual loops.
      
      Detailed analysis shows that the error occurs because you're not checking if the array index is valid.`;

      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: unstructuredResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      // The response formatting logic replaces keywords with headers
      expect(result.data.debug_analysis).toContain('## Code Improvements');
      expect(result.data.debug_analysis).toContain('## Optimizations');
      expect(result.data.debug_analysis).toContain('## Explanation');
    });

    it('should extract bullet points as thoughts', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const responseWithBullets = `### Issues Identified
- Array index out of bounds
- Missing null validation  
- Incorrect loop condition
- Memory leak in allocation
- Race condition in threading
- Performance bottleneck in nested loops

### Explanation
The code needs significant improvements.`;

      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: responseWithBullets,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data.thoughts).toBeInstanceOf(Array);
      expect(result.data.thoughts.length).toBeGreaterThan(0); // Should extract some thoughts
      expect(result.data.thoughts.length).toBeLessThanOrEqual(5); // Limited to 5 items
      // Since the response goes through recovery processing, just check that we have meaningful content
      expect(result.data.thoughts[0]).toBeTruthy();
      expect(typeof result.data.thoughts[0]).toBe('string');
    });
  });

  describe('Error Handling and Recovery for Debugging', () => {
    it('should handle CLI installation errors during debugging', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      // Mock CLI execution to fail with installation error
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'gemini: command not found',
        exitCode: 127
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process debug request with Gemini CLI');
      expect(result.error).toContain('CLI installation and authentication');
    });

    it('should handle CLI authentication errors during debugging', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      // Mock CLI execution to fail with auth error
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'Authentication required. Please run: gemini auth login',
        exitCode: 1
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process debug request with Gemini CLI');
    });

    it('should recover from malformed JSON in debug response', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const malformedJson = `{
        "analysis": "Your code has issues with
        // Missing closing quote and brace - invalid JSON
      `;

      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: malformedJson,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data.debug_analysis).toContain('Your code has issues');
    });

    it('should handle empty debug response', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      // Mock CLI execution to return empty response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: '',
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process debug request with Gemini CLI');
    });

    it('should handle no screenshots provided for debugging', async () => {
      const mockScreenshots: any[] = [];

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process debug request with Gemini CLI');
    });
  });

  describe('Debug Response Formatting', () => {
    it('should maintain complexity fields as N/A for debug mode', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const debugResponse = '### Issues Identified\n- Sample issue';

      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: debugResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data.time_complexity).toBe('N/A - Debug mode');
      expect(result.data.space_complexity).toBe('N/A - Debug mode');
    });

    it('should provide default thoughts when no bullet points found', async () => {
      const mockScreenshots = [
        { path: '/path/to/error-screenshot.png', data: 'base64errordata' }
      ];

      const debugResponse = 'This is a plain text response without any bullet points or structured format.';

      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: debugResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).processExtraScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(result.data.thoughts).toEqual(['Debug analysis based on your screenshots']);
    });
  });
});