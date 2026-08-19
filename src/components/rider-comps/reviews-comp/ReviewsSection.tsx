'use client'

import { useState } from 'react'
import ReviewFilters from './ReviewFilters'
import ReviewsList from './ReviewsList'

export default function ReviewsSection() {
    const [activeStars, setActiveStars] = useState('All')
    const [query, setQuery] = useState('')

    return (
        <div className="flex flex-col gap-4">
            <ReviewFilters
                activeStars={activeStars}
                onStarsChange={setActiveStars}
                query={query}
                onQueryChange={setQuery}
            />
            <ReviewsList activeStars={activeStars} query={query} />
        </div>
    )
}