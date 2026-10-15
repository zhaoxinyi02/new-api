import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { CTA, Features, Hero, HowItWorks, Stats } from '../components'

const useStatus = vi.fn()
const usePricingData = vi.fn()

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => useStatus(),
}))

vi.mock('@/features/pricing/hooks', () => ({
  usePricingData: () => usePricingData(),
}))

const i18n = createInstance()
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

// jsdom 没有 IntersectionObserver：统计数字靠它触发，这里让它立刻命中，
// 否则计数器永远停在 0，断言不到真实条数。
class ImmediateIntersectionObserver {
  private readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    )
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: ImmediateIntersectionObserver,
  })
})

beforeEach(async () => {
  useStatus.mockReset()
  usePricingData.mockReset()
  useStatus.mockReturnValue({
    status: { server_address: 'https://api.lansuan.cc' },
    loading: false,
    error: null,
  })
  usePricingData.mockReturnValue({
    models: Array.from({ length: 16 }, (_, i) => ({ key: `model-${i}` })),
  })
  await i18n.use(initReactI18next).init({
    lng: 'zh',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
})

function Landing() {
  return (
    <>
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <CTA />
    </>
  )
}

function renderLanding() {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Landing,
  })
  const signUpRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sign-up',
    component: () => <p>sign-up</p>,
  })
  const pricingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/pricing',
    component: () => <p>pricing</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, signUpRoute, pricingRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <RouterProvider router={router as any} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

it('renders the paid-gateway pitch: key, offline payment and plans', async () => {
  renderLanding()

  expect(
    await screen.findByText('一个 Key，畅通主流大模型')
  ).toBeInTheDocument()
  expect(screen.getByText('OpenAI 兼容，几分钟就能跑通')).toBeInTheDocument()
  expect(
    screen.getByText(
      '注册即用：扫码付款或对公转账充值，按量计费，也可以直接购买包月套餐。统一协议接入 GPT、Claude、Gemini、DeepSeek、通义千问、豆包等主流模型，现有应用只需改一个 base_url。'
    )
  ).toBeInTheDocument()
  expect(screen.getByText('专业 AI 大模型 API 中转网关')).toBeInTheDocument()

  // 套餐/充值必须在首页说清楚，且扫码付款与对公转账都提到
  expect(screen.getByText('套餐与充值')).toBeInTheDocument()
  expect(
    screen.getByText(
      '扫码付款/对公转账充值，也可直接购买包月套餐，期内额度固定不重置。'
    )
  ).toBeInTheDocument()

  // 接入步骤指向本站地址，而不是上游文档里的示例域名
  expect(screen.getByText('三步开始调用')).toBeInTheDocument()
  expect(
    screen.getByText(/把客户端地址指向 https:\/\/api\.lansuan\.cc\/v1/)
  ).toBeInTheDocument()
})

it('shows the live model count and keeps the other service facts', async () => {
  renderLanding()

  expect(await screen.findByText('已上架模型')).toBeInTheDocument()
  expect(screen.getByText('个 Key 即可调用全部模型')).toBeInTheDocument()
  expect(
    screen.getByText('种付款方式：扫码付款 / 对公转账')
  ).toBeInTheDocument()
  expect(screen.getByText('天用量日志可查')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('16')).toBeInTheDocument(), {
    timeout: 4000,
  })
})

it('hides the model count when the public price list is unavailable', async () => {
  usePricingData.mockReturnValue({ models: [] })
  renderLanding()

  await screen.findByText('个 Key 即可调用全部模型')
  expect(screen.queryByText('已上架模型')).not.toBeInTheDocument()
  expect(
    screen.getByText('种付款方式：扫码付款 / 对公转账')
  ).toBeInTheDocument()
})
