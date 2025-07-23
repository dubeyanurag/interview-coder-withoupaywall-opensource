// Test setup file
import { vi } from 'vitest'

// Mock electron module for testing
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path')
  }
}))

// Mock child_process for CLI testing
vi.mock('child_process', () => ({
  spawn: vi.fn()
}))