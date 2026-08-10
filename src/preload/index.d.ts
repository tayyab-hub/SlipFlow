import type { StitchFlowApi } from './index'

declare global {
  interface Window {
    stitchflow: StitchFlowApi
  }
}
