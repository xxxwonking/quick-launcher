export type TourOutcome = 'completed' | 'skipped' | null

export type TourState = {
  active: boolean
  stepIndex: number
  stepCount: number
  outcome: TourOutcome
}

export type TourAction =
  | { type: 'start'; stepCount: number }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'skip' }
  | { type: 'close' }

export const initialTourState: TourState = {
  active: false,
  stepIndex: 0,
  stepCount: 0,
  outcome: null,
}

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'start':
      return { active: action.stepCount > 0, stepIndex: 0, stepCount: action.stepCount, outcome: null }
    case 'next':
      if (!state.active) return state
      if (state.stepIndex >= state.stepCount - 1) return { ...state, active: false, outcome: 'completed' }
      return { ...state, stepIndex: state.stepIndex + 1 }
    case 'previous':
      if (!state.active) return state
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1) }
    case 'skip':
      return { ...state, active: false, outcome: 'skipped' }
    case 'close':
      return { ...state, active: false }
    default:
      return state
  }
}
