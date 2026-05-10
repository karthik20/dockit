import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Home } from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-gray-100">
          <Link to="/" className="flex items-center gap-2.5 text-gray-900 no-underline">
            <BookOpen size={20} className="text-primary" />
            <span className="font-semibold text-base tracking-tight">Dockit</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Link
            to="/"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              location.pathname === '/'
                ? 'bg-primary-light text-primary'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Home size={16} />
            Entries
          </Link>
        </nav>
        <div className="p-3 border-t border-gray-100">
          <Link
            to="/entries/new"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            + New Entry
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
