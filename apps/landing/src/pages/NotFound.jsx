import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <h2 className="text-4xl font-bold text-dark mb-4 dark:text-white">404 - Page Not Found</h2>
      <p className="text-gray-500 mb-8 max-w-md dark:text-slate-400">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/" className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:focus-visible:outline-primary-light">
        Return Home
      </Link>
    </div>
  );
}
