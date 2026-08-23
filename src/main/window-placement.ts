export type WorkArea = { x: number; y: number; width: number; height: number }
export type WindowSize = { width: number; height: number }
export type WindowPosition = { x: number; y: number }

export function centerLauncherInWorkArea(workArea: WorkArea, size: WindowSize): WindowPosition {
  const x = workArea.x + Math.max(0, Math.round((workArea.width - size.width) / 2))
  if (workArea.height <= size.height) return { x, y: workArea.y }
  const preferredTop = Math.max(48, Math.round(workArea.height * 0.067))
  const maxTop = workArea.height - size.height
  return { x, y: workArea.y + Math.min(preferredTop, maxTop) }
}
