import { describe, expect, it } from 'vitest'
import { initialTourState, tourReducer } from './tour-state'

describe('tourReducer', () => {
  it('moves forward only after an explicit next action', () => {
    const started = tourReducer(initialTourState, { type: 'start', stepCount: 4 })

    expect(started).toMatchObject({ active: true, stepIndex: 0 })
    expect(tourReducer(started, { type: 'next' })).toMatchObject({ active: true, stepIndex: 1 })
  })

  it('moves backward without leaving the first step', () => {
    const started = tourReducer(initialTourState, { type: 'start', stepCount: 4 })

    expect(tourReducer(started, { type: 'previous' }).stepIndex).toBe(0)
  })

  it('completes after confirming the final step', () => {
    const finalStep = { active: true, stepIndex: 2, stepCount: 3, outcome: null } as const

    expect(tourReducer(finalStep, { type: 'next' })).toEqual({
      active: false,
      stepIndex: 2,
      stepCount: 3,
      outcome: 'completed',
    })
  })

  it('records a skipped tour', () => {
    const started = tourReducer(initialTourState, { type: 'start', stepCount: 4 })

    expect(tourReducer(started, { type: 'skip' })).toMatchObject({ active: false, outcome: 'skipped' })
  })
})
