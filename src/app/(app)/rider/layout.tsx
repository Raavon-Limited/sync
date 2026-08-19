import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminRoleForEmail } from '@/lib/admin-emails'
// import { DashboardSidebar } from '@/components/dashboard-sidebar'
import { DashboardSidebar } from '@/components/layouts'
// import { getDashboardProfile } from '@/modules/auth/dashboard-profile'
import { getDashboardProfile } from '@/components/layouts/dashboard-profile'
import { DEMO_RIDER_PROFILE } from '@/lib/rider/demo-data'

// ⚠️ TEMPORARY — flip to false (or delete this block) once the rider schema
// and role-assignment are live. Lets you preview the real /rider route with
// the real sidebar/layout while auth+DB aren't ready yet.
const BYPASS_AUTH_FOR_PREVIEW = true

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
    let profile

    if (BYPASS_AUTH_FOR_PREVIEW) {
        profile = DEMO_RIDER_PROFILE
    } else {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) redirect('/login')

        const { data: profileRow } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()

        const role = adminRoleForEmail(user.email) ?? profileRow?.role ?? user.user_metadata?.role
        if (role !== 'rider') redirect('/')

        profile = await getDashboardProfile('rider')
    }

    return (
        <div className="flex min-h-screen bg-surface">
            <aside className="hidden md:block w-64 shrink-0 border-r border-line/10 px-4 py-6">
                <DashboardSidebar navKey="rider" profile={profile} />
            </aside>
            <main className="flex-1 px-4 py-6 md:px-8">
                {children}
            </main>
        </div>
    )
}