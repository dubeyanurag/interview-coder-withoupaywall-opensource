import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessingHelper } from '../electron/ProcessingHelper';
import { configHelper } from '../electron/ConfigHelper';

// Mock dependencies
vi.mock('../electron/ConfigHelper', () => ({
  configHelper: {
    loadConfig: vi.fn(),
    on: vi.fn()
  }
}));

vi.mock('../electron/ScreenshotHelper', () => ({
  ScreenshotHelper: vi.fn()
}));

// Mock IProcessingHelperDeps
const mockDeps = {
  getScreenshotHelper: vi.fn(),
  getMainWindow: vi.fn(),
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

describe('CLI Prompt Formatting', () => {
  let processingHelper: ProcessingHelper;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock default config
    (configHelper.loadConfig as any).mockReturnValue({
      apiProvider: 'gemini-cli',
      extractionModel: 'gemini-2.0-flash',
      solutionModel: 'gemini-2.0-flash',
      debuggingModel: 'gemini-2.0-flash',
      cliTimeout: 30000,
      cliMaxRetries: 3
    });
    
    processingHelper = new ProcessingHelper(mockDeps as any);
  });

  describe('formatCLIPrompt', () => {
    it('should format basic prompt without images', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const userPrompt = 'Help me solve this problem.';
      
      // Access private method for testing
      const result = (processingHelper as any).formatCLIPrompt(systemPrompt, userPrompt);
      
      expect(result).toBe('You are a helpful assistant.\n\nHelp me solve this problem.');
    });

    it('should format prompt with image data', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const userPrompt = 'Analyze these images.';
      const imageDataList = ['base64data1', 'base64data2'];
      
      const result = (processingHelper as any).formatCLIPrompt(systemPrompt, userPrompt, imageDataList);
      
      expect(result).toContain('You are a helpful assistant.\n\nAnalyze these images.');
      expect(result).toContain('[IMAGE DATA]');
      expect(result).toContain('Number of images: 2');
      expect(result).toContain('Image 1:');
      expect(result).toContain('Image 2:');
      expect(result).toContain('data:image/png;base64,base64data1');
      expect(result).toContain('data:image/png;base64,base64data2');
      expect(result).toContain('[END IMAGE DATA]');
      expect(result).toContain('Please analyze the provided images along with the text prompt above.');
    });

    it('should handle empty image data list', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const userPrompt = 'Help me solve this problem.';
      const imageDataList: string[] = [];
      
      const result = (processingHelper as any).formatCLIPrompt(systemPrompt, userPrompt, imageDataList);
      
      expect(result).toBe('You are a helpful assistant.\n\nHelp me solve this problem.');
      expect(result).not.toContain('[IMAGE DATA]');
    });

    it('should truncate long image data in preview', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const userPrompt = 'Analyze this image.';
      const longImageData = 'a'.repeat(200);
      const imageDataList = [longImageData];
      
      const result = (processingHelper as any).formatCLIPrompt(systemPrompt, userPrompt, imageDataList);
      
      expect(result).toContain('data:image/png;base64,' + 'a'.repeat(100) + '...');
      expect(result).not.toContain('a'.repeat(200));
    });
  });

  describe('formatCLICommand', () => {
    it('should format extraction command correctly', () => {
      const result = (processingHelper as any).formatCLICommand(
        'EXTRACTION',
        'gemini-2.0-flash',
        { language: 'python' },
        ['imagedata1']
      );
      
      expect(result.command).toBe('gemini');
      expect(result.args).toEqual(['generate', '--model', 'gemini-2.0-flash', '--temperature', '0.2']);
      expect(result.input).toContain('coding challenge interpreter');
      expect(result.input).toContain('python');
      expect(result.input).toContain('[IMAGE DATA]');
      expect(result.timeout).toBe(30000);
    });

    it('should format solution command correctly', () => {
      const problemInfo = {
        problem_statement: 'Find the sum of two numbers',
        constraints: 'Numbers are positive integers',
        example_input: '2, 3',
        example_output: '5'
      };
      
      const result = (processingHelper as any).formatCLICommand(
        'SOLUTION',
        'gemini-2.0-flash',
        {
          problem_statement: problemInfo.problem_statement,
          constraints: problemInfo.constraints,
          example_input: problemInfo.example_input,
          example_output: problemInfo.example_output,
          language: 'javascript'
        }
      );
      
      expect(result.command).toBe('gemini');
      expect(result.args).toEqual(['generate', '--model', 'gemini-2.0-flash', '--temperature', '0.2']);
      expect(result.input).toContain('expert coding interview assistant');
      expect(result.input).toContain('Find the sum of two numbers');
      expect(result.input).toContain('Numbers are positive integers');
      expect(result.input).toContain('2, 3');
      expect(result.input).toContain('5');
      expect(result.input).toContain('javascript');
    });

    it('should format debug command correctly', () => {
      const result = (processingHelper as any).formatCLICommand(
        'DEBUG',
        'gemini-2.0-flash',
        {
          problem_statement: 'Debug this code',
          language: 'java'
        },
        ['debugimage1', 'debugimage2']
      );
      
      expect(result.command).toBe('gemini');
      expect(result.args).toEqual(['generate', '--model', 'gemini-2.0-flash', '--temperature', '0.2']);
      expect(result.input).toContain('coding interview assistant helping debug');
      expect(result.input).toContain('Debug this code');
      expect(result.input).toContain('java');
      expect(result.input).toContain('Number of images: 2');
    });

    it('should handle missing variables with default values', () => {
      const result = (processingHelper as any).formatCLICommand(
        'SOLUTION',
        'gemini-2.0-flash',
        { language: 'python' } // Missing problem info
      );
      
      // The template still contains placeholders that weren't replaced
      expect(result.input).toContain('{problem_statement}');
      expect(result.input).toContain('{constraints}');
      expect(result.input).toContain('python'); // Language should be replaced
    });

    it('should replace model placeholder in args', () => {
      const result = (processingHelper as any).formatCLICommand(
        'EXTRACTION',
        'custom-model-name',
        { language: 'python' }
      );
      
      expect(result.args).toContain('custom-model-name');
      expect(result.args).not.toContain('{model}');
    });
  });

  describe('formatExtractionCLIPrompt', () => {
    it('should create extraction command with correct parameters', () => {
      const language = 'python';
      const imageDataList = ['image1', 'image2'];
      
      const result = (processingHelper as any).formatExtractionCLIPrompt(language, imageDataList);
      
      expect(result.command).toBe('gemini');
      expect(result.args).toEqual(['generate', '--model', 'gemini-2.0-flash', '--temperature', '0.2']);
      expect(result.input).toContain('coding challenge interpreter');
      expect(result.input).toContain('python');
      expect(result.input).toContain('Number of images: 2');
    });

    it('should use configured extraction model', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli',
        extractionModel: 'custom-extraction-model',
        cliTimeout: 30000
      });
      
      const result = (processingHelper as any).formatExtractionCLIPrompt('python', ['image1']);
      
      expect(result.args).toContain('custom-extraction-model');
    });
  });

  describe('formatSolutionCLIPrompt', () => {
    it('should create solution command with problem info', () => {
      const problemInfo = {
        problem_statement: 'Calculate factorial',
        constraints: 'n >= 0',
        example_input: '5',
        example_output: '120'
      };
      const language = 'javascript';
      
      const result = (processingHelper as any).formatSolutionCLIPrompt(problemInfo, language);
      
      expect(result.command).toBe('gemini');
      expect(result.input).toContain('Calculate factorial');
      expect(result.input).toContain('n >= 0');
      expect(result.input).toContain('5');
      expect(result.input).toContain('120');
      expect(result.input).toContain('javascript');
    });

    it('should handle missing problem info fields', () => {
      const problemInfo = {
        problem_statement: 'Simple problem'
        // Missing other fields
      };
      const language = 'python';
      
      const result = (processingHelper as any).formatSolutionCLIPrompt(problemInfo, language);
      
      expect(result.input).toContain('Simple problem');
      expect(result.input).toContain('No specific constraints provided');
      expect(result.input).toContain('No example input provided');
      expect(result.input).toContain('No example output provided');
    });
  });

  describe('formatDebugCLIPrompt', () => {
    it('should create debug command with problem info and images', () => {
      const problemInfo = {
        problem_statement: 'Fix this sorting algorithm'
      };
      const language = 'cpp';
      const imageDataList = ['errorimage1', 'codeimage2'];
      
      const result = (processingHelper as any).formatDebugCLIPrompt(problemInfo, language, imageDataList);
      
      expect(result.command).toBe('gemini');
      expect(result.input).toContain('coding interview assistant helping debug');
      expect(result.input).toContain('Fix this sorting algorithm');
      expect(result.input).toContain('cpp');
      expect(result.input).toContain('Number of images: 2');
      expect(result.input).toContain('### Issues Identified');
      expect(result.input).toContain('### Specific Improvements and Corrections');
    });
  });

  describe('validateCLIPrompt', () => {
    it('should validate correct prompts', () => {
      const validPrompt = 'This is a valid prompt with sufficient length.';
      
      const result = (processingHelper as any).validateCLIPrompt(validPrompt);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty prompts', () => {
      const result = (processingHelper as any).validateCLIPrompt('');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Prompt cannot be empty');
    });

    it('should reject prompts that are too short', () => {
      const result = (processingHelper as any).validateCLIPrompt('short');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Prompt too short - must be at least 10 characters');
    });

    it('should reject prompts that are too long', () => {
      const longPrompt = 'a'.repeat(50001);
      
      const result = (processingHelper as any).validateCLIPrompt(longPrompt);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Prompt too long - maximum 50000 characters allowed');
    });

    it('should reject prompts with control characters', () => {
      const promptWithControlChars = 'Valid text\x00with control chars';
      
      const result = (processingHelper as any).validateCLIPrompt(promptWithControlChars);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Prompt contains invalid control characters');
    });

    it('should accept prompts at boundary lengths', () => {
      const minLengthPrompt = 'a'.repeat(10);
      const maxLengthPrompt = 'a'.repeat(50000);
      
      const minResult = (processingHelper as any).validateCLIPrompt(minLengthPrompt);
      const maxResult = (processingHelper as any).validateCLIPrompt(maxLengthPrompt);
      
      expect(minResult.valid).toBe(true);
      expect(maxResult.valid).toBe(true);
    });
  });

  describe('CLI Command Templates', () => {
    it('should have correct template structure for EXTRACTION', () => {
      const templates = (processingHelper as any).CLI_COMMAND_TEMPLATES;
      
      expect(templates.EXTRACTION).toBeDefined();
      expect(templates.EXTRACTION.command).toBe('gemini');
      expect(templates.EXTRACTION.baseArgs).toEqual(['generate', '--model', '{model}', '--temperature', '0.2']);
      expect(templates.EXTRACTION.systemPrompt).toContain('coding challenge interpreter');
      expect(templates.EXTRACTION.userPromptTemplate).toContain('{language}');
    });

    it('should have correct template structure for SOLUTION', () => {
      const templates = (processingHelper as any).CLI_COMMAND_TEMPLATES;
      
      expect(templates.SOLUTION).toBeDefined();
      expect(templates.SOLUTION.command).toBe('gemini');
      expect(templates.SOLUTION.systemPrompt).toContain('expert coding interview assistant');
      expect(templates.SOLUTION.userPromptTemplate).toContain('{problem_statement}');
      expect(templates.SOLUTION.userPromptTemplate).toContain('{constraints}');
      expect(templates.SOLUTION.userPromptTemplate).toContain('{language}');
    });

    it('should have correct template structure for DEBUG', () => {
      const templates = (processingHelper as any).CLI_COMMAND_TEMPLATES;
      
      expect(templates.DEBUG).toBeDefined();
      expect(templates.DEBUG.command).toBe('gemini');
      expect(templates.DEBUG.systemPrompt).toContain('coding interview assistant helping debug');
      expect(templates.DEBUG.systemPrompt).toContain('### Issues Identified');
      expect(templates.DEBUG.userPromptTemplate).toContain('{problem_statement}');
      expect(templates.DEBUG.userPromptTemplate).toContain('{language}');
    });
  });

  describe('Integration with different configurations', () => {
    it('should use custom timeout from config', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli',
        extractionModel: 'gemini-2.0-flash',
        cliTimeout: 45000
      });
      
      const result = (processingHelper as any).formatExtractionCLIPrompt('python', ['image1']);
      
      expect(result.timeout).toBe(45000);
    });

    it('should use default timeout when not configured', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli',
        extractionModel: 'gemini-2.0-flash'
        // No cliTimeout specified
      });
      
      const result = (processingHelper as any).formatExtractionCLIPrompt('python', ['image1']);
      
      expect(result.timeout).toBe(30000); // Default timeout
    });

    it('should use different models for different operations', () => {
      (configHelper.loadConfig as any).mockReturnValue({
        apiProvider: 'gemini-cli',
        extractionModel: 'extraction-model',
        solutionModel: 'solution-model',
        debuggingModel: 'debug-model',
        cliTimeout: 30000
      });
      
      const extractionResult = (processingHelper as any).formatExtractionCLIPrompt('python', ['image1']);
      const solutionResult = (processingHelper as any).formatSolutionCLIPrompt({ problem_statement: 'test' }, 'python');
      const debugResult = (processingHelper as any).formatDebugCLIPrompt({ problem_statement: 'test' }, 'python', ['image1']);
      
      expect(extractionResult.args).toContain('extraction-model');
      expect(solutionResult.args).toContain('solution-model');
      expect(debugResult.args).toContain('debug-model');
    });
  });

  describe('Error handling in prompt formatting', () => {
    it('should handle null/undefined inputs gracefully', () => {
      const result = (processingHelper as any).formatCLIPrompt(null, undefined, null);
      
      expect(result).toBe('null\n\nundefined');
    });

    it('should handle empty arrays and objects', () => {
      const problemInfo = {};
      const result = (processingHelper as any).formatSolutionCLIPrompt(problemInfo, 'python');
      
      expect(result.input).toContain('No problem statement provided');
      expect(result.input).toContain('No specific constraints provided');
      expect(result.input).toContain('No example input provided');
      expect(result.input).toContain('No example output provided');
    });

    it('should validate prompt after formatting', () => {
      const systemPrompt = 'System';
      const userPrompt = 'User';
      
      const formattedPrompt = (processingHelper as any).formatCLIPrompt(systemPrompt, userPrompt);
      const validation = (processingHelper as any).validateCLIPrompt(formattedPrompt);
      
      expect(validation.valid).toBe(true);
    });
  });
});