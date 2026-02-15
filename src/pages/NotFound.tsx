import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 — attempted to access:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4 text-purple-400">404</h1>
        <p className="text-xl text-gray-400 mb-6">Page not found</p>
        <Link
          to="/"
          className="text-purple-400 hover:text-purple-300 underline transition-colors"
        >
          Return to Nova
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
