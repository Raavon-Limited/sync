import type { ReactNode } from "react"
import { FavoritesProvider } from "@/app/(app)/food/favorites-context"
import { CartProvider } from "@/app/(app)/food/cart-context"
import { DoodleBackdrop } from "@/components/shared/doodle-backdrop"

/**
 * Wraps every food route - browse, a vendor, checkout, orders, favourites - so
 * the food doodle is applied once here rather than pasted into each screen.
 *
 * FoodLanding is the exception and carries its own: it renders as a
 * `fixed inset-0` overlay, so it escapes this wrapper entirely.
 */
export default function FoodLayout({
    children,
}: {
    children: ReactNode
}) {
    return (
        <FavoritesProvider>
            <CartProvider>
                <div className="relative isolate min-h-full">
                    {/* Weaker and larger-tiled than the townscape, on purpose.
                        The food sheet is packed edge to edge with no paper
                        showing through, so at the house doodle's 5% it reads
                        as a grey wash rather than drawings; a bigger tile also
                        means fewer, larger shapes behind a page that is
                        already a grid of photographed food. */}
                    <DoodleBackdrop
                        art="food"
                        tile={620}
                        className="text-ink/4 dark:text-cream/4"
                    />
                    {children}
                </div>
            </CartProvider>
        </FavoritesProvider>
    )
}
