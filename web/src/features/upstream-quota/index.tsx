import { useQuery } from '@tanstack/react-query'
import { Gauge, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatQuota } from '@/lib/format'

import { getUpstreamQuotaMonitor } from './api'
import { summarizeUpstreamQuota, type UpstreamQuotaWindow } from './summary'

function windowLabel(window: UpstreamQuotaWindow, t: (key: string, opts?: Record<string, unknown>) => string): string {  if (window.unit === 3) {
    return t('{{hours}}-hour quota window', { hours: window.number })
  }
  if (window.unit === 6) {
    return t('Weekly quota window')
  }
  return t('Quota window')
}

function ZhipuPlanWindows(props: {
  windows: UpstreamQuotaWindow[]
  planLevel: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className='min-w-56 space-y-2'>
      {props.planLevel && (
        <Badge variant='secondary' className='uppercase'>
          {props.planLevel}
        </Badge>
      )}
      {props.windows.map((w) => (
        <div key={`${w.unit}-${w.number}-${w.total}-${w.remaining}-${w.next_reset_time}`} className='space-y-1'>
          <div className='flex items-center justify-between gap-2 text-xs'>
            <span className='font-medium'>
              {windowLabel(w, t)}
            </span>
            <span className='text-muted-foreground tabular-nums'>
              {w.remaining} / {w.total} ({w.percentage}%)
            </span>
          </div>
          <Progress value={100 - w.percentage} aria-label={windowLabel(w, t)} />
          {w.next_reset_time > 0 && (
            <div className='text-muted-foreground text-[11px]'>
              {t('Resets {{time}}', {
                time: dayjs(w.next_reset_time).format('MM-DD HH:mm'),
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function UpstreamQuotaPage() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch, isFetching, dataUpdatedAt } =
    useQuery({
      queryKey: ['upstream-quota-monitor'],
      queryFn: getUpstreamQuotaMonitor,
      staleTime: 60 * 1000,
    })

  const items = data ?? []

  return (
    <div className='space-y-4 p-4 md:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Gauge className='text-primary size-5' aria-hidden='true' />
          <h1 className='text-xl font-semibold'>{t('Upstream Quota')}</h1>
        </div>
        <div className='flex items-center gap-2'>
          {dataUpdatedAt > 0 && (
            <span className='text-muted-foreground text-xs'>
              {t('Updated at')} {dayjs(dataUpdatedAt).format('HH:mm:ss')}
            </span>
          )}
          <Button
            variant='outline'
            size='sm'
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={isFetching ? 'animate-spin' : undefined}
              aria-hidden='true'
            />
            {t('Refresh')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Channels')}</CardTitle>
          <CardDescription>
            {t(
              'Quota probes call upstream billing or plan endpoints with each channel key; results depend on what each provider exposes.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            if (isPending) {
              return <LoadingState message={t('Probing upstream quota...')} />
            }
            if (isError) {
              return (
                <EmptyState
                  title={t('Failed to load upstream quota')}
                  action={
                    <Button variant='outline' size='sm' onClick={() => refetch()}>
                      {t('Retry')}
                    </Button>
                  }
                />
              )
            }
            if (items.length === 0) {
              return <EmptyState title={t('No channels configured yet')} />
            }
            return (
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='text-muted-foreground border-b text-left'>
                    <th className='py-2 pr-4 font-medium'>{t('Status')}</th>
                    <th className='py-2 pr-4 font-medium'>{t('Name')}</th>
                    <th className='py-2 pr-4 font-medium'>{t('Type')}</th>
                    <th className='py-2 pr-4 font-medium'>{t('Base URL')}</th>
                    <th className='py-2 pr-4 font-medium'>{t('Response Time')}</th>
                    <th className='py-2 pr-4 font-medium'>{t('Used Quota')}</th>
                    <th className='py-2 pr-4 font-medium'>{t('Upstream Quota')}</th>
                    <th className='py-2 font-medium'>{t('Remark')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const summary = summarizeUpstreamQuota(item.upstream)
                    const summaryText =
                      summary.parts.length > 0
                        ? summary.parts.join(' / ')
                        : '—'
                    return (
                      <tr
                        key={item.id}
                        className='border-b last:border-b-0'
                      >
                        <td className='py-2 pr-4'>
                          <Badge
                            variant={item.status === 1 ? 'default' : 'secondary'}
                          >
                            {item.status === 1 ? t('Enabled') : t('Disabled')}
                          </Badge>
                        </td>
                        <td className='py-2 pr-4 font-medium'>{item.name}</td>
                        <td className='text-muted-foreground py-2 pr-4'>
                          #{item.type}
                        </td>
                        <td className='text-muted-foreground max-w-48 truncate py-2 pr-4'>
                          {item.base_url || '—'}
                        </td>
                        <td className='py-2 pr-4'>{item.response_time} ms</td>
                        <td className='py-2 pr-4'>
                          {formatQuota(item.used_quota)}
                        </td>
                        <td className='py-2 pr-4'>
                          {summary.windows.length > 0 ? (
                            <ZhipuPlanWindows
                              windows={summary.windows}
                              planLevel={summary.planLevel}
                            />
                          ) : (
                            <>
                              {summaryText}
                              {summary.modelCount !== null && (
                                <span className='text-muted-foreground ml-1'>
                                  ({t('Models in plan')}: {summary.modelCount})
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className='text-muted-foreground max-w-56 py-2'>
                          {item.note || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            )
          })()}
        </CardContent>
      </Card>
    </div>
  )
}

export default UpstreamQuotaPage
