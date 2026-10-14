/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Search, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import { useBillingHistory } from '../../hooks/use-billing-history'
import {
  getStatusConfig,
  getPaymentMethodName,
  formatTimestamp,
} from '../../lib/billing'
import type { TopupRecord } from '../../types'
import { OrderDetailDialog } from './order-detail-dialog'

interface BillingHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Signed-in account, used as the payer shown in the order detail receipt. */
  currentUser?: { id: number; username: string }
}

export function BillingHistoryDialog({
  open,
  onOpenChange,
  currentUser,
}: BillingHistoryDialogProps) {
  const { t } = useTranslation()
  const {
    records,
    total,
    page,
    pageSize,
    keyword,
    loading,
    completing,
    rejecting,
    isAdmin,
    statusFilter,
    handlePageChange,
    handlePageSizeChange,
    handleSearch,
    handleStatusFilterChange,
    handleCompleteOrder,
    handleRejectOrder,
  } = useBillingHistory()

  const [confirm, setConfirm] = useState<{
    tradeNo: string
    action: 'approve' | 'reject'
  } | null>(null)
  const { copyToClipboard, copiedText } = useCopyToClipboard({ notify: false })
  const [detailRecord, setDetailRecord] = useState<TopupRecord | null>(null)

  let detailPayer = ''
  if (detailRecord) {
    const isOwnOrder = detailRecord.user_id === currentUser?.id
    detailPayer = isOwnOrder
      ? (currentUser?.username ?? '')
      : `${t('User ID')}: ${detailRecord.user_id}`
  }

  const totalPages = Math.ceil(total / pageSize)
  const isRejectConfirm = confirm?.action === 'reject'
  const confirmBusy = completing || rejecting
  let confirmLabel = isRejectConfirm ? t('Reject') : t('Confirm')
  if (confirmBusy) {
    confirmLabel = t('Processing...')
  }

  const handleConfirm = async () => {
    if (!confirm) return
    const success =
      confirm.action === 'approve'
        ? await handleCompleteOrder(confirm.tradeNo)
        : await handleRejectOrder(confirm.tradeNo)
    if (success) {
      setConfirm(null)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('Billing History')}
        description={
          isAdmin
            ? t(
                'Review top-up orders from all users. Approve a pending order to credit the balance; reject it if the payment never arrived.'
              )
            : t('View your topup transaction records and payment history')
        }
        contentClassName='flex max-h-(--dialog-available-height) flex-col max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4 sm:max-w-4xl'
        contentHeight='auto'
        bodyClassName='space-y-3'
      >
        <div className='min-h-0 space-y-3'>
          {/* Search and Filter Bar */}
          <div className='flex items-center gap-2'>
            <div className='relative flex-1'>
              <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                placeholder={t('Search by order number...')}
                value={keyword}
                onChange={(e) => handleSearch(e.target.value)}
                className='h-9 pl-10'
              />
            </div>
            {isAdmin && (
              <Select
                items={[
                  { value: 'all', label: t('All statuses') },
                  { value: 'pending', label: t('Pending') },
                  { value: 'success', label: t('Success') },
                  { value: 'failed', label: t('Failed') },
                  { value: 'expired', label: t('Expired') },
                ]}
                value={statusFilter}
                onValueChange={(value) =>
                  value !== null && handleStatusFilterChange(value)
                }
              >
                <SelectTrigger className='h-9 w-[110px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='all'>{t('All statuses')}</SelectItem>
                    <SelectItem value='pending'>{t('Pending')}</SelectItem>
                    <SelectItem value='success'>{t('Success')}</SelectItem>
                    <SelectItem value='failed'>{t('Failed')}</SelectItem>
                    <SelectItem value='expired'>{t('Expired')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            <Select
              items={[
                { value: '10', label: t('10 / page') },
                { value: '20', label: t('20 / page') },
                { value: '50', label: t('50 / page') },
                { value: '100', label: t('100 / page') },
              ]}
              value={pageSize.toString()}
              onValueChange={(value) =>
                value !== null && handlePageSizeChange(Number.parseInt(value))
              }
            >
              <SelectTrigger className='h-9 w-[92px] sm:w-32'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='10'>{t('10 / page')}</SelectItem>
                  <SelectItem value='20'>{t('20 / page')}</SelectItem>
                  <SelectItem value='50'>{t('50 / page')}</SelectItem>
                  <SelectItem value='100'>{t('100 / page')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Records List */}
          <div className='max-h-[min(54vh,520px)] overflow-y-auto pr-1'>
            {loading && (
              <div className='space-y-3'>
                {['first', 'second', 'third', 'fourth', 'fifth'].map(
                  (placeholder) => (
                    <div
                      key={placeholder}
                      className='rounded-lg border p-3 sm:p-4'
                    >
                      <div className='flex items-start justify-between'>
                        <div className='flex-1 space-y-2'>
                          <Skeleton className='h-4 w-48' />
                          <Skeleton className='h-3 w-32' />
                        </div>
                        <Skeleton className='h-5 w-16' />
                      </div>
                      <div className='mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
                        <Skeleton className='h-3 w-full' />
                        <Skeleton className='h-3 w-full' />
                        <Skeleton className='h-3 w-full' />
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            {!loading && records.length === 0 && (
              <div className='text-muted-foreground flex min-h-40 flex-col items-center justify-center py-10 text-center'>
                <p className='text-sm font-medium'>
                  {t('No billing records found')}
                </p>
                <p className='mt-1 text-xs'>
                  {keyword
                    ? t('Try adjusting your search')
                    : t('Your transaction history will appear here')}
                </p>
              </div>
            )}
            {!loading && records.length > 0 && (
              <div className='space-y-3'>
                {records.map((record) => {
                  const statusConfig = getStatusConfig(record.status)
                  return (
                    <div
                      key={record.id}
                      className='rounded-lg border p-3 sm:p-4'
                    >
                      {/* Header Row */}
                      <div className='flex items-start justify-between gap-2'>
                        <div className='flex-1 space-y-1'>
                          <div className='flex min-w-0 items-center gap-2'>
                            <code className='text-foreground truncate font-mono text-sm'>
                              {record.trade_no}
                            </code>
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-5 w-5 p-0'
                              onClick={() => copyToClipboard(record.trade_no)}
                            >
                              {copiedText === record.trade_no ? (
                                <Check className='h-3 w-3' />
                              ) : (
                                <Copy className='h-3 w-3' />
                              )}
                            </Button>
                            {isAdmin && record.user_id != null && (
                              <StatusBadge
                                label={`${t('User ID')}: ${record.user_id}`}
                                variant='neutral'
                                size='sm'
                                copyText={String(record.user_id)}
                              />
                            )}
                          </div>
                          <div className='text-muted-foreground text-xs'>
                            {formatTimestamp(record.create_time)}
                          </div>
                        </div>
                        <StatusBadge
                          label={t(statusConfig.label)}
                          variant={statusConfig.variant}
                          showDot
                          copyable={false}
                        />
                      </div>

                      {/* Details Grid */}
                      <div className='mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:grid-cols-3 sm:gap-4'>
                        <div className='space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Payment Method')}
                          </Label>
                          <div className='text-sm font-medium'>
                            {getPaymentMethodName(record.payment_method, t)}
                          </div>
                        </div>
                        <div className='space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Amount')}
                          </Label>
                          <div className='text-sm font-semibold'>
                            {formatCurrencyFromUSD(record.amount, {
                              digitsLarge: 2,
                              digitsSmall: 2,
                              abbreviate: false,
                            })}
                          </div>
                        </div>
                        <div className='space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Payment')}
                          </Label>
                          <div className='text-sm font-semibold text-red-600'>
                            {formatNumber(record.money)}
                          </div>
                        </div>
                        {record.complete_time ? (
                          <div className='space-y-1'>
                            <Label className='text-muted-foreground text-xs'>
                              {t('Paid at')}
                            </Label>
                            <div className='text-sm font-medium'>
                              {formatTimestamp(record.complete_time)}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {/* Payer-submitted payment reference */}
                      {record.note && (
                        <div className='mt-3 space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Payment note')}
                          </Label>
                          <p className='text-sm break-all whitespace-pre-wrap'>
                            {record.note}
                          </p>
                        </div>
                      )}

                      {/* Order receipt */}
                      <div className='mt-4 flex justify-end'>
                        <Button
                          size='sm'
                          variant='ghost'
                          aria-label={`${t('Details')} ${record.trade_no}`}
                          onClick={() => setDetailRecord(record)}
                        >
                          {t('Details')}
                        </Button>
                      </div>

                      {/* Admin Actions */}
                      {isAdmin && record.status === 'pending' && (
                        <div className='mt-4 flex justify-end gap-2'>
                          {record.payment_provider === 'offline' && (
                            <Button
                              size='sm'
                              variant='outline'
                              className='text-destructive hover:text-destructive'
                              onClick={() =>
                                setConfirm({
                                  tradeNo: record.trade_no,
                                  action: 'reject',
                                })
                              }
                              disabled={rejecting}
                            >
                              {t('Reject')}
                            </Button>
                          )}
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() =>
                              setConfirm({
                                tradeNo: record.trade_no,
                                action: 'approve',
                              })
                            }
                            disabled={completing}
                          >
                            {record.payment_provider === 'offline'
                              ? t('Approve')
                              : t('Complete Order')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && records.length > 0 && (
            <div className='flex flex-col items-center gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='text-muted-foreground text-xs sm:text-sm'>
                {t('Showing')} {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, total)} {t('of')} {total}
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className='h-8 w-8 p-0'
                >
                  <ChevronLeft className='h-4 w-4' />
                </Button>
                <div className='text-muted-foreground flex items-center gap-1 text-sm'>
                  <span className='font-medium'>{page}</span>
                  <span>/</span>
                  <span>{totalPages}</span>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className='h-8 w-8 p-0'
                >
                  <ChevronRight className='h-4 w-4' />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      <OrderDetailDialog
        open={!!detailRecord}
        onOpenChange={(open) => !open && setDetailRecord(null)}
        record={detailRecord}
        payer={detailPayer}
      />

      {/* Confirm Approve / Reject Order Dialog */}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === 'reject'
                ? t('Reject order')
                : t('Complete Order')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === 'reject'
                ? t(
                    'Rejecting this order will mark it as failed without crediting the balance. This action cannot be undone.'
                  )
                : t(
                    'Are you sure you want to manually complete this order? The user will be credited with the corresponding quota.'
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing || rejecting}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={confirmBusy}>
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
