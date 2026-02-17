'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGlassModal } from '@/components/glass-modal'
import { Gauge, Loader2 } from 'lucide-react'

function SignInFormInner({ registrationDisabled }: { registrationDisabled: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const modal = useGlassModal()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        modal.open('error', 'Sign In Failed', result.error.message || 'Invalid credentials')
      } else {
        const redirect = searchParams.get('redirect') || '/'
        router.push(redirect)
        router.refresh()
      }
    } catch {
      modal.open('error', 'Sign In Failed', 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
          <Gauge className="h-5 w-5 text-primary" />
          <span className="gradient-text text-sm font-bold tracking-wider uppercase">
            Torqvoice
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your workshop</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 bg-background/50"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 bg-background/50"
          />
          <div className="flex justify-end">
            <Link href="/auth/forgot-password" className="text-xs text-muted-foreground hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign In
        </Button>
      </form>

      {!registrationDisabled && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/auth/sign-up" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        By using this service you agree to our{' '}
        <Link href="/terms" target="_blank" className="text-primary hover:underline">
          Terms of Service
        </Link>
      </p>
    </div>
  )
}

export function SignInForm({ registrationDisabled }: { registrationDisabled: boolean }) {
  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <Suspense>
        <SignInFormInner registrationDisabled={registrationDisabled} />
      </Suspense>
    </div>
  )
}
