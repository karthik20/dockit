import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Home, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 bg-bg-alt border-r border-border flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <BookOpen size={20} className="text-primary" />
            <span className="font-semibold text-base tracking-tight text-text">Dockit</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Link
            to="/"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/'
                ? 'bg-primary/10 text-primary'
                : 'text-text-dim hover:bg-surface hover:text-text'
            }`}
          >
            <Home size={16} />
            Entries
          </Link>
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-text-dim hover:bg-surface hover:text-text transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <Link
            to="/entries/new"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            New Entry
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
