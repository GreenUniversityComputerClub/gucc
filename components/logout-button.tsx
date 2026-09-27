'use client'

import { Button } from '@/components/ui/button'
import { logoutAction } from '@/app/auth/actions'

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline">Logout</Button>
    </form>
  )
}
