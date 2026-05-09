import { Model } from '@/lib/types/models'
import { SearchMode } from '@/lib/types/search'

import { DEFAULT_MODEL } from './default-model'
import { getModelsConfig, isCloudDeployment } from './load-models-config'

// Retrieve the cloud model assigned to a specific search mode.
export function getModelForMode(mode: SearchMode): Model | undefined {
  if (!isCloudDeployment()) {
    return undefined
  }

  const cfg = getModelsConfig()
  return cfg.models?.[mode]
}

export function getRelatedQuestionsModel(localSelectedModel?: Model): Model {
  if (!isCloudDeployment()) {
    return localSelectedModel || DEFAULT_MODEL
  }

  const cfg = getModelsConfig()
  return cfg.models?.quick || localSelectedModel || DEFAULT_MODEL
}
