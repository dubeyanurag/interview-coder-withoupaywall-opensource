import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConfigHelper } from '../electron/ConfigHelper'
import { EventEmitter } from 'events'

// Mock child_process
const mockSpawn = vi.fn()
vi.mock('child_process', () => ({
  spawn: mockSpawn
}))

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data')
  }
}))

// Mock fs operations
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
}))

// Mock path operations
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn(() => '/mock/dir')
  }
}))

describe('ConfigHelper CLI Detection', () => {
  let configHelper: ConfigHelper
  let mockProcess: any

  beforeEach(() => {
    vi.clearAllMocks()
    configHelper = new ConfigHelper()
    
    // Create a mock process object
    mockProcess = new EventEmitter()
    mockProcess.stdout = new EventEmitter()
    mockProcess.stderr = new EventEmitter()
    mockProcess.kill = vi.fn()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('detectGeminiCLIInstallation', () => {
    it('should detect CLI installation with valid version', async () => {
      // Setup mock spawn to return successful process
      mockSpawn.mockReturnValue(mockProcess)

      // Start the detection
      const detectionPromise = configHelper.detectGeminiCLIInstallation()

      // Simulate successful version output
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini 1.2.3\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await detectionPromise

      expect(result).toEqual({
        isInstalled: true,
        version: '1.2.3',
        isCompatible: true,
        error: undefined
      })
      expect(mockSpawn).toHaveBeenCalledWith('gemini', ['--version'], {
        stdio: 'pipe',
        shell: true
      })
    })

    it('should detect CLI installation with incompatible version', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const detectionPromise = configHelper.detectGeminiCLIInstallation()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini 0.5.0\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await detectionPromise

      expect(result).toEqual({
        isInstalled: true,
        version: '0.5.0',
        isCompatible: false,
        error: 'Gemini CLI version 0.5.0 is not compatible. Please update to a supported version.'
      })
    })

    it('should handle CLI not found', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const detectionPromise = configHelper.detectGeminiCLIInstallation()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'command not found: gemini')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await detectionPromise

      expect(result).toEqual({
        isInstalled: false,
        isCompatible: false,
        error: 'command not found: gemini'
      })
    })

    it('should handle process execution error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const detectionPromise = configHelper.detectGeminiCLIInstallation()

      setTimeout(() => {
        mockProcess.emit('error', new Error('ENOENT: no such file or directory'))
      }, 10)

      const result = await detectionPromise

      expect(result).toEqual({
        isInstalled: false,
        isCompatible: false,
        error: 'Failed to execute Gemini CLI: ENOENT: no such file or directory'
      })
    })

    it('should handle timeout', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const detectionPromise = configHelper.detectGeminiCLIInstallation()

      // Don't emit any events, let it timeout naturally
      const result = await detectionPromise

      expect(result).toEqual({
        isInstalled: false,
        isCompatible: false,
        error: 'Gemini CLI command timed out'
      })
      expect(mockProcess.kill).toHaveBeenCalled()
    }, 10000)

    it('should handle unknown version format', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const detectionPromise = configHelper.detectGeminiCLIInstallation()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'some unknown output format\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await detectionPromise

      expect(result).toEqual({
        isInstalled: true,
        version: 'unknown',
        isCompatible: false,
        error: 'Gemini CLI version unknown is not compatible. Please update to a supported version.'
      })
    })
  })

  describe('parseGeminiCLIVersion', () => {
    it('should parse version from "gemini 1.2.3" format', () => {
      const configHelperInstance = configHelper as any
      const version = configHelperInstance.parseGeminiCLIVersion('gemini 1.2.3')
      expect(version).toBe('1.2.3')
    })

    it('should parse version from "version 1.2.3" format', () => {
      const configHelperInstance = configHelper as any
      const version = configHelperInstance.parseGeminiCLIVersion('version 1.2.3')
      expect(version).toBe('1.2.3')
    })

    it('should parse standalone version numbers', () => {
      const configHelperInstance = configHelper as any
      const version = configHelperInstance.parseGeminiCLIVersion('1.2.3')
      expect(version).toBe('1.2.3')
    })

    it('should return "unknown" for unparseable output', () => {
      const configHelperInstance = configHelper as any
      const version = configHelperInstance.parseGeminiCLIVersion('no version info here')
      expect(version).toBe('unknown')
    })
  })

  describe('isGeminiCLIVersionCompatible', () => {
    it('should return false for unknown version', () => {
      const configHelperInstance = configHelper as any
      const isCompatible = configHelperInstance.isGeminiCLIVersionCompatible('unknown')
      expect(isCompatible).toBe(false)
    })

    it('should return true for compatible versions', () => {
      const configHelperInstance = configHelper as any
      
      expect(configHelperInstance.isGeminiCLIVersionCompatible('1.0.0')).toBe(true)
      expect(configHelperInstance.isGeminiCLIVersionCompatible('1.0.1')).toBe(true)
      expect(configHelperInstance.isGeminiCLIVersionCompatible('1.1.0')).toBe(true)
      expect(configHelperInstance.isGeminiCLIVersionCompatible('2.0.0')).toBe(true)
    })

    it('should return false for incompatible versions', () => {
      const configHelperInstance = configHelper as any
      
      expect(configHelperInstance.isGeminiCLIVersionCompatible('0.9.9')).toBe(false)
      expect(configHelperInstance.isGeminiCLIVersionCompatible('0.5.0')).toBe(false)
    })

    it('should handle malformed version strings', () => {
      const configHelperInstance = configHelper as any
      
      expect(configHelperInstance.isGeminiCLIVersionCompatible('1.2')).toBe(false)
      expect(configHelperInstance.isGeminiCLIVersionCompatible('invalid')).toBe(false)
      expect(configHelperInstance.isGeminiCLIVersionCompatible('')).toBe(false)
    })
  })

  describe('validateGeminiCLIAuthentication', () => {
    it('should detect authenticated status with Google OAuth', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Authenticated with Google account (OAuth)\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: true,
        authMethod: 'Google OAuth'
      })
      expect(mockSpawn).toHaveBeenCalledWith('gemini', ['auth', 'status'], {
        stdio: 'pipe',
        shell: true
      })
    })

    it('should detect authenticated status with service account', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Authenticated with service account\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: true,
        authMethod: 'Service Account'
      })
    })

    it('should detect not authenticated status', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Not authenticated\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Gemini CLI is not authenticated. Please run "gemini auth login" to authenticate with your Google account.'
      })
    })

    it('should handle authentication command failure', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Authentication required\n')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Gemini CLI is not authenticated. Please run "gemini auth login" to authenticate with your Google account.'
      })
    })

    it('should handle expired token error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Token expired\n')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Authentication token has expired. Please run "gemini auth login" to re-authenticate.'
      })
    })

    it('should handle invalid credentials error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Invalid credentials\n')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Invalid authentication credentials. Please run "gemini auth login" to re-authenticate with valid credentials.'
      })
    })

    it('should handle permission denied error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Permission denied\n')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Access denied. Please ensure your account has the necessary permissions to use Gemini API.'
      })
    })

    it('should handle quota exceeded error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Quota exceeded\n')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'API quota exceeded or rate limit reached. Please check your Gemini API usage limits.'
      })
    })

    it('should handle network connection error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Network connection failed\n')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Network connection error. Please check your internet connection and try again.'
      })
    })

    it('should handle process execution error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.emit('error', new Error('Command failed'))
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Failed to check authentication status: Command failed'
      })
    })

    it('should handle timeout', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      // Don't emit any events, let it timeout
      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Authentication check timed out'
      })
      expect(mockProcess.kill).toHaveBeenCalled()
    }, 15000)

    it('should handle unknown output format', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const authPromise = configHelper.validateGeminiCLIAuthentication()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Some unknown status output\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await authPromise

      expect(result).toEqual({
        isAuthenticated: false,
        error: 'Gemini CLI is not authenticated. Please run "gemini auth login" to authenticate with your Google account.'
      })
    })
  })

  describe('parseGeminiCLIAuthStatus', () => {
    it('should parse authenticated status with Google OAuth', () => {
      const configHelperInstance = configHelper as any
      const result = configHelperInstance.parseGeminiCLIAuthStatus('Authenticated with Google account')
      expect(result).toEqual({
        isAuthenticated: true,
        method: 'Google OAuth'
      })
    })

    it('should parse authenticated status with service account', () => {
      const configHelperInstance = configHelper as any
      const result = configHelperInstance.parseGeminiCLIAuthStatus('Authenticated with service account')
      expect(result).toEqual({
        isAuthenticated: true,
        method: 'Service Account'
      })
    })

    it('should parse authenticated status with API key', () => {
      const configHelperInstance = configHelper as any
      const result = configHelperInstance.parseGeminiCLIAuthStatus('Authenticated with API key')
      expect(result).toEqual({
        isAuthenticated: true,
        method: 'API Key'
      })
    })

    it('should parse not authenticated status', () => {
      const configHelperInstance = configHelper as any
      const result = configHelperInstance.parseGeminiCLIAuthStatus('Not authenticated')
      expect(result).toEqual({
        isAuthenticated: false
      })
    })

    it('should handle unknown output format', () => {
      const configHelperInstance = configHelper as any
      const result = configHelperInstance.parseGeminiCLIAuthStatus('Unknown status output')
      expect(result).toEqual({
        isAuthenticated: false
      })
    })
  })

  describe('parseGeminiCLIAuthError', () => {
    it('should parse authentication required error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIAuthError('Authentication required')
      expect(error).toBe('Gemini CLI is not authenticated. Please run "gemini auth login" to authenticate with your Google account.')
    })

    it('should parse expired token error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIAuthError('Token expired')
      expect(error).toBe('Authentication token has expired. Please run "gemini auth login" to re-authenticate.')
    })

    it('should parse invalid credentials error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIAuthError('Invalid credentials')
      expect(error).toBe('Invalid authentication credentials. Please run "gemini auth login" to re-authenticate with valid credentials.')
    })

    it('should parse permission denied error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIAuthError('Permission denied')
      expect(error).toBe('Access denied. Please ensure your account has the necessary permissions to use Gemini API.')
    })

    it('should parse quota exceeded error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIAuthError('Quota exceeded')
      expect(error).toBe('API quota exceeded or rate limit reached. Please check your Gemini API usage limits.')
    })

    it('should parse network error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIAuthError('Network connection failed')
      expect(error).toBe('Network connection error. Please check your internet connection and try again.')
    })

    it('should handle generic error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIAuthError('Some unknown error')
      expect(error).toBe('Authentication error: Some unknown error')
    })

    it('should handle empty error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIAuthError('')
      expect(error).toBe('Authentication error: Unknown authentication issue. Please run "gemini auth login" to authenticate.')
    })
  })

  describe('testGeminiCLI integration', () => {
    it('should return valid when CLI is installed and authenticated', async () => {
      // Mock successful installation detection
      vi.spyOn(configHelper as any, 'checkGeminiCLIInstallation').mockResolvedValue(true)
      vi.spyOn(configHelper, 'validateGeminiCLIAuthentication').mockResolvedValue({
        isAuthenticated: true,
        authMethod: 'Google OAuth'
      })

      const result = await configHelper.testApiKey('', 'gemini-cli')

      expect(result).toEqual({
        valid: true
      })
    })

    it('should return error when CLI is not installed', async () => {
      vi.spyOn(configHelper as any, 'checkGeminiCLIInstallation').mockResolvedValue(false)

      const result = await configHelper.testApiKey('', 'gemini-cli')

      expect(result).toEqual({
        valid: false,
        error: 'Gemini CLI is not installed. Please install the Gemini CLI and ensure it is available in your system PATH.'
      })
    })

    it('should return error when CLI is not authenticated', async () => {
      vi.spyOn(configHelper as any, 'checkGeminiCLIInstallation').mockResolvedValue(true)
      vi.spyOn(configHelper, 'validateGeminiCLIAuthentication').mockResolvedValue({
        isAuthenticated: false,
        error: 'Not authenticated with Gemini CLI'
      })

      const result = await configHelper.testApiKey('', 'gemini-cli')

      expect(result).toEqual({
        valid: false,
        error: 'Not authenticated with Gemini CLI'
      })
    })

    it('should handle authentication validation errors', async () => {
      vi.spyOn(configHelper as any, 'checkGeminiCLIInstallation').mockResolvedValue(true)
      vi.spyOn(configHelper, 'validateGeminiCLIAuthentication').mockResolvedValue({
        isAuthenticated: false,
        error: 'Authentication token has expired. Please run "gemini auth login" to re-authenticate.'
      })

      const result = await configHelper.testApiKey('', 'gemini-cli')

      expect(result).toEqual({
        valid: false,
        error: 'Authentication token has expired. Please run "gemini auth login" to re-authenticate.'
      })
    })
  })

  describe('getGeminiCLIModels', () => {
    it('should successfully retrieve and parse models list', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini-1.5-pro\ngemini-2.0-flash\ngemini-1.0-pro\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: ['gemini-1.5-pro', 'gemini-2.0-flash'],
        error: undefined
      })
      expect(mockSpawn).toHaveBeenCalledWith('gemini', ['models', 'list'], {
        stdio: 'pipe',
        shell: true
      })
    })

    it('should handle table format output', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        const tableOutput = `
Model                Description
---                  ---
gemini-1.5-pro      Advanced model
gemini-2.0-flash    Fast model
gemini-1.0-pro      Legacy model
`
        mockProcess.stdout.emit('data', tableOutput)
        mockProcess.emit('close', 0)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: ['gemini-1.5-pro', 'gemini-2.0-flash'],
        error: undefined
      })
    })

    it('should handle JSON format output', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        const jsonOutput = `
{"name": "gemini-1.5-pro", "description": "Advanced model"}
{"name": "gemini-2.0-flash", "description": "Fast model"}
{"name": "gemini-1.0-pro", "description": "Legacy model"}
`
        mockProcess.stdout.emit('data', jsonOutput)
        mockProcess.emit('close', 0)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: ['gemini-1.5-pro', 'gemini-2.0-flash'],
        error: undefined
      })
    })

    it('should filter out incompatible models', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini-1.5-pro\ngemini-2.0-flash\ngemini-0.5-beta\nother-model\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: ['gemini-1.5-pro', 'gemini-2.0-flash'],
        error: undefined
      })
    })

    it('should handle no compatible models found', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini-0.5-beta\nother-model\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'No compatible models found'
      })
    })

    it('should handle authentication error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Authentication required')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'Authentication required to list models. Please run "gemini auth login" to authenticate.'
      })
    })

    it('should handle permission denied error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Permission denied')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'Access denied when listing models. Please ensure your account has the necessary permissions.'
      })
    })

    it('should handle quota exceeded error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Quota exceeded')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'API quota exceeded or rate limit reached when listing models.'
      })
    })

    it('should handle network connection error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Network connection failed')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'Network connection error when listing models. Please check your internet connection.'
      })
    })

    it('should handle CLI not found error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stderr.emit('data', 'command not found: gemini')
        mockProcess.emit('close', 1)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'Gemini CLI command not found. Please ensure the CLI is properly installed.'
      })
    })

    it('should handle process execution error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.emit('error', new Error('ENOENT: no such file or directory'))
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'Failed to execute models list command: ENOENT: no such file or directory'
      })
    })

    it('should handle timeout', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      // Don't emit any events, let it timeout
      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'Models list command timed out'
      })
      expect(mockProcess.kill).toHaveBeenCalled()
    }, 15000)

    it('should handle malformed output', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Invalid output format\nNo models here\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'No compatible models found'
      })
    })

    it('should handle parsing error', async () => {
      mockSpawn.mockReturnValue(mockProcess)

      // Mock parseGeminiCLIModels to throw an error
      vi.spyOn(configHelper as any, 'parseGeminiCLIModels').mockImplementation(() => {
        throw new Error('Parse error')
      })

      const modelsPromise = configHelper.getGeminiCLIModels()

      setTimeout(() => {
        mockProcess.stdout.emit('data', 'gemini-1.5-pro\n')
        mockProcess.emit('close', 0)
      }, 10)

      const result = await modelsPromise

      expect(result).toEqual({
        models: [],
        error: 'Failed to parse models list from CLI output'
      })
    })
  })

  describe('parseGeminiCLIModels', () => {
    it('should parse simple model list format', () => {
      const configHelperInstance = configHelper as any
      const output = 'gemini-1.5-pro\ngemini-2.0-flash\ngemini-1.0-pro\n'
      const models = configHelperInstance.parseGeminiCLIModels(output)
      expect(models).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.0-pro'])
    })

    it('should parse table format with headers', () => {
      const configHelperInstance = configHelper as any
      const output = `
Model                Description
---                  ---
gemini-1.5-pro      Advanced model
gemini-2.0-flash    Fast model
`
      const models = configHelperInstance.parseGeminiCLIModels(output)
      expect(models).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash'])
    })

    it('should parse JSON format output', () => {
      const configHelperInstance = configHelper as any
      const output = `
{"name": "gemini-1.5-pro", "description": "Advanced"}
{"name": "gemini-2.0-flash", "description": "Fast"}
`
      const models = configHelperInstance.parseGeminiCLIModels(output)
      expect(models).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash'])
    })

    it('should parse mixed format output', () => {
      const configHelperInstance = configHelper as any
      const output = `
Available models:
gemini-1.5-pro    Advanced reasoning
gemini-2.0-flash  Fast responses
Other info here
`
      const models = configHelperInstance.parseGeminiCLIModels(output)
      expect(models).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash'])
    })

    it('should handle empty output', () => {
      const configHelperInstance = configHelper as any
      const models = configHelperInstance.parseGeminiCLIModels('')
      expect(models).toEqual([])
    })

    it('should remove duplicates', () => {
      const configHelperInstance = configHelper as any
      const output = 'gemini-1.5-pro\ngemini-1.5-pro\ngemini-2.0-flash\n'
      const models = configHelperInstance.parseGeminiCLIModels(output)
      expect(models).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash'])
    })

    it('should ignore non-gemini models', () => {
      const configHelperInstance = configHelper as any
      const output = 'gemini-1.5-pro\nopenai-gpt4\nanthropic-claude\ngemini-2.0-flash\n'
      const models = configHelperInstance.parseGeminiCLIModels(output)
      expect(models).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash'])
    })
  })

  describe('filterCompatibleModels', () => {
    it('should filter to only supported models', () => {
      const configHelperInstance = configHelper as any
      const models = ['gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.0-pro', 'other-model']
      const filtered = configHelperInstance.filterCompatibleModels(models)
      expect(filtered).toEqual(['gemini-1.5-pro', 'gemini-2.0-flash'])
    })

    it('should handle newer compatible versions', () => {
      const configHelperInstance = configHelper as any
      const models = ['gemini-1.5-pro', 'gemini-2.1-flash', 'gemini-3.0-pro']
      const filtered = configHelperInstance.filterCompatibleModels(models)
      expect(filtered).toEqual(['gemini-1.5-pro', 'gemini-2.1-flash', 'gemini-3.0-pro'])
    })

    it('should reject older incompatible versions', () => {
      const configHelperInstance = configHelper as any
      const models = ['gemini-1.4-pro', 'gemini-1.9-flash', 'gemini-0.5-pro']
      const filtered = configHelperInstance.filterCompatibleModels(models)
      expect(filtered).toEqual([])
    })

    it('should handle empty input', () => {
      const configHelperInstance = configHelper as any
      const filtered = configHelperInstance.filterCompatibleModels([])
      expect(filtered).toEqual([])
    })
  })

  describe('isModelVersionCompatible', () => {
    it('should accept same version as supported', () => {
      const configHelperInstance = configHelper as any
      expect(configHelperInstance.isModelVersionCompatible('gemini-1.5-pro', 'gemini-1.5-pro')).toBe(true)
      expect(configHelperInstance.isModelVersionCompatible('gemini-2.0-flash', 'gemini-2.0-flash')).toBe(true)
    })

    it('should accept newer major versions', () => {
      const configHelperInstance = configHelper as any
      expect(configHelperInstance.isModelVersionCompatible('gemini-2.0-pro', 'gemini-1.5-pro')).toBe(true)
      expect(configHelperInstance.isModelVersionCompatible('gemini-3.0-flash', 'gemini-2.0-flash')).toBe(true)
    })

    it('should accept newer minor versions', () => {
      const configHelperInstance = configHelper as any
      expect(configHelperInstance.isModelVersionCompatible('gemini-1.6-pro', 'gemini-1.5-pro')).toBe(true)
      expect(configHelperInstance.isModelVersionCompatible('gemini-2.1-flash', 'gemini-2.0-flash')).toBe(true)
    })

    it('should reject older versions', () => {
      const configHelperInstance = configHelper as any
      expect(configHelperInstance.isModelVersionCompatible('gemini-1.4-pro', 'gemini-1.5-pro')).toBe(false)
      expect(configHelperInstance.isModelVersionCompatible('gemini-1.9-flash', 'gemini-2.0-flash')).toBe(false)
    })

    it('should reject different model types', () => {
      const configHelperInstance = configHelper as any
      expect(configHelperInstance.isModelVersionCompatible('gemini-1.5-flash', 'gemini-1.5-pro')).toBe(false)
      expect(configHelperInstance.isModelVersionCompatible('gemini-2.0-pro', 'gemini-2.0-flash')).toBe(false)
    })

    it('should reject malformed model names', () => {
      const configHelperInstance = configHelper as any
      expect(configHelperInstance.isModelVersionCompatible('invalid-model', 'gemini-1.5-pro')).toBe(false)
      expect(configHelperInstance.isModelVersionCompatible('gemini-1.5-pro', 'invalid-model')).toBe(false)
    })

    it('should handle parsing errors gracefully', () => {
      const configHelperInstance = configHelper as any
      expect(configHelperInstance.isModelVersionCompatible('gemini-abc-pro', 'gemini-1.5-pro')).toBe(false)
      expect(configHelperInstance.isModelVersionCompatible('gemini-1.5', 'gemini-1.5-pro')).toBe(false)
    })
  })

  describe('parseGeminiCLIModelsError', () => {
    it('should parse authentication required error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIModelsError('Authentication required')
      expect(error).toBe('Authentication required to list models. Please run "gemini auth login" to authenticate.')
    })

    it('should parse permission denied error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIModelsError('Permission denied')
      expect(error).toBe('Access denied when listing models. Please ensure your account has the necessary permissions.')
    })

    it('should parse quota exceeded error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIModelsError('Quota exceeded')
      expect(error).toBe('API quota exceeded or rate limit reached when listing models.')
    })

    it('should parse network error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIModelsError('Network connection failed')
      expect(error).toBe('Network connection error when listing models. Please check your internet connection.')
    })

    it('should parse command not found error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIModelsError('command not found: gemini')
      expect(error).toBe('Gemini CLI command not found. Please ensure the CLI is properly installed.')
    })

    it('should handle generic error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIModelsError('Some unknown error')
      expect(error).toBe('Error listing models: Some unknown error')
    })

    it('should handle empty error', () => {
      const configHelperInstance = configHelper as any
      const error = configHelperInstance.parseGeminiCLIModelsError('')
      expect(error).toBe('Error listing models: Unknown error occurred while listing models')
    })
  })
})