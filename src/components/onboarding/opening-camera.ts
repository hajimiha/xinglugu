export interface OpeningMapRect {
  x: number
  y: number
  w: number
  h: number
}

export interface OpeningCameraInput {
  viewportWidth: number
  viewportHeight: number
  mapAspectRatio: number
  focusRect?: OpeningMapRect
}

export interface OpeningCameraTransform {
  scale: number
  x: number
  y: number
}

const OVERVIEW_CAMERA: OpeningCameraTransform = { scale: 1, x: 0, y: 0 }

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function isValidRect(rect: OpeningMapRect | undefined): rect is OpeningMapRect {
  return Boolean(
    rect
    && [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)
    && rect.x >= 0
    && rect.y >= 0
    && rect.w > 0
    && rect.h > 0
    && rect.x + rect.w <= 100
    && rect.y + rect.h <= 100,
  )
}

export function calculateOpeningCamera({
  viewportWidth,
  viewportHeight,
  mapAspectRatio,
  focusRect,
}: OpeningCameraInput): OpeningCameraTransform {
  if (
    !Number.isFinite(viewportWidth)
    || !Number.isFinite(viewportHeight)
    || !Number.isFinite(mapAspectRatio)
    || viewportWidth <= 0
    || viewportHeight <= 0
    || mapAspectRatio <= 0
    || !isValidRect(focusRect)
  ) return { ...OVERVIEW_CAMERA }

  const mobile = viewportWidth < 600
  const minimumScale = mobile ? 1.2 : 1.35
  const maximumScale = mobile ? 1.85 : 2.35
  const baseWidth = Math.min(viewportWidth, viewportHeight * mapAspectRatio)
  const baseHeight = baseWidth / mapAspectRatio
  const locationWidth = baseWidth * focusRect.w / 100
  const locationHeight = baseHeight * focusRect.h / 100
  const fittedScale = Math.min(
    (viewportWidth * (mobile ? 0.78 : 0.56)) / locationWidth,
    (viewportHeight * (mobile ? 0.42 : 0.52)) / locationHeight,
  )
  const scale = clamp(fittedScale, minimumScale, maximumScale)

  const locationCenterX = ((focusRect.x + focusRect.w / 2) / 100 - 0.5) * baseWidth
  const locationCenterY = ((focusRect.y + focusRect.h / 2) / 100 - 0.5) * baseHeight
  const targetOffsetX = viewportWidth * (mobile ? 0 : -0.08)
  const targetOffsetY = viewportHeight * (mobile ? -0.12 : -0.08)
  const desiredX = targetOffsetX - locationCenterX * scale
  const desiredY = targetOffsetY - locationCenterY * scale
  const xLimit = Math.max(viewportWidth * 0.08, baseWidth * scale / 2 - viewportWidth * 0.12)
  const yLimit = Math.max(viewportHeight * 0.08, baseHeight * scale / 2 - viewportHeight * 0.12)
  const x = clamp(desiredX, -xLimit, xLimit)
  const y = clamp(desiredY, -yLimit, yLimit)

  if (![scale, x, y].every(Number.isFinite)) return { ...OVERVIEW_CAMERA }
  return { scale, x, y }
}
