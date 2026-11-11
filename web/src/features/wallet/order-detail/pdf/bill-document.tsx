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
import { forwardRef } from 'react'
import { t } from 'i18next'

import { formatDuration } from '@/features/subscriptions/lib'
import { formatCurrencyFromUSD, formatLocalCurrencyAmount } from '@/lib/currency'
import { formatQuota } from '@/lib/format'

import { getPaymentMethodName, getStatusConfig } from '../../lib/billing'
import type { TopupOrderDetail } from '../../types'
import financeSealUrl from '../assets/finance-seal.png'
import { deriveAccountCode } from './account-code'
import { formatDateTime } from './format'

// The bill is rendered off-screen and rasterized into the downloadable PDF, so
// it uses fixed pixel layout with inline styles: A4 landscape at 96 DPI is
// 1123 x 794 px.
const PAGE_WIDTH = 1123

const styles = {
  page: {
    width: `${PAGE_WIDTH}px`,
    minHeight: '794px',
    padding: '44px 52px',
    backgroundColor: '#ffffff',
    color: '#1f2329',
    fontFamily:
      "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', sans-serif",
    fontSize: '12px',
    lineHeight: 1.7,
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottom: '2px solid #1f2329',
    paddingBottom: '10px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '4px',
  },
  exportMeta: {
    fontSize: '11px',
    color: '#6b7280',
    textAlign: 'right' as const,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '4px 28px',
    margin: '14px 0 16px',
    fontSize: '12px',
  },
  infoLabel: {
    color: '#6b7280',
    marginRight: '8px',
  },
  summaryRow: {
    display: 'flex',
    gap: '36px',
    margin: '0 0 14px',
    fontSize: '12px',
  },
  summaryItem: {
    color: '#6b7280',
  },
  summaryValue: {
    color: '#1f2329',
    fontWeight: 700,
    marginLeft: '6px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '11.5px',
  },
  th: {
    border: '1px solid #c9ced6',
    padding: '6px 8px',
    fontWeight: 600,
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    border: '1px solid #c9ced6',
    padding: '6px 8px',
    textAlign: 'center' as const,
  },
  totalRow: {
    fontWeight: 700,
  },
  note: {
    marginTop: '12px',
    fontSize: '11px',
    color: '#8a919f',
    lineHeight: 1.6,
  },
  sealWrap: {
    position: 'absolute' as const,
    right: '96px',
    bottom: '104px',
    textAlign: 'center' as const,
  },
  sealLabel: {
    fontSize: '11px',
    color: '#6b7280',
    marginBottom: '2px',
  },
  seal: {
    width: '168px',
    height: '168px',
    mixBlendMode: 'multiply' as const,
  },
}

/**
 * A4 landscape order bill that becomes the last page of the downloadable PDF.
 * Modeled on a monthly bill overview: summary figures, a product consumption
 * table, and the finance seal. Chinese-only formal document.
 */
export const BillDocument = forwardRef<
  HTMLDivElement,
  { detail: TopupOrderDetail; exportedAt?: number }
