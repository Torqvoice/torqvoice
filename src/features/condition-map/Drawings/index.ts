import type { BodyDrawing, BodyType } from '../Lib/drawingTypes'
import { boat } from './boat'
import { estate } from './estate'
import { hatchback } from './hatchback'
import { motorcycle } from './motorcycle'
import { pickup } from './pickup'
import { sedan } from './sedan'
import { suv } from './suv'
import { van } from './van'

export const BODY_DRAWINGS: Record<BodyType, BodyDrawing> = {
  sedan,
  hatchback,
  estate,
  suv,
  van,
  pickup,
  motorcycle,
  boat,
}

export function getBodyDrawing(body: BodyType): BodyDrawing {
  return BODY_DRAWINGS[body]
}
