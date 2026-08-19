import { Megaphone, Gift, Wallet } from 'lucide-react'

interface Notification { id: string; type: string; title: string; body: string; time: string }

const ICONS: Record<string, React.ReactNode> = {
    promo: <Megaphone size={15} className="text-purple-600 dark:text-purple-400" />,
    bonus: <Gift size={15} className="text-pink-600 dark:text-pink-400" />,
    wallet: <Wallet size={15} className="text-blue-600 dark:text-blue-400" />,
}

export function NotificationsCard({ items }: { items: Notification[] }) {
    return (
        <div className="rounded-xl border border-line/15 bg-panel shadow-xs px-5 py-5">
            <div className="flex items-center justify-between">
                <p className="font-semibold text-content text-sm">Notifications</p>
                <a href="/rider/notifications" className="text-xs font-medium text-content-muted hover:text-content">View all</a>
            </div>

            <div className="mt-3 flex flex-col gap-3">
                {items.map(n => (
                    <div key={n.id} className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-content-muted/8 flex items-center justify-center flex-shrink-0">
                            {ICONS[n.type]}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-content leading-tight">{n.title}</p>
                            <p className="text-[11px] text-content-muted mt-0.5">{n.body}</p>
                            <p className="text-[10px] text-content-muted/70 mt-0.5">{n.time}</p>
                        </div>
                        <span className="h-1.5 w-1.5 rounded-full bg-lime-deep dark:bg-lime flex-shrink-0 mt-1.5" />
                    </div>
                ))}
            </div>
        </div>
    )
}