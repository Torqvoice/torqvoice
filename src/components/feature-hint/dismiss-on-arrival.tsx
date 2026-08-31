'use client'

import { useEffect } from 'react'
import { dismissFeatureHint } from '@/features/settings/Actions/featureHintActions'

/**
 * Marks an announcement as seen because somebody arrived at the thing it
 * announces.
 *
 * Having found the feature is the same as having been told about it, and the
 * workshop is told once between all of them: whoever opens the designer
 * settles it for everybody, so a colleague does not get a card pointing at
 * something their shop has already been using. It also covers the routes the
 * card itself does not own, like reaching the designer through the templates
 * page.
 *
 * Rendered only when the announcement is actually still live, so a page that
 * everybody visits is not writing a settled row on every load. Fire and
 * forget: nobody waits on this, and a failed write costs one extra sighting.
 */
export function DismissOnArrival({ id }: { id: string }) {
  useEffect(() => {
    void dismissFeatureHint(id)
  }, [id])

  return null
}
