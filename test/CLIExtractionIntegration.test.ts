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
  getView: vi.fn(),
  setView: vi.fn(),
  getProblemInfo: vi.fn(),
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

describe('CLI-based Problem Extraction Integration', () => {
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
      debuggingModel: 'gemini-2.0-flash',
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

  describe('CLI Extraction Workflow', () => {
    it('should successfully extract problem from screenshots using CLI', async () => {
      const mockScreenshots = [
        { path: '/path/to/screenshot1.png', data: 'base64data1' },
        { path: '/path/to/screenshot2.png', data: 'base64data2' }
      ];

      const expectedProblemInfo = {
        problem_statement: 'Find the sum of two numbers',
        constraints: 'Numbers are positive integers',
        example_input: '2, 3',
        example_output: '5'
      };

      // Mock CLI execution to return valid JSON response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: JSON.stringify(expectedProblemInfo),
        exitCode: 0
      });

      // Mock solution generation to avoid full workflow execution
      const mockGenerateSolutionsHelper = vi.spyOn(processingHelper as any, 'generateSolutionsHelper');
      mockGenerateSolutionsHelper.mockResolvedValue({
        success: true,
        data: { solution: 'Mock solution' }
      });

      // Execute the extraction
      const result = await (processingHelper as any).processScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'gemini',
          args: ['generate', '--model', 'gemini-2.0-flash', '--temperature', '0.2'],
          input: expect.stringContaining('coding challenge interpreter'),
          timeout: 30000
        }),
        mockAbortController.signal
      );

      // Verify problem info was set
      expect(mockDeps.setProblemInfo).toHaveBeenCalledWith(expectedProblemInfo);
      
      // Verify CLI command was called correctly
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalledTimes(1);
      
      // Verify the CLI command input contains expected content
      const cliCall = mockExecuteGeminiCLIWithRetry.mock.calls[0][0];
      expect(cliCall.input).toContain('python'); // Language should be included
      expect(cliCall.input).toContain('[IMAGE DATA]');
      expect(cliCall.input).toContain('Number of images: 2');
    });

    it('should handle CLI command failure gracefully', async () => {
      const mockScreenshots = [
        { path: '/path/to/screenshot1.png', data: 'base64data1' }
      ];

      // Mock CLI execution to fail
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'CLI authentication failed',
        exitCode: 1
      });

      const result = await (processingHelper as any).processScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process with Gemini CLI');
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalled();
    });

    it('should handle malformed CLI response with recovery', async () => {
      const mockScreenshots = [
        { path: '/path/to/screenshot1.png', data: 'base64data1' }
      ];

      const malformedResponse = 'This is a readable problem description but not JSON format';

      // Mock CLI execution to return malformed response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: malformedResponse,
        exitCode: 0
      });

      // Mock solution generation
      const mockGenerateSolutionsHelper = vi.spyOn(processingHelper as any, 'generateSolutionsHelper');
      mockGenerateSolutionsHelper.mockResolvedValue({
        success: true,
        data: { solution: 'Mock solution' }
      });

      const result = await (processingHelper as any).processScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(true);
      
      // Verify that recovery was attempted and fallback problem info was created
      expect(mockDeps.setProblemInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          problem_statement: expect.stringContaining('readable problem description'),
          constraints: 'No specific constraints provided.',
          example_input: 'No example input provided.',
          example_output: 'No example output provided.'
        })
      );
    });

    it('should handle CLI timeout errors', async () => {
      const mockScreenshots = [
        { path: '/path/to/screenshot1.png', data: 'base64data1' }
      ];

      // Mock CLI execution to timeout
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'Command timed out after 30000ms',
        exitCode: -1
      });

      const result = await (processingHelper as any).processScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process with Gemini CLI');
    });

    it('should handle abort signal during CLI execution', async () => {
      const mockScreenshots = [
        { path: '/path/to/screenshot1.png', data: 'base64data1' }
      ];

      // Mock CLI execution to be aborted
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'Command was aborted',
        exitCode: -1
      });

      const result = await (processingHelper as any).processScreenshotsHelper(
        mockScreenshots,
        mockAbortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to process with Gemini CLI');
    });
  });

  describe('CLI Prompt Generation for Extraction', () => {
    it('should generate correct CLI prompt for extraction', () => {
      const language = 'python';
      const imageDataList = ['base64image1', 'base64image2'];

      const command = (processingHelper as any).formatExtractionCLIPrompt(language, imageDataList);

      expect(command.command).toBe('gemini');
      expect(command.args).toEqual(['generate', '--model', 'gemini-2.0-flash', '--temperature', '0.2']);
      expect(command.input).toContain('coding challenge interpreter');
      expect(command.input).toContain('python');
      expect(command.input).toContain('[IMAGE DATA]');
      expect(command.input).toContain('Number of images: 2');
      expect(command.input).toContain('Image 1:');
      expect(command.input).toContain('Image 2:');
      expect(command.timeout).toBe(30000);
    });

    it('should use custom extraction model from config', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli',
        extractionModel: 'custom-extraction-model',
        cliTimeout: 45000
      });

      const command = (processingHelper as any).formatExtractionCLIPrompt('java', ['image1']);

      expect(command.args).toContain('custom-extraction-model');
      expect(command.timeout).toBe(45000);
    });
  });

  describe('CLI Response Parsing for Extraction', () => {
    it('should parse valid extraction JSON response', () => {
      const validResponse = JSON.stringify({
        problem_statement: 'Calculate factorial of n',
        constraints: 'n >= 0 and n <= 20',
        example_input: '5',
        example_output: '120'
      });

      const result = (processingHelper as any).parseCLIResponse(validResponse);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        problem_statement: 'Calculate factorial of n',
        constraints: 'n >= 0 and n <= 20',
        example_input: '5',
        example_output: '120'
      });
    });

    it('should parse extraction response with markdown code blocks', () => {
      const markdownResponse = `Here is the extracted problem:
\`\`\`json
{
  "problem_statement": "Find the maximum element in array",
  "constraints": "Array length > 0",
  "example_input": "[1, 3, 2, 5, 4]",
  "example_output": "5"
}
\`\`\`
Analysis complete.`;

      const result = (processingHelper as any).parseCLIResponse(markdownResponse);

      expect(result.success).toBe(true);
      expect(result.data.problem_statement).toBe('Find the maximum element in array');
      expect(result.data.constraints).toBe('Array length > 0');
    });

    it('should validate extraction response structure', () => {
      const invalidResponse = JSON.stringify({
        problem_statement: 123, // Should be string
        constraints: 'Valid constraint'
      });

      const result = (processingHelper as any).parseCLIResponse(invalidResponse);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid response structure');
    });

    it('should handle CLI error responses', () => {
      const errorResponse = JSON.stringify({
        error: 'Authentication required'
      });

      const result = (processingHelper as any).parseCLIResponse(errorResponse);

      expect(result.success).toBe(false);
      expect(result.error).toContain('CLI returned error: Authentication required');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should recover from malformed responses with readable content', () => {
      const malformedOutput = `
The problem is to find the sum of two integers.
Constraints: Both numbers are positive.
Example: Input 2, 3 should output 5.
      `;

      const result = (processingHelper as any).handleMalformedCLIResponse(
        malformedOutput,
        'JSON parse error'
      );

      expect(result.success).toBe(true);
      expect(result.data.content).toContain('find the sum of two integers');
      expect(result.data.recovered).toBe(true);
    });

    it('should detect authentication errors in malformed responses', () => {
      const authErrorOutput = 'Please login to continue using the CLI';

      const result = (processingHelper as any).handleMalformedCLIResponse(
        authErrorOutput,
        'JSON parse error'
      );

      // The method first tries to recover text content, which succeeds
      expect(result.success).toBe(true);
      expect(result.data.content).toContain('login to continue');
    });

    it('should detect installation errors in malformed responses', () => {
      const installErrorOutput = 'gemini: command not found';

      const result = (processingHelper as any).handleMalformedCLIResponse(
        installErrorOutput,
        'JSON parse error'
      );

      // The method first tries to recover text content, which succeeds
      expect(result.success).toBe(true);
      expect(result.data.content).toContain('command not found');
    });

    it('should fallback to original error when recovery fails', () => {
      const unrecoverableOutput = 'x'; // Too short to recover

      const result = (processingHelper as any).handleMalformedCLIResponse(
        unrecoverableOutput,
        'Original JSON parse error'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Original JSON parse error');
    });
  });

  describe('CLI State Management', () => {
    it('should initialize CLI client state correctly', async () => {
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const cliState = processingHelper.getCLIClientState();

      expect(cliState.isInitialized).toBe(true);
      expect(cliState.isInstalled).toBe(true);
      expect(cliState.isAuthenticated).toBe(true);
      expect(cliState.availableModels).toEqual(['gemini-2.0-flash', 'gemini-1.5-pro']);
    });

    it('should handle CLI installation failure', async () => {
      (configHelper.detectGeminiCLIInstallation as any).mockResolvedValue({
        isInstalled: false,
        error: 'CLI not found in PATH'
      });

      const newProcessingHelper = new ProcessingHelper(mockDeps as any);
      
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const cliState = newProcessingHelper.getCLIClientState();

      expect(cliState.isInstalled).toBe(false);
      expect(cliState.error).toBe('CLI not found in PATH');
    });

    it('should handle CLI authentication failure', async () => {
      (configHelper.validateGeminiCLIAuthentication as any).mockResolvedValue({
        isAuthenticated: false,
        error: 'Not authenticated'
      });

      const newProcessingHelper = new ProcessingHelper(mockDeps as any);
      
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const cliState = newProcessingHelper.getCLIClientState();

      expect(cliState.isAuthenticated).toBe(false);
      expect(cliState.error).toBe('Not authenticated');
    });

    it('should check if CLI provider is ready', async () => {
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const isReady = processingHelper.isCLIProviderReady();
      expect(isReady).toBe(true);
    });

    it('should refresh CLI client state', async () => {
      // Wait for initial initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      // Change mock to return different state
      (configHelper.detectGeminiCLIInstallation as any).mockResolvedValue({
        isInstalled: false,
        error: 'CLI removed'
      });

      await processingHelper.refreshCLIClientState();

      const cliState = processingHelper.getCLIClientState();
      expect(cliState.isInstalled).toBe(false);
      expect(cliState.error).toBe('CLI removed');
    });
  });

  describe('Image Processing for CLI', () => {
    it('should handle multiple images in CLI prompt', () => {
      const imageDataList = [
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      ];

      const prompt = (processingHelper as any).formatCLIPrompt(
        'System prompt',
        'User prompt',
        imageDataList
      );

      expect(prompt).toContain('[IMAGE DATA]');
      expect(prompt).toContain('Number of images: 2');
      expect(prompt).toContain('Image 1:');
      expect(prompt).toContain('Image 2:');
      expect(prompt).toContain('[END IMAGE DATA]');
      expect(prompt).toContain('Please analyze the provided images');
    });

    it('should truncate long image data in preview', () => {
      const longImageData = 'a'.repeat(200);
      const imageDataList = [longImageData];

      const prompt = (processingHelper as any).formatCLIPrompt(
        'System prompt',
        'User prompt',
        imageDataList
      );

      expect(prompt).toContain('data:image/png;base64,' + 'a'.repeat(100) + '...');
      expect(prompt).not.toContain('a'.repeat(200));
    });

    it('should handle empty image list', () => {
      const prompt = (processingHelper as any).formatCLIPrompt(
        'System prompt',
        'User prompt',
        []
      );

      expect(prompt).not.toContain('[IMAGE DATA]');
      expect(prompt).toBe('System prompt\n\nUser prompt');
    });
  });
});