>(function BillDocument(props, ref) {
  const { order, plan, subscription } = props.detail
    const seller = props.detail.seller || t('Lansuan Technology')
    const payer = props.detail.payer || `${t('User ID')}: ${order.user_id}`
    const statusConfig = getStatusConfig(order.status)
    const money = formatLocalCurrencyAmount(order.money)
    const noDeduction = `-${formatLocalCurrencyAmount(0)}`
    const credited = formatCurrencyFromUSD(order.amount, {
      digitsLarge: 2,
      digitsSmall: 2,
      abbreviate: false,
    })
    const product = plan ? plan.title : t('Wallet top-up')
    const configuration = plan
      ? `${t('Plan purchase')} · ${formatQuota(plan.total_amount)} / ${formatDuration(plan, t)}`
      : `${t('Credits added')} ${credited}`
    const servicePeriod =
      subscription && subscription.start_time > 0
        ? `${formatDateTime(subscription.start_time)} ~ ${formatDateTime(subscription.end_time)}`
        : `${formatDateTime(order.create_time)} 起按套餐规则生效`

    return (
      <div ref={ref} style={styles.page}>
        <div style={styles.titleRow}>
          <div>
            <div style={styles.title}>澜算科技订单账单</div>
            <div style={{ fontSize: '11px', color: '#6b7280', letterSpacing: '1px' }}>
              Lansuan Technology Order Bill
            </div>
          </div>
          <div style={styles.exportMeta}>
            <div>订单号：{order.trade_no}</div>
            <div>导出时间：{formatDateTime(props.exportedAt ?? 0) || '-'}</div>
          </div>
        </div>

        <div style={styles.infoGrid}>
          <div><span style={styles.infoLabel}>客户名称：</span>{payer}</div>
          <div><span style={styles.infoLabel}>订单账号：</span>{props.detail.account_code || deriveAccountCode(order.user_id)}</div>
          <div><span style={styles.infoLabel}>订单状态：</span>{t(statusConfig.label)}</div>
          <div><span style={styles.infoLabel}>服务主体：</span>{seller}</div>
          <div><span style={styles.infoLabel}>支付渠道：</span>{t(getPaymentMethodName(order.payment_method, t))}</div>
          <div><span style={styles.infoLabel}>支付完成时间：</span>{formatDateTime(order.complete_time ?? 0) || '-'}</div>
        </div>

        <div style={styles.summaryRow}>
          <div style={styles.summaryItem}>目录总价<span style={styles.summaryValue}>{money}</span></div>
          <div style={styles.summaryItem}>优惠金额<span style={styles.summaryValue}>{noDeduction}</span></div>
          <div style={styles.summaryItem}>优惠券抵扣<span style={styles.summaryValue}>{noDeduction}</span></div>
          <div style={styles.summaryItem}>应付金额<span style={styles.summaryValue}>{money}</span></div>
          <div style={styles.summaryItem}>已还款金额<span style={styles.summaryValue}>{money}</span></div>
          <div style={styles.summaryItem}>待还款金额<span style={styles.summaryValue}>{formatLocalCurrencyAmount(0)}</span></div>
        </div>

        <div style={{ fontWeight: 700, margin: '2px 0 6px' }}>产品消费汇总</div>
        <table style={styles.table}>
          <thead>
            <tr>
              {[
                '序号',
                '订单号',
                '产品名称',
                '类型',
                '配置描述',
                '服务期限',
                '创建时间',
                '应付金额',
                '现金支付',
              ].map((head) => (
                <th key={head} style={styles.th}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={styles.td}>1</td>
              <td style={{ ...styles.td, wordBreak: 'break-all' }}>{order.trade_no}</td>
              <td style={styles.td}>{product}</td>
              <td style={styles.td}>{t('Plan purchase')} · {t('Prepaid')}</td>
              <td style={styles.td}>{configuration}</td>
              <td style={styles.td}>{servicePeriod}</td>
              <td style={styles.td}>{formatDateTime(order.create_time)}</td>
              <td style={styles.td}>{money}</td>
              <td style={styles.td}>{money}</td>
            </tr>
            <tr style={styles.totalRow}>
              <td style={{ ...styles.td, fontWeight: 700 }} colSpan={7}>总计：</td>
              <td style={{ ...styles.td, fontWeight: 700 }}>{money}</td>
              <td style={{ ...styles.td, fontWeight: 700 }}>{money}</td>
            </tr>
          </tbody>
        </table>

        <div style={styles.note}>
          注：本账单为系统自动生成的订单消费凭证，用于对账与报销存档；实际交易主体以平台出具的发票及双方签署的服务协议为准。如您对本账单有异议，请在账单生成后
          15 个自然日内联系平台客服反馈，逾期视为认可账单内容。
        </div>

        <div style={styles.sealWrap}>
          <div style={styles.sealLabel}>（财务专用章盖章处）</div>
          <img src={financeSealUrl} alt='' style={styles.seal} />
        </div>
      </div>
    )
  }
)
