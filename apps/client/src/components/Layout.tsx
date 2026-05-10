import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Sun, Moon, Plus } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="h-12 bg-bg-alt border-b border-border flex items-center px-4 gap-4 shrink-0">
        <Link to="/" className="flex items-center gap-2 no-underline shrink-0">
          <BookOpen size={18} className="text-primary" />
          <span className="font-semibold text-sm tracking-tight text-text">Dockit</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            to="/"
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              location.pathname === '/'
                ? 'bg-primary/10 text-primary'
                : 'text-text-dim hover:text-text'
            }`}
          >
            Entries
          </Link>
        </nav>

        <div className="flex-1" />

        <Link
          to="/entries/new"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
        >
          <Plus size={14} />
          New
        </Link>

        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md text-text-dim hover:text-text hover:bg-surface transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
