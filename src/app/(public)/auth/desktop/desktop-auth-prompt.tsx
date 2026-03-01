'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface DesktopAuthPromptProps {
  userName: string
  userEmail: string
  codeChallenge: string
  state: string
}

export function DesktopAuthPrompt({
  userName,
  userEmail,
  codeChallenge,
  state,
}: DesktopAuthPromptProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleAuthorize() {
    setStatus('loading')
    try {
      const res = await fetch('/api/desktop/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeChallenge, state }),
      })

      if (!res.ok) {
        setStatus('error')
        return
      }

      const data = await res.json()
      window.location.href = data.redirect_uri
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorization Complete</CardTitle>
          <CardDescription>
            You can close this browser window and return to TorqVoice Desktop.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Authorize TorqVoice Desktop</CardTitle>
        <CardDescription>
          The TorqVoice desktop app is requesting access to your account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm">
          <p className="text-muted-foreground">Signed in as</p>
          <p className="font-medium">{userName}</p>
          <p className="text-muted-foreground">{userEmail}</p>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          disabled={status === 'loading'}
        >
          Cancel
        </Button>
        <Button onClick={handleAuthorize} disabled={status === 'loading'}>
          {status === 'loading' ? 'Authorizing...' : 'Authorize'}
        </Button>
      </CardFooter>
      {status === 'error' && (
        <CardContent>
          <p className="text-sm text-destructive">Authorization failed. Please try again.</p>
        </CardContent>
      )}
    </Card>
  )
}
