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

import { deriveAccountCode } from './account-code'

import type { TopupOrderDetail } from '../../types'
import companySealUrl from '../assets/company-seal.png'
import { formatDateTime } from './format'

// The agreement is rendered off-screen and rasterized into the downloadable
// PDF, so it uses fixed pixel layout with inline styles instead of the
// application theme: an A4 page at 96 DPI is 794 x 1123 px.
const PAGE_WIDTH = 794

const styles = {
  page: {
    width: `${PAGE_WIDTH}px`,
    minHeight: '1123px',
    padding: '40px 60px 24px',
    backgroundColor: '#ffffff',
    color: '#1f2329',
    fontFamily:
      "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', sans-serif",
    fontSize: '13px',
    lineHeight: 1.65,
    boxSizing: 'border-box' as const,
  },
  brand: {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '2px',
  },
  docTitle: {
    fontSize: '18px',
    fontWeight: 700,
    textAlign: 'center' as const,
    margin: '12px 0 4px',
    letterSpacing: '6px',
  },
  docNo: {
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '12px',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontWeight: 700,
    margin: '10px 0 2px',
  },
  clause: {
    margin: '0 0 4px',
    textAlign: 'justify' as const,
  },
  indent: {
    margin: '0 0 4px 2em',
    textAlign: 'justify' as const,
  },
  signRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: '20px',
    gap: '24px',
  },
  signCol: {
    flex: '1 1 0',
  },
  seal: {
    width: '150px',
    height: '148px',
    marginLeft: '36px',
    mixBlendMode: 'multiply' as const,
  },
  footerNote: {
    marginTop: '12px',
    borderTop: '1px solid #d9dde3',
    paddingTop: '10px',
    fontSize: '11px',
    color: '#8a919f',
  },
}

/**
 * A4 portrait service agreement that becomes page 1 of the downloadable PDF.
 * The document body is intentionally Chinese-only: it is a formal legal
 * document, not interface copy.
 */
export const AgreementDocument = forwardRef<HTMLDivElement, { detail: TopupOrderDetail }>(
  function AgreementDocument(props, ref) {
    const { order, plan, subscription } = props.detail
    const seller = props.detail.seller || t('Lansuan Technology')
    const accountCode = props.detail.account_code || deriveAccountCode(order.user_id)
    const payer = props.detail.payer || accountCode
    const completeTime = formatDateTime(order.complete_time ?? order.create_time)
    const product = plan ? plan.title : t('Wallet top-up')
    const configuration = plan
      ? `${t('Plan purchase')} · ${formatQuota(plan.total_amount)} / ${formatDuration(plan, t)}`
      : `${t('Credits added')} ${formatCurrencyFromUSD(order.amount, { digitsLarge: 2, digitsSmall: 2, abbreviate: false })}`
    const servicePeriod =
      subscription && subscription.start_time > 0
        ? `${formatDateTime(subscription.start_time)} ~ ${formatDateTime(subscription.end_time)}`
        : `${formatDateTime(order.create_time)} 起按套餐规则生效`

    return (
      <div ref={ref} style={styles.page}>
        <div style={styles.brand}>{seller}</div>
        <div style={styles.docTitle}>服务协议</div>
        <div style={styles.docNo}>No.{order.trade_no}</div>

        <div style={styles.clause}>甲方（“您”）：{payer}</div>
        <div style={styles.clause}>账号编号：{accountCode}</div>
        <div style={styles.clause}>平台：{window.location.host}</div>
        <div style={styles.clause}>乙方（“澜算科技”）：{seller}</div>

        <div style={styles.sectionTitle}>1. 服务内容</div>
        <div style={styles.clause}>
          1.1 您通过您在本平台的账号（{accountCode}）购买或使用乙方提供的产品/服务。本订单购买内容如下：
        </div>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            margin: '6px 0 8px',
            fontSize: '12px',
          }}
        >
          <thead>
            <tr>
              {['序号', '订单号', '产品名称', '配置描述', '服务期限', '创建时间', '应付金额'].map(
                (head) => (
                  <th
                    key={head}
                    style={{
                      border: '1px solid #c9ced6',
                      padding: '5px 8px',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  >
                    {head}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #c9ced6', padding: '5px 8px', textAlign: 'center' }}>1</td>
              <td style={{ border: '1px solid #c9ced6', padding: '5px 8px', wordBreak: 'break-all' }}>
                {order.trade_no}
              </td>
              <td style={{ border: '1px solid #c9ced6', padding: '6px 8px' }}>{product}</td>
              <td style={{ border: '1px solid #c9ced6', padding: '6px 8px' }}>{configuration}</td>
              <td style={{ border: '1px solid #c9ced6', padding: '6px 8px' }}>{servicePeriod}</td>
              <td style={{ border: '1px solid #c9ced6', padding: '6px 8px' }}>
                {formatDateTime(order.create_time)}
              </td>
              <td style={{ border: '1px solid #c9ced6', padding: '5px 8px', textAlign: 'right' }}>
                {formatLocalCurrencyAmount(order.money)}
              </td>
            </tr>
          </tbody>
        </table>
        <div style={styles.clause}>
          1.2 本订单下约定的产品/服务产生的账单、使用量、规格、服务开通和截止日期等以平台系统记录为准，您可通过控制台查询。
        </div>

        <div style={styles.sectionTitle}>2. 计费及结算</div>
        <div style={styles.clause}>
          2.1 本订单为预付费订单，您已按订单金额足额支付。订单金额以支付渠道实际扣款金额为准，为人民币 {
            formatLocalCurrencyAmount(order.money)
          } 元。
        </div>
        <div style={styles.clause}>
          2.2 系统提示的订单有效期内未完成支付的订单将自动失效，相关服务协议同步失效。
        </div>

        <div style={styles.sectionTitle}>3. 税费及发票</div>
        <div style={styles.clause}>
          3.1 平台产品或服务定价均为包含增值税的费用。在服务提供过程中如遇国家税收政策调整，增值税适用税率按照国家政策相应调整，不含税价格保持不变。
        </div>
        <div style={styles.clause}>
          3.2 您可依据已成功支付的订单金额申请开具等额增值税发票，具体开票流程以平台费用中心页面说明为准。
        </div>

        <div style={styles.sectionTitle}>4. 其他</div>
        <div style={styles.clause}>
          4.1 本订单与平台展示的最新版本的《服务协议》《用户协议》及相关公示页面服务规则构成完整协议，具有同等法律效力；本订单与完整协议约定冲突的，以本订单约定为准。
        </div>
        <div style={styles.clause}>
          4.2 若双方签订多份服务订单，各订单相互独立，对本协议的执行情况不改变其他订单的效力、价格及付款方式等约定。
        </div>
        <div style={styles.clause}>（以下无正文）</div>

        <div style={styles.signRow}>
          <div style={styles.signCol}>
            <div>甲方（您）：{payer}</div>
            <div>（甲方签章，个人用户可不盖章）</div>
            <div>日期：{completeTime}</div>
          </div>
          <div style={styles.signCol}>
            <div>乙方（澜算科技）：{seller}</div>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <span>（乙方盖章）</span>
              <img src={companySealUrl} alt='' style={styles.seal} />
            </div>
            <div>日期：{completeTime}</div>
          </div>
        </div>

        <div style={styles.footerNote}>
          本服务协议由系统在订单生成时自动输出，电子签章与订单系统记录具有同等效力。
        </div>
      </div>
    )
  }
)
