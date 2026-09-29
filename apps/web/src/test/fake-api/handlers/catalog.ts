/** Каталог кружков и публичные профили преподавателей. */
import {
  ClubCardSchema,
  ClubDetailSchema,
  TeacherPublicProfileSchema,
  paginated,
} from '@edu/contracts';
import { http } from 'msw';
import { clubBrief, clubCard, scheduleOfGroup, teacherBrief, teacherContacts } from '../demo';
import { apiError, apiUrl, authed, json, query } from '../lib';
import { db } from '../state';

export const catalogHandlers = [
  http.get(
    apiUrl('/catalog/clubs'),
    authed(({ request }) => {
      const category = query(request).get('category');
      const items = db.clubs
        .filter((c) => c.isActive && (!category || c.category === category))
        .map((c) => clubCard(c.id));
      return json(paginated(ClubCardSchema), { items });
    }),
  ),

  http.get<{ clubId: string }>(
    apiUrl('/catalog/clubs/:clubId'),
    authed(({ params }) => {
      const club = db.clubs.find((c) => c.id === params.clubId);
      if (!club) return apiError('NOT_FOUND', 'Кружок не найден');
      return json(ClubDetailSchema, {
        ...clubCard(club.id),
        groups: db.groups
          .filter((g) => g.clubId === club.id)
          .map((g) => ({
            id: g.id,
            title: g.title,
            teacher: teacherBrief(g.teacherId),
            schedule: scheduleOfGroup(g.id),
          })),
      });
    }),
  ),

  http.get<{ teacherId: string }>(
    apiUrl('/teachers/:teacherId'),
    authed(({ params }) => {
      const teacher = db.teachers.find((t) => t.id === params.teacherId);
      if (!teacher) return apiError('NOT_FOUND', 'Преподаватель не найден');
      const clubIds = [
        ...new Set(db.groups.filter((g) => g.teacherId === teacher.id).map((g) => g.clubId)),
      ];
      return json(TeacherPublicProfileSchema, {
        ...teacherBrief(teacher.id),
        qualification: teacher.qualification,
        bio: teacher.bio,
        subjects: teacher.subjects,
        clubs: clubIds.map(clubBrief),
        contacts: teacherContacts(teacher.id),
      });
    }),
  ),
];
