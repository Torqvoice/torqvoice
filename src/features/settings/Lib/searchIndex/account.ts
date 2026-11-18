import type { SettingsEntry } from './types'

/**
 * Account. Cards carry ids of their own; the signature card is wrapped in a
 * div with one. The two-factor buttons swap with the state, so both land on
 * the card. Deleting the account lives under Data now and is indexed there.
 */
export const accountEntries: SettingsEntry[] = [
  {
    id: 'account.profile',
    page: 'account',
    title: 'account.profileTitle',
    description: 'account.profileDescription',
    anchor: 'account-profile',
    keywords: ['profile', 'my profile', 'user', 'personal details'],
  },
  {
    id: 'account.name',
    page: 'account',
    title: 'account.name',
    anchor: 'display-name',
    keywords: ['name', 'display name', 'my name', 'full name'],
  },
  {
    id: 'account.email',
    page: 'account',
    title: 'account.emailLabel',
    anchor: 'profile-email',
    keywords: ['email', 'change email', 'login email', 'verify email', 'email verification'],
  },
  {
    id: 'account.signature',
    page: 'account',
    title: 'account.signatureTitle',
    description: 'account.signatureDescription',
    anchor: 'account-signature',
    keywords: ['signature', 'sign', 'draw signature', 'signature image', 'autograph'],
  },
  {
    id: 'account.password',
    page: 'account',
    title: 'account.changePasswordTitle',
    description: 'account.changePasswordDescription',
    anchor: 'account-password',
    keywords: ['password', 'change password', 'new password', 'reset password'],
  },
  {
    id: 'account.newPassword',
    page: 'account',
    title: 'account.newPassword',
    anchor: 'newPassword',
    keywords: ['new password', 'update password', 'stronger password'],
  },
  {
    id: 'account.twoFactor',
    page: 'account',
    title: 'account.twoFactorTitle',
    anchor: 'account-two-factor',
    keywords: ['two-factor', '2fa', 'mfa', 'two factor', 'authenticator', 'totp', 'security'],
  },
  {
    id: 'account.enable2FA',
    page: 'account',
    title: 'account.enable2FA',
    anchor: 'account-two-factor',
    keywords: ['enable two-factor', 'turn on 2fa', 'authenticator app', 'google authenticator'],
  },
  {
    id: 'account.disable2FA',
    page: 'account',
    title: 'account.disable2FA',
    anchor: 'account-two-factor',
    keywords: ['disable two-factor', 'turn off 2fa', 'remove 2fa'],
  },
  {
    id: 'account.devices',
    page: 'account',
    title: 'account.devicesTitle',
    description: 'account.devicesDescription',
    anchor: 'account-devices',
    keywords: ['devices', 'sessions', 'signed in', 'logged in', 'active sessions', 'browsers'],
  },
  {
    id: 'account.signOutOthers',
    page: 'account',
    title: 'account.signOutOthers',
    anchor: 'account-devices',
    keywords: ['sign out other devices', 'log out everywhere', 'end sessions', 'logout', 'revoke'],
  },
  {
    id: 'account.passkeys',
    page: 'account',
    title: 'account.passkey.title',
    description: 'account.passkey.description',
    anchor: 'account-passkeys',
    keywords: [
      'passkey',
      'passkeys',
      'face id',
      'touch id',
      'fingerprint',
      'security key',
      'webauthn',
    ],
  },
  {
    id: 'account.registerPasskey',
    page: 'account',
    title: 'account.passkey.register',
    anchor: 'account-register-passkey',
    keywords: ['add passkey', 'register passkey', 'new passkey', 'biometric login'],
  },
]
