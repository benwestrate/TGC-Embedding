import { Link } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4">
      <nav className="page-wrap flex items-center justify-between py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-[var(--sea-ink)] no-underline uppercase"
          >
            The Gospel Coalition
          </Link>
        </h2>

        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
