import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import TablePage from './pages/TablePage';

const DevMock = lazy(() => import('./dev/DevMock'));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/t/:tableId" element={<TablePage />} />
      {import.meta.env.DEV && (
        <Route
          path="/dev/mock"
          element={
            <Suspense fallback={null}>
              <DevMock />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
