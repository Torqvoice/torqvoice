export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkLicenses, checkSubscriptions } = await import('./cronTasks')
    checkLicenses()
    checkSubscriptions()
  }
}
