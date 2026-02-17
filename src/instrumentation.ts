export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkLicenses } = await import('./cronTasks')
    checkLicenses()
  }
}
