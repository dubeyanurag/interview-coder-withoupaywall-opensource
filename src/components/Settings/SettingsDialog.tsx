import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Settings } from "lucide-react";
import { useToast } from "../../contexts/toast";
import type { APIProvider, Config, ConfigUpdate, CLIStatus, CLIModelsResponse } from "../../../electron/CLITypes";

type AIModel = {
  id: string;
  name: string;
  description: string;
};

type ModelCategory = {
  key: 'extractionModel' | 'solutionModel' | 'debuggingModel';
  title: string;
  description: string;
  openaiModels: AIModel[];
  geminiModels: AIModel[];
  anthropicModels: AIModel[];
  geminiCliModels: AIModel[];
};

// Define available models for each category
const modelCategories: ModelCategory[] = [
  {
    key: 'extractionModel',
    title: 'Problem Extraction',
    description: 'Model used to analyze screenshots and extract problem details',
    openaiModels: [
      {
        id: "gpt-4o",
        name: "gpt-4o",
        description: "Best overall performance for problem extraction"
      },
      {
        id: "gpt-4o-mini",
        name: "gpt-4o-mini",
        description: "Faster, more cost-effective option"
      }
    ],
    geminiModels: [
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        description: "Best overall performance for problem extraction"
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Faster, more cost-effective option"
      }
    ],
    anthropicModels: [
      {
        id: "claude-3-7-sonnet-20250219",
        name: "Claude 3.7 Sonnet",
        description: "Best overall performance for problem extraction"
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Balanced performance and speed"
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Top-level intelligence, fluency, and understanding"
      }
    ],
    geminiCliModels: [
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        description: "Best overall performance for problem extraction"
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Faster, more cost-effective option"
      }
    ]
  },
  {
    key: 'solutionModel',
    title: 'Solution Generation',
    description: 'Model used to generate coding solutions',
    openaiModels: [
      {
        id: "gpt-4o",
        name: "gpt-4o",
        description: "Strong overall performance for coding tasks"
      },
      {
        id: "gpt-4o-mini",
        name: "gpt-4o-mini",
        description: "Faster, more cost-effective option"
      }
    ],
    geminiModels: [
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        description: "Strong overall performance for coding tasks"
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Faster, more cost-effective option"
      }
    ],
    anthropicModels: [
      {
        id: "claude-3-7-sonnet-20250219",
        name: "Claude 3.7 Sonnet",
        description: "Strong overall performance for coding tasks"
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Balanced performance and speed"
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Top-level intelligence, fluency, and understanding"
      }
    ],
    geminiCliModels: [
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        description: "Strong overall performance for coding tasks"
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Faster, more cost-effective option"
      }
    ]
  },
  {
    key: 'debuggingModel',
    title: 'Debugging',
    description: 'Model used to debug and improve solutions',
    openaiModels: [
      {
        id: "gpt-4o",
        name: "gpt-4o",
        description: "Best for analyzing code and error messages"
      },
      {
        id: "gpt-4o-mini",
        name: "gpt-4o-mini",
        description: "Faster, more cost-effective option"
      }
    ],
    geminiModels: [
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        description: "Best for analyzing code and error messages"
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Faster, more cost-effective option"
      }
    ],
    anthropicModels: [
      {
        id: "claude-3-7-sonnet-20250219",
        name: "Claude 3.7 Sonnet",
        description: "Best for analyzing code and error messages"
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Balanced performance and speed"
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        description: "Top-level intelligence, fluency, and understanding"
      }
    ],
    geminiCliModels: [
      {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        description: "Best for analyzing code and error messages"
      },
      {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        description: "Faster, more cost-effective option"
      }
    ]
  }
];

interface SettingsDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({ open: externalOpen, onOpenChange }: SettingsDialogProps) {
  const [open, setOpen] = useState(externalOpen || false);
  const [apiKey, setApiKey] = useState("");
  const [apiProvider, setApiProvider] = useState<APIProvider>("openai");
  const [extractionModel, setExtractionModel] = useState("gpt-4o");
  const [solutionModel, setSolutionModel] = useState("gpt-4o");
  const [debuggingModel, setDebuggingModel] = useState("gpt-4o");
  const [isLoading, setIsLoading] = useState(false);
  const [cliTimeout, setCLITimeout] = useState(30000);
  const [cliMaxRetries, setCLIMaxRetries] = useState(3);
  const [cliStatus, setCLIStatus] = useState<CLIStatus>({
    isInstalled: false,
    isAuthenticated: false,
    isCompatible: false,
    isLoading: false
  });
  const [cliAvailableModels, setCLIAvailableModels] = useState<string[]>([]);
  const [cliModelsLoading, setCLIModelsLoading] = useState(false);
  const [cliModelsError, setCLIModelsError] = useState<string | undefined>();
  const { showToast } = useToast();

  // Sync with external open state
  useEffect(() => {
    if (externalOpen !== undefined) {
      setOpen(externalOpen);
    }
  }, [externalOpen]);

