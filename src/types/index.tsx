export interface Screenshot {
  id: string
  path: string
  timestamp: number
  thumbnail: string // Base64 thumbnail
}

export interface Solution {
  initial_thoughts: string[]
  thought_steps: string[]
  description: string
  code: string
}

// Re-export CLI types for convenience
export type {
  APIProvider,
  Config,
  ConfigUpdate,
  CLIStatus,
  CLIModelsResponse,
  CLIError,
  CLIErrorCategory,
  CLIErrorSeverity,
  AIModel,
  ModelCategory
} from './cli';
