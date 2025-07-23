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

describe('CLI-based Solution Generation Integration', () => {
  let processingHelper: ProcessingHelper;
  let mockAbortController: AbortController;

  const mockProblemInfo = {
    problem_statement: 'Given an array of integers, find two numbers such that they add up to a specific target number.',
    constraints: 'Each input would have exactly one solution, and you may not use the same element twice.',
    example_input: 'nums = [2,7,11,15], target = 9',
    example_output: '[0,1]'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAbortController = new AbortController();

    // Mock default CLI config
    (configHelper.loadConfig as any).mockReturnValue({
      apiProvider: 'gemini-cli',
      extractionModel: 'gemini-2.0-flash',
      solutionModel: 'gemini-1.5-pro',
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

    // Mock problem info
    mockDeps.getProblemInfo.mockReturnValue(mockProblemInfo);

    processingHelper = new ProcessingHelper(mockDeps as any);
  });

  afterEach(() => {
    if (!mockAbortController.signal.aborted) {
      mockAbortController.abort();
    }
  });

  describe('CLI Solution Generation Workflow', () => {
    it('should successfully generate solution using CLI', async () => {
      const expectedSolutionResponse = `
Here's the solution for the Two Sum problem:

\`\`\`python
def twoSum(nums, target):
    num_map = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in num_map:
            return [num_map[complement], i]
        num_map[num] = i
    return []
\`\`\`

**Your Thoughts:**
- Use a hashmap to store numbers and their indices as we iterate
- For each number, check if its complement exists in the hashmap
- This allows us to find the solution in a single pass

**Time complexity:** O(n) because we iterate through the array only once. Each hashmap lookup and insertion is O(1) on average, so the overall complexity remains linear.

**Space complexity:** O(n) because in the worst case, we store all elements in the hashmap before finding the solution. The space usage scales linearly with the input size.
`;

      // Mock CLI execution to return solution response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: expectedSolutionResponse,
        exitCode: 0
      });

      // Execute solution generation
      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('code');
      expect(result.data).toHaveProperty('thoughts');
      expect(result.data).toHaveProperty('time_complexity');
      expect(result.data).toHaveProperty('space_complexity');

      // Verify CLI command was called correctly
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'gemini',
          args: ['generate', '--model', 'gemini-1.5-pro', '--temperature', '0.2'],
          input: expect.stringContaining('Generate a detailed solution'),
          timeout: 30000
        }),
        mockAbortController.signal
      );

      // Verify the CLI command input contains problem details
      const cliCall = mockExecuteGeminiCLIWithRetry.mock.calls[0][0] as any;
      expect(cliCall.input).toContain('find two numbers such that they add up');
      expect(cliCall.input).toContain('nums = [2,7,11,15], target = 9');
      expect(cliCall.input).toContain('[0,1]');
      expect(cliCall.input).toContain('python');

      // Verify parsed response structure
      expect(result.data.code).toContain('def twoSum');
      expect(result.data.thoughts).toContain('Use a hashmap to store numbers');
      expect(result.data.time_complexity).toContain('O(n)');
      expect(result.data.space_complexity).toContain('O(n)');
    });

    it('should handle CLI command failure during solution generation', async () => {
      // Mock CLI execution to fail
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'CLI authentication expired',
        exitCode: 1
      });

      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate solution with Gemini CLI');
      expect(mockExecuteGeminiCLIWithRetry).toHaveBeenCalled();
    });

    it('should handle malformed CLI response with recovery', async () => {
      const malformedResponse = `
This is a working solution for the two sum problem:

def twoSum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []

The approach uses nested loops to check all pairs.
Time complexity is O(n²) and space complexity is O(1).
`;

      // Mock CLI execution to return malformed response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: malformedResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('code');
      expect(result.data).toHaveProperty('thoughts');

      // Verify that recovery was attempted and content was extracted
      expect(result.data.code).toContain('def twoSum');
      expect(result.data.thoughts).toEqual(['Solution approach based on efficiency and readability']);
    });

    it('should handle JSON response format from CLI', async () => {
      const jsonResponse = JSON.stringify({
        code: `def twoSum(nums, target):
    num_map = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in num_map:
            return [num_map[complement], i]
        num_map[num] = i
    return []`,
        thoughts: [
          'Use hashmap for O(1) lookups',
          'Single pass through array',
          'Store complement mapping'
        ],
        time_complexity: 'O(n) - Linear time as we iterate once',
        space_complexity: 'O(n) - Hashmap storage in worst case'
      });

      // Mock CLI execution to return JSON response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: jsonResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(result.success).toBe(true);
      expect(result.data.code).toContain('def twoSum');
      expect(result.data.thoughts).toEqual([
        'Use hashmap for O(1) lookups',
        'Single pass through array',
        'Store complement mapping'
      ]);
      expect(result.data.time_complexity).toContain('O(n)');
      expect(result.data.space_complexity).toContain('O(n)');
    });

    it('should handle CLI timeout during solution generation', async () => {
      // Mock CLI execution to timeout
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'Command timed out after 30000ms',
        exitCode: -1
      });

      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate solution with Gemini CLI');
    });

    it('should handle abort signal during solution generation', async () => {
      // Mock CLI execution to be aborted
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: false,
        error: 'Command was aborted',
        exitCode: -1
      });

      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate solution with Gemini CLI');
    });
  });

  describe('CLI Solution Prompt Generation', () => {
    it('should generate correct CLI prompt for solution generation', () => {
      const command = (processingHelper as any).formatSolutionCLIPrompt(mockProblemInfo, 'python');

      expect(command.command).toBe('gemini');
      expect(command.args).toEqual(['generate', '--model', 'gemini-1.5-pro', '--temperature', '0.2']);
      expect(command.input).toContain('Generate a detailed solution');
      expect(command.input).toContain('find two numbers such that they add up');
      expect(command.input).toContain('nums = [2,7,11,15], target = 9');
      expect(command.input).toContain('[0,1]');
      expect(command.input).toContain('python');
      expect(command.input).toContain('Time complexity: O(X)');
      expect(command.input).toContain('Space complexity: O(X)');
      expect(command.timeout).toBe(30000);
    });

    it('should use custom solution model from config', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli',
        solutionModel: 'custom-solution-model',
        cliTimeout: 45000
      });

      const command = (processingHelper as any).formatSolutionCLIPrompt(mockProblemInfo, 'java');

      expect(command.args).toContain('custom-solution-model');
      expect(command.input).toContain('java');
      expect(command.timeout).toBe(45000);
    });

    it('should handle missing problem information gracefully', () => {
      const incompleteProblemInfo = {
        problem_statement: 'Find the maximum element'
        // Missing constraints, example_input, example_output
      };

      const command = (processingHelper as any).formatSolutionCLIPrompt(incompleteProblemInfo, 'javascript');

      expect(command.input).toContain('Find the maximum element');
      expect(command.input).toContain('No specific constraints provided');
      expect(command.input).toContain('No example input provided');
      expect(command.input).toContain('No example output provided');
      expect(command.input).toContain('javascript');
    });
  });

  describe('Solution Response Parsing and Formatting', () => {
    it('should extract code from markdown code blocks', () => {
      const responseWithCodeBlock = `
Here's the solution:

\`\`\`python
def solution():
    return "Hello World"
\`\`\`

This is a simple solution.
`;

      // Mock CLI execution
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: responseWithCodeBlock,
        exitCode: 0
      });

      return (processingHelper as any).generateSolutionsHelper(mockAbortController.signal).then((result: any) => {
        expect(result.success).toBe(true);
        expect(result.data.code).toBe('def solution():\n    return "Hello World"');
      });
    });

    it('should extract thoughts from bullet points', () => {
      const responseWithBulletPoints = `
**Your Thoughts:**
- Use a hashmap for efficient lookups
- Iterate through the array once
- Check for complement at each step

Time complexity: O(n)
`;

      // Mock CLI execution
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: responseWithBulletPoints,
        exitCode: 0
      });

      return (processingHelper as any).generateSolutionsHelper(mockAbortController.signal).then((result: any) => {
        expect(result.success).toBe(true);
        expect(result.data.thoughts).toEqual([
          'Use a hashmap for efficient lookups',
          'Iterate through the array once',
          'Check for complement at each step'
        ]);
      });
    });

    it('should extract thoughts from numbered lists', () => {
      const responseWithNumberedList = `
**Reasoning:**
1. Create a hashmap to store values and indices
2. For each element, calculate its complement
3. Check if complement exists in hashmap
4. Return indices if found, otherwise continue

Time complexity: O(n)
`;

      // Mock CLI execution
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: responseWithNumberedList,
        exitCode: 0
      });

      return (processingHelper as any).generateSolutionsHelper(mockAbortController.signal).then((result: any) => {
        expect(result.success).toBe(true);
        expect(result.data.thoughts).toEqual([
          'Create a hashmap to store values and indices',
          'For each element, calculate its complement',
          'Check if complement exists in hashmap',
          'Return indices if found, otherwise continue'
        ]);
      });
    });

    it('should extract and format complexity information', () => {
      const responseWithComplexity = `
Code here...

Time complexity: O(n) because we iterate through the array only once. Each hashmap operation is O(1) on average.

Space complexity: O(n) because we store up to n elements in the hashmap. In the worst case, we need to store all elements before finding the solution.
`;

      // Mock CLI execution
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: responseWithComplexity,
        exitCode: 0
      });

      return (processingHelper as any).generateSolutionsHelper(mockAbortController.signal).then((result: any) => {
        expect(result.success).toBe(true);
        expect(result.data.time_complexity).toContain('O(n)');
        expect(result.data.time_complexity).toContain('iterate through the array only once');
        expect(result.data.space_complexity).toContain('O(n)');
        expect(result.data.space_complexity).toContain('store up to n elements');
      });
    });

    it('should provide default complexity when not found in response', () => {
      const responseWithoutComplexity = `
\`\`\`python
def solution():
    return "result"
\`\`\`

This is a simple solution.
`;

      // Mock CLI execution
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: responseWithoutComplexity,
        exitCode: 0
      });

      return (processingHelper as any).generateSolutionsHelper(mockAbortController.signal).then((result: any) => {
        expect(result.success).toBe(true);
        expect(result.data.time_complexity).toContain('O(n)');
        expect(result.data.time_complexity).toContain('Linear time complexity');
        expect(result.data.space_complexity).toContain('O(n)');
        expect(result.data.space_complexity).toContain('Linear space complexity');
      });
    });
  });

  describe('Error Handling and Validation', () => {
    it('should validate solution response structure', () => {
      const validSolutionData = {
        code: 'def solution(): pass',
        thoughts: ['Valid thought'],
        time_complexity: 'O(n) - explanation',
        space_complexity: 'O(1) - explanation'
      };

      const result = (processingHelper as any).validateCLIResponseStructure(validSolutionData);
      expect(result.valid).toBe(true);
    });

    it('should handle CLI provider not ready', async () => {
      // Mock CLI as not ready
      vi.spyOn(processingHelper, 'isCLIProviderReady').mockReturnValue(false);

      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate solution with Gemini CLI');
    });

    it('should handle missing problem info', async () => {
      // Mock no problem info
      mockDeps.getProblemInfo.mockReturnValue(null);

      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No problem info available');
    });

    it('should handle CLI response parsing errors gracefully', async () => {
      const invalidResponse = 'This is not valid JSON or structured response';

      // Mock CLI execution to return invalid response
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: invalidResponse,
        exitCode: 0
      });

      const result = await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      // Should still succeed with recovery
      expect(result.success).toBe(true);
      expect(result.data.code).toContain('not valid JSON');
    });
  });

  describe('Configuration and Model Selection', () => {
    it('should respect custom CLI timeout configuration', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli',
        solutionModel: 'gemini-2.0-flash',
        cliTimeout: 60000
      });

      const command = (processingHelper as any).formatSolutionCLIPrompt(mockProblemInfo, 'python');

      expect(command.timeout).toBe(60000);
    });

    it('should use default model when not specified in config', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli'
        // No solutionModel specified
      });

      const command = (processingHelper as any).formatSolutionCLIPrompt(mockProblemInfo, 'python');

      expect(command.args).toContain('gemini-2.0-flash'); // Default model
    });

    it('should handle different programming languages', () => {
      const languages = ['python', 'java', 'javascript', 'cpp', 'go'];

      languages.forEach(language => {
        const command = (processingHelper as any).formatSolutionCLIPrompt(mockProblemInfo, language);
        expect(command.input).toContain(language);
        expect(command.input).toContain(`implementation in ${language}`);
      });
    });
  });

  describe('Progress Updates and User Feedback', () => {
    it('should send progress updates during solution generation', async () => {
      const mockSend = mockDeps.getMainWindow().webContents.send;

      // Mock CLI execution
      const mockExecuteGeminiCLIWithRetry = vi.spyOn(processingHelper as any, 'executeGeminiCLIWithRetry');
      mockExecuteGeminiCLIWithRetry.mockResolvedValue({
        success: true,
        output: 'def solution(): pass',
        exitCode: 0
      });

      await (processingHelper as any).generateSolutionsHelper(mockAbortController.signal);

      expect(mockSend).toHaveBeenCalledWith('processing-status', {
        message: 'Creating optimal solution with detailed explanations...',
        progress: 60
      });
    });
  });
});