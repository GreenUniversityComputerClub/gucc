'use client'

import type { ComponentProps } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export function LogoutButton(props: ComponentProps<typeof Button>) {
  const router = useRouter()

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <Button onClick={logout} {...props}>
      {props.children ?? 'Logout'}
    </Button>
  )
}
