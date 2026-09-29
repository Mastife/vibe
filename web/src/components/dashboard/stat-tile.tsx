import { StatusDot } from '@/components/status-badges'
import { Card, CardContent } from '@/components/ui/card'
import { Typography } from '@/components/ui/typography'

type StatTileProps = {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'good' | 'warning' | 'critical'
}

/** One headline number: label, value, optional hint; the tone dot only appears when state matters. */
export function StatTile({ label, value, hint, tone = 'default' }: StatTileProps) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <Typography variant="caption" tone="muted">
          {label}
        </Typography>
        <div className="flex items-start gap-2">
          {tone !== 'default' && <StatusDot tone={tone} className="mt-2.5" />}
          <Typography variant="h4" balance>
            {value}
          </Typography>
        </div>
        {hint && (
          <Typography variant="bodyXs" tone="muted">
            {hint}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