  // Handle open state changes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    // Only call onOpenChange when there's actually a change
    if (onOpenChange && newOpen !== externalOpen) {
      onOpenChange(newOpen);
    }
  };
  
  // Load current config on dialog open
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      // Use the centralized Config type

      window.electronAPI
        .getConfig()
        .then((config: Config) => {
          setApiKey(config.apiKey || "");
          setApiProvider(config.apiProvider || "openai");
          setExtractionModel(config.extractionModel || "gpt-4o");
          setSolutionModel(config.solutionModel || "gpt-4o");
          setDebuggingModel(config.debuggingModel || "gpt-4o");
          setCLITimeout(config.cliTimeout || 30000);
          setCLIMaxRetries(config.cliMaxRetries || 3);
        })
        .catch((error: unknown) => {
          console.error("Failed to load config:", error);
          showToast("Error", "Failed to load settings", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, showToast]);

  // Check CLI status when Gemini CLI provider is selected
  useEffect(() => {
    if (open && apiProvider === "gemini-cli") {
      setCLIStatus(prev => ({ ...prev, isLoading: true }));
      
      window.electronAPI
        .checkGeminiCLIStatus()
        .then((status) => {
          setCLIStatus({
            isInstalled: status.isInstalled,
            isAuthenticated: status.isAuthenticated,
            version: status.version,
            error: status.error,
            isLoading: false
          });
        })
        .catch((error: unknown) => {
          console.error("Failed to check CLI status:", error);
          setCLIStatus({
            isInstalled: false,
            isAuthenticated: false,
            error: "Failed to check CLI status",
            isLoading: false
          });
        });
    }
  }, [open, apiProvider]);

  // Fetch CLI available models when CLI is installed and authenticated
  useEffect(() => {
    if (open && apiProvider === "gemini-cli" && cliStatus.isInstalled && cliStatus.isAuthenticated && !cliStatus.isLoading) {
      setCLIModelsLoading(true);
      setCLIModelsError(undefined);
      
      window.electronAPI
        .getGeminiCLIModels()
        .then((result) => {
          if (result.error) {
            setCLIModelsError(result.error);
            setCLIAvailableModels([]);
          } else {
            setCLIAvailableModels(result.models || []);
            setCLIModelsError(undefined);
          }
        })
        .catch((error: unknown) => {
          console.error("Failed to get CLI models:", error);
          setCLIModelsError("Failed to retrieve available models");
          setCLIAvailableModels([]);
        })
        .finally(() => {
          setCLIModelsLoading(false);
        });
    } else if (apiProvider !== "gemini-cli") {
      // Reset CLI models state when switching away from CLI provider
      setCLIAvailableModels([]);
      setCLIModelsError(undefined);
      setCLIModelsLoading(false);
    }
  }, [open, apiProvider, cliStatus.isInstalled, cliStatus.isAuthenticated, cliStatus.isLoading]);

  // Update selected models when CLI models become available
  useEffect(() => {
    if (apiProvider === "gemini-cli" && cliAvailableModels.length > 0) {
      // Check if current models are valid, if not, reset to first available model
      const firstAvailableModel = cliAvailableModels[0];
      
      if (!cliAvailableModels.includes(extractionModel)) {
        setExtractionModel(firstAvailableModel);
      }
      if (!cliAvailableModels.includes(solutionModel)) {
        setSolutionModel(firstAvailableModel);
      }
      if (!cliAvailableModels.includes(debuggingModel)) {
        setDebuggingModel(firstAvailableModel);
      }
    }
  }, [apiProvider, cliAvailableModels, extractionModel, solutionModel, debuggingModel]);

  // Validate if a model is available for CLI provider
  const isModelValidForCLI = (modelId: string): boolean => {
    if (apiProvider !== "gemini-cli") return true;
    if (cliAvailableModels.length === 0) return true; // Allow if models not loaded yet
    return cliAvailableModels.includes(modelId);
  };

  // Handle API provider change
  const handleProviderChange = (provider: APIProvider) => {
    setApiProvider(provider);
    
    // Reset models to defaults when changing provider
    if (provider === "openai") {
      setExtractionModel("gpt-4o");
      setSolutionModel("gpt-4o");
      setDebuggingModel("gpt-4o");
    } else if (provider === "gemini") {
      setExtractionModel("gemini-1.5-pro");
      setSolutionModel("gemini-1.5-pro");
      setDebuggingModel("gemini-1.5-pro");
    } else if (provider === "anthropic") {
      setExtractionModel("claude-3-7-sonnet-20250219");
      setSolutionModel("claude-3-7-sonnet-20250219");
      setDebuggingModel("claude-3-7-sonnet-20250219");
    } else if (provider === "gemini-cli") {
      // For CLI provider, use the first available model or fallback to default
      const defaultModel = cliAvailableModels.length > 0 ? cliAvailableModels[0] : "gemini-2.0-flash";
      setExtractionModel(defaultModel);
      setSolutionModel(defaultModel);
      setDebuggingModel(defaultModel);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const configUpdate: any = {
        apiKey,
        apiProvider,
        extractionModel,
        solutionModel,
        debuggingModel,
      };

      // Include CLI-specific settings if Gemini CLI is selected
      if (apiProvider === "gemini-cli") {
        configUpdate.cliTimeout = cliTimeout;
        configUpdate.cliMaxRetries = cliMaxRetries;
      }

      const result = await window.electronAPI.updateConfig(configUpdate);
      
      if (result) {
        showToast("Success", "Settings saved successfully", "success");
        handleOpenChange(false);
        
        // Force reload the app to apply the API key
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      showToast("Error", "Failed to save settings", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Mask API key for display
  const maskApiKey = (key: string) => {
    if (!key || key.length < 10) return "";
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  // Open external link handler
  const openExternalLink = (url: string) => {
    window.electronAPI.openLink(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md bg-black border border-white/10 text-white settings-dialog"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(450px, 90vw)',
          height: 'auto',
          minHeight: '400px',
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 9999,
          margin: 0,
          padding: '20px',
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          animation: 'fadeIn 0.25s ease forwards',
          opacity: 0.98
        }}
      >        
        <DialogHeader>
          <DialogTitle>API Settings</DialogTitle>
          <DialogDescription className="text-white/70">
            Configure your API key and model preferences. You'll need your own API key to use this application.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* API Provider Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-white">API Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`p-2 rounded-lg cursor-pointer transition-colors ${
                  apiProvider === "openai"
                    ? "bg-white/10 border border-white/20"
                    : "bg-black/30 border border-white/5 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("openai")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "openai" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">OpenAI</p>
                    <p className="text-xs text-white/60">GPT-4o models</p>
                  </div>
                </div>
              </div>
              <div
                className={`p-2 rounded-lg cursor-pointer transition-colors ${
                  apiProvider === "gemini"
                    ? "bg-white/10 border border-white/20"
                    : "bg-black/30 border border-white/5 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("gemini")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "gemini" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">Gemini</p>
                    <p className="text-xs text-white/60">Gemini 1.5 models</p>
                  </div>
                </div>
              </div>
              <div
                className={`p-2 rounded-lg cursor-pointer transition-colors ${
                  apiProvider === "anthropic"
                    ? "bg-white/10 border border-white/20"
                    : "bg-black/30 border border-white/5 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("anthropic")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "anthropic" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">Claude</p>
                    <p className="text-xs text-white/60">Claude 3 models</p>
                  </div>
                </div>
              </div>
              <div
                className={`p-2 rounded-lg cursor-pointer transition-colors ${
                  apiProvider === "gemini-cli"
                    ? "bg-white/10 border border-white/20"
                    : "bg-black/30 border border-white/5 hover:bg-white/5"
                }`}
                onClick={() => handleProviderChange("gemini-cli")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      apiProvider === "gemini-cli" ? "bg-white" : "bg-white/20"
                    }`}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium text-white text-sm">Gemini CLI</p>
                    <p className="text-xs text-white/60">CLI-based access</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-white" htmlFor="apiKey">
            {apiProvider === "openai" ? "OpenAI API Key" : 
             apiProvider === "gemini" ? "Gemini API Key" : 
             apiProvider === "gemini-cli" ? "Gemini API Key" :
             "Anthropic API Key"}
            </label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                apiProvider === "openai" ? "sk-..." : 
                apiProvider === "gemini" ? "Enter your Gemini API key" :
                apiProvider === "gemini-cli" ? "Enter your Gemini API key" :
                "sk-ant-..."
              }
              className="bg-black/50 border-white/10 text-white"
            />
            {apiKey && (
              <p className="text-xs text-white/50">
                Current: {maskApiKey(apiKey)}
              </p>
            )}
            <p className="text-xs text-white/50">
              Your API key is stored locally and never sent to any server except {apiProvider === "openai" ? "OpenAI" : apiProvider === "anthropic" ? "Anthropic" : "Google"}
            </p>
            <div className="mt-2 p-2 rounded-md bg-white/5 border border-white/10">
              <p className="text-xs text-white/80 mb-1">Don't have an API key?</p>
              {apiProvider === "openai" ? (
                <>
                  <p className="text-xs text-white/60 mb-1">1. Create an account at <button 
                    onClick={() => openExternalLink('https://platform.openai.com/signup')} 
                    className="text-blue-400 hover:underline cursor-pointer">OpenAI</button>
                  </p>
                  <p className="text-xs text-white/60 mb-1">2. Go to <button 
                    onClick={() => openExternalLink('https://platform.openai.com/api-keys')} 
                    className="text-blue-400 hover:underline cursor-pointer">API Keys</button> section
                  </p>
                  <p className="text-xs text-white/60">3. Create a new secret key and paste it here</p>
                </>
              ) : apiProvider === "gemini" || apiProvider === "gemini-cli" ?  (
                <>
                  <p className="text-xs text-white/60 mb-1">1. Create an account at <button 
                    onClick={() => openExternalLink('https://aistudio.google.com/')} 
                    className="text-blue-400 hover:underline cursor-pointer">Google AI Studio</button>
                  </p>
                  <p className="text-xs text-white/60 mb-1">2. Go to the <button 
                    onClick={() => openExternalLink('https://aistudio.google.com/app/apikey')} 
                    className="text-blue-400 hover:underline cursor-pointer">API Keys</button> section
                  </p>
                  <p className="text-xs text-white/60">3. Create a new API key and paste it here</p>
                  {apiProvider === "gemini-cli" && (
                    <p className="text-xs text-white/60 mt-1">4. Install the <button 
                      onClick={() => openExternalLink('https://ai.google.dev/gemini-api/docs/cli')} 
                      className="text-blue-400 hover:underline cursor-pointer">Gemini CLI</button> tool
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-white/60 mb-1">1. Create an account at <button 
                    onClick={() => openExternalLink('https://console.anthropic.com/signup')} 
                    className="text-blue-400 hover:underline cursor-pointer">Anthropic</button>
                  </p>
                  <p className="text-xs text-white/60 mb-1">2. Go to the <button 
                    onClick={() => openExternalLink('https://console.anthropic.com/settings/keys')} 
                    className="text-blue-400 hover:underline cursor-pointer">API Keys</button> section
                  </p>
                  <p className="text-xs text-white/60">3. Create a new API key and paste it here</p>
                </>
              )}
            </div>
          </div>

          {/* CLI-specific configuration section */}
          {apiProvider === "gemini-cli" && (
            <div className="space-y-4 mt-4">
              <div className="border-t border-white/10 pt-4">
                <label className="text-sm font-medium text-white mb-3 block">Gemini CLI Configuration</label>
                
                {/* CLI Status Indicator */}
                <div className="bg-black/30 border border-white/10 rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">CLI Status</span>
                    {cliStatus.isLoading && (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {/* Installation Status */}
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        cliStatus.isInstalled ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-xs text-white/80">
                        Installation: {cliStatus.isInstalled ? 'Installed' : 'Not Found'}
                      </span>
                      {cliStatus.version && (
                        <span className="text-xs text-white/60">({cliStatus.version})</span>
                      )}
                    </div>
                    
                    {/* Authentication Status */}
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        cliStatus.isAuthenticated ? 'bg-green-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-xs text-white/80">
                        Authentication: {cliStatus.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                      </span>
                    </div>
                    
                    {/* Error Message with Structured Information */}
                    {cliStatus.error && (
                      <div className="mt-2 space-y-2">
                        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-red-400">
                              {cliStatus.errorCategory ? `${cliStatus.errorCategory.charAt(0).toUpperCase() + cliStatus.errorCategory.slice(1)} Error` : 'Error'}
                            </span>
                            {cliStatus.errorSeverity && (
                              <span className={`text-xs px-1 py-0.5 rounded ${
                                cliStatus.errorSeverity === 'critical' ? 'bg-red-600/20 text-red-300' :
                                cliStatus.errorSeverity === 'high' ? 'bg-orange-600/20 text-orange-300' :
                                cliStatus.errorSeverity === 'medium' ? 'bg-yellow-600/20 text-yellow-300' :
                                'bg-blue-600/20 text-blue-300'
                              }`}>
                                {cliStatus.errorSeverity}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-red-400">{cliStatus.error}</p>
                        </div>
                        
                        {/* Actionable Steps */}
                        {cliStatus.actionableSteps && cliStatus.actionableSteps.length > 0 && (
                          <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded">
                            <p className="text-xs font-medium text-blue-400 mb-1">How to fix this:</p>
                            <ul className="text-xs text-blue-300/80 space-y-0.5">
                              {cliStatus.actionableSteps.map((step, index) => (
                                <li key={index} className="flex items-start gap-1">
                                  <span className="text-blue-400 mt-0.5">•</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ul>
                            {cliStatus.helpUrl && (
                              <div className="mt-2">
                                <button 
                                  onClick={() => openExternalLink(cliStatus.helpUrl!)} 
                                  className="text-xs text-blue-400 hover:underline cursor-pointer"
                                >
                                  View documentation →
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* CLI Settings */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-white mb-1 block">
                      Command Timeout (seconds)
                    </label>
                    <Input
                      type="number"
                      value={cliTimeout / 1000}
                      onChange={(e) => setCLITimeout(Math.max(5, parseInt(e.target.value) || 30) * 1000)}
                      min="5"
                      max="300"
                      className="bg-black/50 border-white/10 text-white"
                    />
                    <p className="text-xs text-white/50 mt-1">
                      Maximum time to wait for CLI commands to complete (5-300 seconds)
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-white mb-1 block">
                      Max Retry Attempts
                    </label>
                    <Input
                      type="number"
                      value={cliMaxRetries}
                      onChange={(e) => setCLIMaxRetries(Math.max(0, Math.min(10, parseInt(e.target.value) || 3)))}
                      min="0"
                      max="10"
                      className="bg-black/50 border-white/10 text-white"
                    />
                    <p className="text-xs text-white/50 mt-1">
                      Number of retry attempts for failed CLI commands (0-10)
                    </p>
                  </div>
                </div>

                {/* Enhanced Installation and Setup Guidance */}
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-sm font-medium text-blue-400 mb-2">Quick Setup Guide</p>
                  <div className="space-y-2 text-xs text-blue-300/80">
                    <div>
                      <p className="font-medium text-blue-300">Step 1: Install Python & pip</p>
                      <p className="ml-2 text-blue-300/70">Ensure Python 3.7+ and pip are installed on your system</p>
                      <div className="ml-2 mt-1 space-y-1">
                        <p>• Check Python: <code className="bg-black/30 px-1 rounded">python --version</code></p>
                        <p>• Check pip: <code className="bg-black/30 px-1 rounded">pip --version</code></p>
                        <p>• If missing, download from <button 
                          onClick={() => openExternalLink('https://python.org/downloads/')} 
                          className="text-blue-400 hover:underline cursor-pointer"
                        >python.org</button></p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="font-medium text-blue-300">Step 2: Install Gemini CLI</p>
                      <code className="block bg-black/30 p-1 rounded text-xs font-mono text-blue-200 ml-2 mt-1">
                        pip install google-generativeai[cli]
                      </code>
                      <div className="ml-2 mt-1 text-blue-300/70">
                        <p>Alternative installation methods:</p>
                        <p>• Using pipx: <code className="bg-black/30 px-1 rounded">pipx install google-generativeai[cli]</code></p>
                        <p>• Using conda: <code className="bg-black/30 px-1 rounded">conda install -c conda-forge google-generativeai</code></p>
                        <p>• Using pip3: <code className="bg-black/30 px-1 rounded">pip3 install google-generativeai[cli]</code></p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="font-medium text-blue-300">Step 3: Authenticate with Google</p>
                      <code className="block bg-black/30 p-1 rounded text-xs font-mono text-blue-200 ml-2 mt-1">
                        gemini auth login
                      </code>
                      <div className="ml-2 mt-1 text-blue-300/70">
                        <p>• Follow the browser prompts to sign in with your Google account</p>
                        <p>• Ensure your account has Gemini API access enabled</p>
                        <p>• Complete the OAuth flow in the opened browser window</p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="font-medium text-blue-300">Step 4: Verify Setup</p>
                      <div className="ml-2 mt-1 space-y-1">
                        <p>• Check version: <code className="bg-black/30 px-1 rounded">gemini --version</code></p>
                        <p>• Check auth: <code className="bg-black/30 px-1 rounded">gemini auth status</code></p>
                        <p>• List models: <code className="bg-black/30 px-1 rounded">gemini models list</code></p>
                        <p>• Test CLI: <code className="bg-black/30 px-1 rounded">gemini generate "Hello, world!"</code></p>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-blue-500/20 flex flex-wrap gap-4">
                      <button 
                        onClick={() => openExternalLink('https://ai.google.dev/gemini-api/docs/cli')} 
                        className="text-blue-400 hover:underline cursor-pointer"
                      >
                        Full documentation →
                      </button>
                      <button 
                        onClick={() => openExternalLink('https://python.org/downloads/')} 
                        className="text-blue-400 hover:underline cursor-pointer"
                      >
                        Download Python →
                      </button>
                      <button 
                        onClick={() => openExternalLink('https://aistudio.google.com/app/apikey')} 
                        className="text-blue-400 hover:underline cursor-pointer"
                      >
                        Get API Key →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Comprehensive Troubleshooting Guide */}
                <div className="mt-3 space-y-3">
                  {/* Installation Issues */}
                  {!cliStatus.isInstalled && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-sm font-medium text-red-400 mb-2">Installation Issues</p>
                      <div className="space-y-2 text-xs text-red-300/80">
                        <div>
                          <p className="font-medium text-red-300">CLI Not Found:</p>
                          <ul className="ml-3 space-y-1">
                            <li>• Ensure Python 3.7+ and pip are installed on your system</li>
                            <li>• Install CLI: <code className="bg-black/30 px-1 rounded">pip install google-generativeai[cli]</code></li>
                            <li>• Add Python scripts directory to your PATH environment variable</li>
                            <li>• Try direct module execution: <code className="bg-black/30 px-1 rounded">python -m google.generativeai.cli --version</code></li>
                            <li>• Restart your terminal and this application after installation</li>
                          </ul>
                        </div>
                        <div className="mt-2">
                          <p className="font-medium text-red-300">Alternative Installation Methods:</p>
                          <ul className="ml-3 space-y-1">
                            <li>• Using pipx (recommended): <code className="bg-black/30 px-1 rounded">pipx install google-generativeai[cli]</code></li>
                            <li>• Using conda: <code className="bg-black/30 px-1 rounded">conda install -c conda-forge google-generativeai</code></li>
                            <li>• Using pip3 (if pip fails): <code className="bg-black/30 px-1 rounded">pip3 install google-generativeai[cli]</code></li>
                            <li>• In virtual environment: <code className="bg-black/30 px-1 rounded">python -m venv venv && source venv/bin/activate && pip install google-generativeai[cli]</code></li>
                          </ul>
                        </div>
                        <div className="mt-2">
                          <p className="font-medium text-red-300">Platform-Specific Issues:</p>
                          <ul className="ml-3 space-y-1">
                            <li>• <strong>Windows:</strong> Ensure Python is added to PATH during installation</li>
                            <li>• <strong>macOS:</strong> May need Xcode command line tools: <code className="bg-black/30 px-1 rounded">xcode-select --install</code></li>
                            <li>• <strong>Linux:</strong> May need python3-dev package: <code className="bg-black/30 px-1 rounded">sudo apt install python3-dev</code></li>
                            <li>• <strong>Corporate networks:</strong> Configure proxy settings for pip</li>
                          </ul>
                        </div>
                        <div className="mt-2 pt-2 border-t border-red-500/20 flex flex-wrap gap-4">
                          <button 
                            onClick={() => openExternalLink('https://ai.google.dev/gemini-api/docs/cli#installation')} 
                            className="text-red-400 hover:underline cursor-pointer"
                          >
                            Installation guide →
                          </button>
                          <button 
                            onClick={() => openExternalLink('https://python.org/downloads/')} 
                            className="text-red-400 hover:underline cursor-pointer"
                          >
                            Download Python →
                          </button>
                          <button 
                            onClick={() => openExternalLink('https://pypa.github.io/pipx/')} 
                            className="text-red-400 hover:underline cursor-pointer"
                          >
                            Install pipx →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Authentication Issues */}
                  {cliStatus.isInstalled && !cliStatus.isAuthenticated && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <p className="text-sm font-medium text-yellow-400 mb-2">Authentication Issues</p>
                      <div className="space-y-2 text-xs text-yellow-300/80">
                        <div>
                          <p className="font-medium text-yellow-300">Authentication Required:</p>
                          <ul className="ml-3 space-y-1">
                            <li>• Run authentication command: <code className="bg-black/30 px-1 rounded">gemini auth login</code></li>
                            <li>• Complete the browser authentication flow that opens automatically</li>
                            <li>• Sign in with your Google account that has Gemini API access</li>
                            <li>• Verify authentication status: <code className="bg-black/30 px-1 rounded">gemini auth status</code></li>
                            <li>• Ensure you accept all required permissions during OAuth flow</li>
                          </ul>
                        </div>
                        <div className="mt-2">
                          <p className="font-medium text-yellow-300">Common Authentication Problems:</p>
                          <ul className="ml-3 space-y-1">
                            <li>• <strong>Token expired:</strong> Clear and re-authenticate with <code className="bg-black/30 px-1 rounded">gemini auth logout && gemini auth login</code></li>
                            <li>• <strong>Browser issues:</strong> Try using an incognito/private browser window</li>
                            <li>• <strong>Corporate network:</strong> Check if your organization blocks OAuth flows</li>
                            <li>• <strong>Account access:</strong> Ensure your Google account has Gemini API access enabled</li>
                            <li>• <strong>Multiple accounts:</strong> Make sure you're signing in with the correct Google account</li>
                            <li>• <strong>Firewall/proxy:</strong> Configure network settings to allow Google OAuth</li>
                          </ul>
                        </div>
                        <div className="mt-2">
                          <p className="font-medium text-yellow-300">Step-by-Step Authentication Guide:</p>
                          <ol className="ml-3 space-y-1 list-decimal">
                            <li>Open terminal/command prompt</li>
                            <li>Run: <code className="bg-black/30 px-1 rounded">gemini auth login</code></li>
                            <li>Browser window should open automatically</li>
                            <li>Sign in with your Google account</li>
                            <li>Grant all requested permissions</li>
                            <li>Return to terminal and verify: <code className="bg-black/30 px-1 rounded">gemini auth status</code></li>
                            <li>You should see "Authenticated" or similar confirmation</li>
                          </ol>
                        </div>
                        <div className="mt-2 pt-2 border-t border-yellow-500/20 flex flex-wrap gap-4">
                          <button 
                            onClick={() => openExternalLink('https://ai.google.dev/gemini-api/docs/cli#authentication')} 
                            className="text-yellow-400 hover:underline cursor-pointer"
                          >
                            Authentication guide →
                          </button>
                          <button 
                            onClick={() => openExternalLink('https://aistudio.google.com/app/apikey')} 
                            className="text-yellow-400 hover:underline cursor-pointer"
                          >
                            Check API access →
                          </button>
                          <button 
                            onClick={() => openExternalLink('https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com')} 
                            className="text-yellow-400 hover:underline cursor-pointer"
                          >
                            Enable API →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* General Troubleshooting */}
                  <div className="p-3 bg-gray-500/10 border border-gray-500/20 rounded-lg">
                    <p className="text-sm font-medium text-gray-300 mb-2">Common Issues & Solutions</p>
                    <div className="space-y-2 text-xs text-gray-300/80">
                      <div>
                        <p className="font-medium text-gray-300">Permission & Access Errors:</p>
                        <ul className="ml-3 space-y-1">
                          <li>• <strong>API Access:</strong> Verify your Google account has Gemini API access enabled</li>
                          <li>• <strong>Cloud Console:</strong> Ensure the Generative Language API is enabled in <button 
                            onClick={() => openExternalLink('https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com')} 
                            className="text-blue-400 hover:underline cursor-pointer"
                          >Google Cloud Console</button></li>
                          <li>• <strong>Terms of Service:</strong> Accept all required Gemini API terms and conditions</li>
                          <li>• <strong>Organization:</strong> Contact your admin if using a managed Google Workspace account</li>
                          <li>• <strong>Billing:</strong> Ensure billing is set up if required for your usage level</li>
                        </ul>
                      </div>
                      <div className="mt-2">
                        <p className="font-medium text-gray-300">Network & Connectivity Issues:</p>
                        <ul className="ml-3 space-y-1">
                          <li>• <strong>Internet:</strong> Verify stable internet connection to Google services</li>
                          <li>• <strong>Firewall:</strong> Check corporate firewall allows access to *.googleapis.com</li>
                          <li>• <strong>Proxy:</strong> Configure proxy settings if behind corporate network</li>
                          <li>• <strong>DNS:</strong> Try using different DNS servers (8.8.8.8, 1.1.1.1) if connection fails</li>
                          <li>• <strong>VPN:</strong> Disable VPN temporarily if experiencing connection issues</li>
                        </ul>
                      </div>
                      <div className="mt-2">
                        <p className="font-medium text-gray-300">Quota & Rate Limiting:</p>
                        <ul className="ml-3 space-y-1">
                          <li>• <strong>Daily Quota:</strong> Check if you've exceeded daily API request limits</li>
                          <li>• <strong>Rate Limits:</strong> Wait 1-2 minutes if hitting rate limits (usually temporary)</li>
                          <li>• <strong>Usage Monitoring:</strong> Monitor usage in <button 
                            onClick={() => openExternalLink('https://aistudio.google.com/app/apikey')} 
                            className="text-blue-400 hover:underline cursor-pointer"
                          >Google AI Studio</button></li>
                          <li>• <strong>Upgrade Plan:</strong> Consider upgrading if consistently hitting limits</li>
                          <li>• <strong>Request Spacing:</strong> Add delays between requests to avoid rate limiting</li>
                        </ul>
                      </div>
                      <div className="mt-2">
                        <p className="font-medium text-gray-300">Performance & Timeout Issues:</p>
                        <ul className="ml-3 space-y-1">
                          <li>• <strong>Timeout Settings:</strong> Increase CLI timeout in settings above (try 60-120 seconds)</li>
                          <li>• <strong>Image Size:</strong> Reduce image size or complexity for faster processing</li>
                          <li>• <strong>System Resources:</strong> Close other applications if system is under heavy load</li>
                          <li>• <strong>Model Selection:</strong> Try gemini-2.0-flash for faster responses</li>
                          <li>• <strong>Application Restart:</strong> Restart this application if it becomes unresponsive</li>
                        </ul>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-500/20 flex flex-wrap gap-4">
                        <button 
                          onClick={() => openExternalLink('https://aistudio.google.com/app/apikey')} 
                          className="text-gray-400 hover:underline cursor-pointer"
                        >
                          Check API usage →
                        </button>
                        <button 
                          onClick={() => openExternalLink('https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com')} 
                          className="text-gray-400 hover:underline cursor-pointer"
                        >
                          Enable API →
                        </button>
                        <button 
                          onClick={() => openExternalLink('https://ai.google.dev/gemini-api/docs/troubleshooting')} 
                          className="text-gray-400 hover:underline cursor-pointer"
                        >
                          Troubleshooting docs →
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Troubleshooting */}
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <p className="text-sm font-medium text-purple-400 mb-2">Advanced Troubleshooting</p>
                    <div className="space-y-2 text-xs text-purple-300/80">
                      <div>
                        <p className="font-medium text-purple-300">Diagnostic Commands:</p>
                        <ul className="ml-3 space-y-1">
                          <li>• Check CLI version: <code className="bg-black/30 px-1 rounded">gemini --version</code></li>
                          <li>• Test authentication: <code className="bg-black/30 px-1 rounded">gemini auth status</code></li>
                          <li>• List available models: <code className="bg-black/30 px-1 rounded">gemini models list</code></li>
                          <li>• Test basic functionality: <code className="bg-black/30 px-1 rounded">gemini generate "Hello, world!"</code></li>
                          <li>• Check Python path: <code className="bg-black/30 px-1 rounded">which python && which pip</code></li>
                          <li>• Verify installation: <code className="bg-black/30 px-1 rounded">pip show google-generativeai</code></li>
                        </ul>
                      </div>
                      <div className="mt-2">
                        <p className="font-medium text-purple-300">Environment & Dependencies:</p>
                        <ul className="ml-3 space-y-1">
                          <li>• <strong>Python version:</strong> Ensure Python 3.7+ is installed and active</li>
                          <li>• <strong>Pip version:</strong> Update pip with <code className="bg-black/30 px-1 rounded">pip install --upgrade pip</code></li>
                          <li>• <strong>Clear cache:</strong> Run <code className="bg-black/30 px-1 rounded">pip cache purge</code> to clear corrupted cache</li>
                          <li>• <strong>Virtual environment:</strong> Try installing in a fresh venv to isolate issues</li>
                          <li>• <strong>Package conflicts:</strong> Check for conflicting packages with <code className="bg-black/30 px-1 rounded">pip check</code></li>
                        </ul>
                      </div>
                      <div className="mt-2">
                        <p className="font-medium text-purple-300">Platform-Specific Solutions:</p>
                        <ul className="ml-3 space-y-1">
                          <li>• <strong>macOS:</strong> Install Xcode tools: <code className="bg-black/30 px-1 rounded">xcode-select --install</code></li>
                          <li>• <strong>Windows:</strong> Ensure Python and Scripts folder are in PATH environment variable</li>
                          <li>• <strong>Linux (Ubuntu/Debian):</strong> Install dev packages: <code className="bg-black/30 px-1 rounded">sudo apt install python3-dev build-essential</code></li>
                          <li>• <strong>Linux (CentOS/RHEL):</strong> Install dev packages: <code className="bg-black/30 px-1 rounded">sudo yum install python3-devel gcc</code></li>
                          <li>• <strong>Corporate networks:</strong> Configure pip proxy: <code className="bg-black/30 px-1 rounded">pip install --proxy http://proxy:port package</code></li>
                        </ul>
                      </div>
                      <div className="mt-2">
                        <p className="font-medium text-purple-300">Last Resort Solutions:</p>
                        <ul className="ml-3 space-y-1">
                          <li>• <strong>Complete reinstall:</strong> Uninstall and reinstall Python and pip</li>
                          <li>• <strong>Alternative Python:</strong> Try using python3 and pip3 commands instead</li>
                          <li>• <strong>System Python:</strong> Use system package manager (brew, apt, yum) to install</li>
                          <li>• <strong>Docker container:</strong> Run CLI in a containerized environment</li>
                          <li>• <strong>Different machine:</strong> Test on another computer to isolate system issues</li>
                        </ul>
                      </div>
                      <div className="mt-2 pt-2 border-t border-purple-500/20 flex flex-wrap gap-4">
                        <button 
                          onClick={() => openExternalLink('https://ai.google.dev/gemini-api/docs/cli#troubleshooting')} 
                          className="text-purple-400 hover:underline cursor-pointer"
                        >
                          CLI troubleshooting →
                        </button>
                        <button 
                          onClick={() => openExternalLink('https://pip.pypa.io/en/stable/topics/configuration/')} 
                          className="text-purple-400 hover:underline cursor-pointer"
                        >
                          Pip configuration →
                        </button>
                        <button 
                          onClick={() => openExternalLink('https://docs.python.org/3/using/index.html')} 
                          className="text-purple-400 hover:underline cursor-pointer"
                        >
                          Python setup guide →
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quick Reference Card */}
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                    <p className="text-sm font-medium text-indigo-400 mb-2">Quick Reference</p>
                    <div className="space-y-2 text-xs text-indigo-300/80">
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <p className="font-medium text-indigo-300">Essential Commands:</p>
                          <div className="ml-2 space-y-1 font-mono text-xs">
                            <p><code className="bg-black/30 px-1 rounded">pip install google-generativeai[cli]</code> - Install CLI</p>
                            <p><code className="bg-black/30 px-1 rounded">gemini auth login</code> - Authenticate</p>
                            <p><code className="bg-black/30 px-1 rounded">gemini auth status</code> - Check auth</p>
                            <p><code className="bg-black/30 px-1 rounded">gemini models list</code> - List models</p>
                            <p><code className="bg-black/30 px-1 rounded">gemini generate "test"</code> - Test CLI</p>
                          </div>
                        </div>
                        <div>
                          <p className="font-medium text-indigo-300">Common Error Solutions:</p>
                          <div className="ml-2 space-y-1">
                            <p>• <strong>Command not found:</strong> Add Python Scripts to PATH</p>
                            <p>• <strong>Permission denied:</strong> Use --user flag or virtual environment</p>
                            <p>• <strong>Network timeout:</strong> Check firewall and proxy settings</p>
                            <p>• <strong>Auth failed:</strong> Clear credentials and re-authenticate</p>
                            <p>• <strong>Module not found:</strong> Reinstall with correct Python version</p>
                          </div>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-indigo-500/20">
                        <p className="text-indigo-300/70 text-xs">
                          💡 <strong>Pro tip:</strong> If you're still having issues, try running commands with <code className="bg-black/30 px-1 rounded">python -m google.generativeai.cli</code> instead of <code className="bg-black/30 px-1 rounded">gemini</code>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-2 mt-4">
            <label className="text-sm font-medium text-white mb-2 block">Keyboard Shortcuts</label>
            <div className="bg-black/30 border border-white/10 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div className="text-white/70">Toggle Visibility</div>
                <div className="text-white/90 font-mono">Ctrl+B / Cmd+B</div>
                
                <div className="text-white/70">Take Screenshot</div>
                <div className="text-white/90 font-mono">Ctrl+H / Cmd+H</div>
                
                <div className="text-white/70">Process Screenshots</div>
                <div className="text-white/90 font-mono">Ctrl+Enter / Cmd+Enter</div>
                
                <div className="text-white/70">Delete Last Screenshot</div>
                <div className="text-white/90 font-mono">Ctrl+L / Cmd+L</div>
                
                <div className="text-white/70">Reset View</div>
                <div className="text-white/90 font-mono">Ctrl+R / Cmd+R</div>
                
                <div className="text-white/70">Quit Application</div>
                <div className="text-white/90 font-mono">Ctrl+Q / Cmd+Q</div>
                
                <div className="text-white/70">Move Window</div>
                <div className="text-white/90 font-mono">Ctrl+Arrow Keys</div>
                
                <div className="text-white/70">Decrease Opacity</div>
                <div className="text-white/90 font-mono">Ctrl+[ / Cmd+[</div>
                
                <div className="text-white/70">Increase Opacity</div>
                <div className="text-white/90 font-mono">Ctrl+] / Cmd+]</div>
                
                <div className="text-white/70">Zoom Out</div>
                <div className="text-white/90 font-mono">Ctrl+- / Cmd+-</div>
                
                <div className="text-white/70">Reset Zoom</div>
                <div className="text-white/90 font-mono">Ctrl+0 / Cmd+0</div>
                
                <div className="text-white/70">Zoom In</div>
                <div className="text-white/90 font-mono">Ctrl+= / Cmd+=</div>
              </div>
            </div>
          </div>
          
          <div className="space-y-4 mt-4">
            <label className="text-sm font-medium text-white">AI Model Selection</label>
            <p className="text-xs text-white/60 -mt-3 mb-2">
              Select which models to use for each stage of the process
            </p>
            
            {/* CLI Models Status */}
            {apiProvider === "gemini-cli" && (
              <div className="mb-4 p-3 bg-black/30 border border-white/10 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">Available Models</span>
                  {cliModelsLoading && (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  )}
                </div>
                
                {cliModelsError ? (
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                    {cliModelsError}
                  </div>
                ) : cliAvailableModels.length > 0 ? (
                  <div className="text-xs text-green-400">
                    Found {cliAvailableModels.length} available models: {cliAvailableModels.join(', ')}
                  </div>
                ) : !cliModelsLoading && (cliStatus.isInstalled && cliStatus.isAuthenticated) ? (
                  <div className="text-xs text-yellow-400">
                    No models found. Using default model list.
                  </div>
                ) : (
                  <div className="text-xs text-white/60">
                    Models will be loaded once CLI is installed and authenticated.
                  </div>
                )}
              </div>
            )}
            
            {modelCategories.map((category) => {
              // Get the appropriate model list based on selected provider
              let models;
              if (apiProvider === "openai") {
                models = category.openaiModels;
              } else if (apiProvider === "gemini") {
                models = category.geminiModels;
              } else if (apiProvider === "gemini-cli") {
                // For CLI provider, use dynamically fetched models or fallback to hardcoded ones
                if (cliAvailableModels.length > 0) {
                  models = cliAvailableModels.map(modelId => ({
                    id: modelId,
                    name: modelId.replace('gemini-', 'Gemini ').replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    description: modelId.includes('flash') ? 'Faster, more cost-effective option' : 'Best overall performance'
                  }));
                } else {
                  models = category.geminiCliModels;
                }
              } else {
                models = category.anthropicModels;
              }
              
              return (
                <div key={category.key} className="mb-4">
                  <label className="text-sm font-medium text-white mb-1 block">
                    {category.title}
                  </label>
                  <p className="text-xs text-white/60 mb-2">{category.description}</p>
                  
                  <div className="space-y-2">
                    {models.map((m) => {
                      // Determine which state to use based on category key
                      const currentValue = 
                        category.key === 'extractionModel' ? extractionModel :
                        category.key === 'solutionModel' ? solutionModel :
                        debuggingModel;
                      
                      // Determine which setter function to use
                      const setValue = 
                        category.key === 'extractionModel' ? setExtractionModel :
                        category.key === 'solutionModel' ? setSolutionModel :
                        setDebuggingModel;
                        
                      const isValidModel = isModelValidForCLI(m.id);
                      const isDisabled = apiProvider === "gemini-cli" && !isValidModel && cliAvailableModels.length > 0;
                      
                      return (
                        <div
                          key={m.id}
                          className={`p-2 rounded-lg transition-colors ${
                            isDisabled 
                              ? "opacity-50 cursor-not-allowed bg-black/20 border border-white/5"
                              : `cursor-pointer ${
                                  currentValue === m.id
                                    ? "bg-white/10 border border-white/20"
                                    : "bg-black/30 border border-white/5 hover:bg-white/5"
                                }`
                          }`}
                          onClick={() => !isDisabled && setValue(m.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-3 h-3 rounded-full ${
                                currentValue === m.id ? "bg-white" : "bg-white/20"
                              }`}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-white text-xs">{m.name}</p>
                                {apiProvider === "gemini-cli" && cliAvailableModels.length > 0 && (
                                  <div className={`w-2 h-2 rounded-full ${
                                    isValidModel ? 'bg-green-500' : 'bg-red-500'
                                  }`} title={isValidModel ? 'Available via CLI' : 'Not available via CLI'}></div>
                                )}
                              </div>
                              <p className="text-xs text-white/60">
                                {m.description}
                                {isDisabled && " (Not available via CLI)"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-white/10 hover:bg-white/5 text-white"
          >
            Cancel
          </Button>
          <Button
            className="px-4 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors"
            onClick={handleSave}
            disabled={isLoading || !apiKey}
          >
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
