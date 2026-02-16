import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Info } from 'lucide-react'

export default function AboutSettingsPage() {
  const version = process.env.APP_VERSION || 'development'

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-3 pb-4">
          <Info className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">About Torqvoice</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Torqvoice is your complete vehicle service management solution. Track service history,
            repairs and more.
          </p>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm font-medium">{version}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
