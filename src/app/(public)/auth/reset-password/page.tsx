'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGlassModal } from '@/components/glass-modal'
import { Gauge, Loader2 } from 'lucide-react'

function ResetPasswordInner() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const searchParams = useSearchParams()
  const modal = useGlassModal()
  const token = searchParams.get('token') || ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      modal.open('error', 'Passwords do not match', 'Please ensure both passwords are the same.')
      return
    }

    if (newPassword.length < 8) {
      modal.open('error', 'Password too short', 'Password must be at least 8 characters long.')
      return
    }

    setLoading(true)

    try {
      const result = await authClient.resetPassword({
        newPassword,
        token,
      })

      if (result.error) {
        modal.open(
          'error',
          'Reset Failed',
          result.error.message || 'Could not reset password. The link may have expired.'
        )
      } else {
        setSuccess(true)
      }
    } catch {
      modal.open('error', 'Reset Failed', 'An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          Invalid or missing reset token. Please request a new password reset link.
        </p>
        <Link href="/auth/forgot-password">
          <Button variant="outline" className="h-11 w-full">
            Request New Link
          </Button>
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          Your password has been reset successfully. You can now sign in with your new password.
        </p>
        <Link href="/auth/sign-in">
          <Button className="h-11 w-full">Sign In</Button>
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">New Password</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="Enter new password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className="h-11 bg-background/50"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm Password</Label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className="h-11 bg-background/50"
        />
      </div>

      <Button type="submit" className="h-11 w-full" disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Reset Password
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
            <Gauge className="h-5 w-5 text-primary" />
            <span className="gradient-text text-sm font-bold tracking-wider uppercase">
              Torqvoice
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your new password below</p>
        </div>

        <Suspense>
          <ResetPasswordInner />
        </Suspense>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
