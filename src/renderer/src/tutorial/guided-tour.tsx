import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useReducer, useState } from 'react'
import { initialTourState, tourReducer } from './tour-state'

export type TourStep = {
  target: string
  title: string
  body: string
}

type GuidedTourProps = {
  open: boolean
  steps: TourStep[]
  onComplete?: () => void
  onSkip?: () => void
  onClose?: () => void
}

type SpotlightRect = { top: number; left: number; width: number; height: number }

export function GuidedTour({ open, steps, onComplete, onSkip, onClose }: GuidedTourProps): React.JSX.Element | null {
  const [state, dispatch] = useReducer(tourReducer, initialTourState)
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)
  const step = steps[state.stepIndex]

  useEffect(() => {
    if (open) dispatch({ type: 'start', stepCount: steps.length })
    else dispatch({ type: 'close' })
  }, [open, steps.length])

  useLayoutEffect(() => {
    if (!state.active || !step) return
    const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
    if (!target) {
      setSpotlight(null)
      return
    }
    target.setAttribute('data-tour-spotlighted', 'true')
    const update = (): void => {
      const rect = target.getBoundingClientRect()
      setSpotlight({ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 })
    }
    update()
    window.addEventListener('resize', update)
    return () => {
      target.removeAttribute('data-tour-spotlighted')
      window.removeEventListener('resize', update)
    }
  }, [state.active, state.stepIndex, step])


  useEffect(() => {
    if (!state.active || !step) return
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' || event.key === 'ArrowRight') {
        event.preventDefault()
        const isFinal = state.stepIndex === state.stepCount - 1
        dispatch({ type: 'next' })
        if (isFinal) onComplete?.()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        dispatch({ type: 'previous' })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        dispatch({ type: 'close' })
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose, onComplete, state.active, state.stepCount, state.stepIndex, step])

  if (!open || !state.active || !step) return null

  const isFinal = state.stepIndex === state.stepCount - 1
  const cardTop = spotlight ? Math.min(spotlight.top + spotlight.height + 16, window.innerHeight - 260) : 80
  const cardLeft = spotlight ? Math.max(20, Math.min(spotlight.left, window.innerWidth - 380)) : 40

  const next = (): void => {
    dispatch({ type: 'next' })
    if (isFinal) onComplete?.()
  }

  return (
    <div aria-label="使用教程" aria-modal="true" className="fixed inset-0 z-[100]" role="dialog">
      {!spotlight ? <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" data-testid="tour-full-mask" /> : null}
      {spotlight ? (
        <div
          className="pointer-events-none fixed rounded-2xl ring-2 ring-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.35),0_0_30px_var(--accent-glow)] transition-all duration-200"
          data-testid="tour-spotlight"
          style={spotlight}
        />
      ) : null}
      <section
        className="fixed w-[370px] rounded-2xl border border-window bg-popover/95 backdrop-blur-xl p-5.5 text-primary shadow-2xl transition-all duration-200"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <span className="inline-block rounded-full bg-chip border border-divider px-2.5 py-0.5 text-[11px] font-bold text-primary mb-2">
              第 {state.stepIndex + 1} 步 / 共 {state.stepCount} 步
            </span>

            <h2 className="text-lg font-extrabold tracking-tight text-primary">{step.title}</h2>
          </div>
          <button aria-label="关闭教程" className="rounded-lg p-1.5 text-secondary transition-colors hover:bg-hover hover:text-primary" onClick={() => { dispatch({ type: 'close' }); onClose?.() }} type="button">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <p className="text-[13.5px] leading-6 text-secondary font-normal">{step.body}</p>
        <div className="mt-5 flex items-center justify-between border-t border-divider pt-4">
          <button className="text-xs font-semibold text-secondary transition-colors hover:text-primary" onClick={() => { dispatch({ type: 'skip' }); onSkip?.() }} type="button">
            跳过教程
          </button>
          <div className="flex gap-2">
            <button className="tour-button" disabled={state.stepIndex === 0} onClick={() => dispatch({ type: 'previous' })} type="button">
              <ArrowLeft aria-hidden="true" className="size-3.5" />上一步
            </button>
            <button className="tour-button tour-button-primary" onClick={next} type="button">
              {isFinal ? '完成' : '下一步'}<ArrowRight aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  )

}
