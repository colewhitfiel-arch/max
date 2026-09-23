import { Navigate, type RouteObject } from 'react-router';

/**
 * `/teacher/more` — бывший экран «Ещё». Его разделы переехали в настройки («Работа»:
 * кошелёк, группы, курсы, конструктор, спрос на кружки; роль, тема, выход) — старые ссылки
 * и закладки ведут туда.
 */
export const teacherMoreRoutes: RouteObject[] = [
  { path: 'more', element: <Navigate to="/teacher/settings" replace /> },
];
