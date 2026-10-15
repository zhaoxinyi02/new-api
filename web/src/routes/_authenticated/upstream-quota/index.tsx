import { createFileRoute, redirect } from '@tanstack/react-router'

import UpstreamQuotaPage from '@/features/upstream-quota'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/upstream-quota/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({
        to: '/403',
      })
    }
  },
  component: UpstreamQuotaPage,
})
