// CLIConfigValidation.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConfigHelper } from '../electron/ConfigHelper'

// Mock electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data')
  }
}))

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify({
      apiKey: "",
      apiProvider: "gemini",
      extractionModel: "gemini-2.0-flash",
      solutionModel: "gemini-2.0-flash",
      debuggingModel: "gemini-2.0-flash",
      language: "python",
      opacity: 1.0,
      cliTimeout: 30000,
      cliMaxRetries: 3
    })),
    writeFileSync: vi.fn()
  }
}))

describe('CLI Configuration Validation', () => {
  let configHelper: ConfigHelper

  beforeEach(() => {
    vi.clearAllMocks()
    configHelper = new ConfigHelper()
  })

  describe('validateCLITimeout', () => {
    it('should accept valid timeout values', () => {
      const result = configHelper.validateCLITimeout(30000)
      expect(result.valid).toBe(true)
      expect(result.sanitized).toBe(30000)
      expect(result.error).toBeUndefined()
    })

    it('should reject timeout values that are too small', () => {
      const result = configHelper.validateCLITimeout(1000)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Timeout must be at least 5 seconds (5000ms)')
      expect(result.sanitized).toBe(5000)
    })

    it('should reject timeout values that are too large', () => {
      const result = configHelper.validateCLITimeout(700000)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Timeout cannot exceed 10 minutes (600000ms)')
      expect(result.sanitized).toBe(600000)
    })

    it('should reject non-numeric timeout values', () => {
      const result = configHelper.validateCLITimeout(NaN)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Timeout must be a valid number')
      expect(result.sanitized).toBe(30000) // default value
    })
  })

  describe('validateCLIMaxRetries', () => {
    it('should accept valid retry values', () => {
      const result = configHelper.validateCLIMaxRetries(3)
      expect(result.valid).toBe(true)
      expect(result.sanitized).toBe(3)
      expect(result.error).toBeUndefined()
    })

    it('should accept zero retries', () => {
      const result = configHelper.validateCLIMaxRetries(0)
      expect(result.valid).toBe(true)
      expect(result.sanitized).toBe(0)
      expect(result.error).toBeUndefined()
    })

    it('should reject negative retry values', () => {
      const result = configHelper.validateCLIMaxRetries(-1)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Max retries cannot be negative')
      expect(result.sanitized).toBe(0)
    })

    it('should reject retry values that are too large', () => {
      const result = configHelper.validateCLIMaxRetries(15)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Max retries cannot exceed 10')
      expect(result.sanitized).toBe(10)
    })

    it('should reject non-numeric retry values', () => {
      const result = configHelper.validateCLIMaxRetries(NaN)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Max retries must be a valid number')
      expect(result.sanitized).toBe(3) // default value
    })
  })

  describe('validateCLIConfig', () => {
    it('should validate complete CLI configuration', () => {
      const config = {
        cliTimeout: 45000,
        cliMaxRetries: 5
      }
      
      const result = configHelper.validateCLIConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.sanitized).toEqual(config)
    })

    it('should sanitize invalid CLI configuration', () => {
      const config = {
        cliTimeout: 1000, // too small
        cliMaxRetries: 15  // too large
      }
      
      const result = configHelper.validateCLIConfig(config)
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0]).toContain('CLI Timeout')
      expect(result.errors[1]).toContain('CLI Max Retries')
      expect(result.sanitized.cliTimeout).toBe(5000)
      expect(result.sanitized.cliMaxRetries).toBe(10)
    })

    it('should handle partial CLI configuration', () => {
      const config = {
        cliTimeout: 60000
        // cliMaxRetries not provided
      }
      
      const result = configHelper.validateCLIConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.sanitized.cliTimeout).toBe(60000)
      expect(result.sanitized.cliMaxRetries).toBeUndefined()
    })

    it('should handle empty CLI configuration', () => {
      const config = {}
      
      const result = configHelper.validateCLIConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.sanitized).toEqual({})
    })
  })

  describe('isValidApiKeyFormat for CLI provider', () => {
    it('should return true for CLI provider regardless of API key', () => {
      expect(configHelper.isValidApiKeyFormat('', 'gemini-cli')).toBe(true)
      expect(configHelper.isValidApiKeyFormat('invalid-key', 'gemini-cli')).toBe(true)
      expect(configHelper.isValidApiKeyFormat('sk-1234567890', 'gemini-cli')).toBe(true)
    })
  })
})