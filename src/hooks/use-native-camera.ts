import * as React from 'react'

const QUERY = '(pointer: coarse)'

/**
 * Whether this is a touch-first device, where a file input with `capture`
 * opens the camera app. A desk computer ignores `capture` and shows the file
 * picker instead, so there a "take a photo" button duplicates "add a photo",
 * and recording a video needs the page's own recorder.
 *
 * By the pointer, not the width: a narrow window on a desk is still a desk,
 * and a tablet held sideways is still a camera. False until mounted, since
 * the server cannot tell.
 */
export function useNativeCamera(): boolean {
  const [native, setNative] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setNative(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return native
}
