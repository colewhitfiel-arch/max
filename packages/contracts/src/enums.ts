/**
 * Все enum'ы домена. Значения ДОЛЖНЫ совпадать 1:1 с enum'ами в packages/db/prisma/schema
 * и с docs/04-data-model.md §4.1. Владелец файла — contracts (docs/10-ownership.md).
 */
import { z } from 'zod';

export const ROLES = ['STUDENT', 'PARENT', 'TEACHER', 'SCHOOL_ADMIN'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const LOCALES = ['ru', 'en'] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export const THEMES = ['SYSTEM', 'LIGHT', 'DARK'] as const;
export const ThemeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof ThemeSchema>;

export const LINK_STATUSES = ['PENDING', 'ACTIVE', 'REVOKED'] as const;
export const LinkStatusSchema = z.enum(LINK_STATUSES);
export type LinkStatus = z.infer<typeof LinkStatusSchema>;

export const ENROLLMENT_STATUSES = ['ACTIVE', 'PAUSED', 'LEFT'] as const;
export const EnrollmentStatusSchema = z.enum(ENROLLMENT_STATUSES);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatusSchema>;

export const LESSON_STATUSES = ['PLANNED', 'DONE', 'CANCELLED'] as const;
export const LessonStatusSchema = z.enum(LESSON_STATUSES);
export type LessonStatus = z.infer<typeof LessonStatusSchema>;

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export const AttendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const CourseStatusSchema = z.enum(COURSE_STATUSES);
export type CourseStatus = z.infer<typeof CourseStatusSchema>;

export const BLOCK_TYPES = [
  'TEXT',
  'VIDEO',
  'IMAGE',
  'FILE',
  'QUIZ',
  'QUESTION',
  'PRACTICE',
  'HOMEWORK',
  'INTERACTIVE',
] as const;
export const BlockTypeSchema = z.enum(BLOCK_TYPES);
export type BlockType = z.infer<typeof BlockTypeSchema>;

/** Блоки, которые при публикации курса становятся заданиями (Assignment). */
export const ASSIGNMENT_BLOCK_TYPES = ['QUIZ', 'QUESTION', 'PRACTICE', 'HOMEWORK'] as const;

export const ASSIGNMENT_TYPES = ['HOMEWORK', 'QUIZ', 'QUESTION', 'PRACTICE'] as const;
export const AssignmentTypeSchema = z.enum(ASSIGNMENT_TYPES);
export type AssignmentType = z.infer<typeof AssignmentTypeSchema>;

export const SUBMISSION_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'GRADED',
  'RETURNED',
] as const;
export const SubmissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const BLOCK_PROGRESS_STATUSES = ['OPENED', 'COMPLETED'] as const;
export const BlockProgressStatusSchema = z.enum(BLOCK_PROGRESS_STATUSES);
export type BlockProgressStatus = z.infer<typeof BlockProgressStatusSchema>;

export const FILE_STATUSES = ['UPLOADED', 'EXTRACTING', 'EXTRACTED', 'FAILED'] as const;
export const FileStatusSchema = z.enum(FILE_STATUSES);
export type FileStatus = z.infer<typeof FileStatusSchema>;

export const FILE_PURPOSES = ['MATERIAL', 'SUBMISSION', 'BLOCK_MEDIA', 'AVATAR'] as const;
export const FilePurposeSchema = z.enum(FILE_PURPOSES);
export type FilePurpose = z.infer<typeof FilePurposeSchema>;

export const GENERATION_STAGES = [
  'QUEUED',
  'EXTRACTING',
  'OUTLINING',
  'GENERATING',
  'ASSEMBLING',
  'READY',
  'ACCEPTED',
  'FAILED',
  'CANCELLED',
] as const;
export const GenerationStageSchema = z.enum(GENERATION_STAGES);
export type GenerationStage = z.infer<typeof GenerationStageSchema>;

export const CONVERSATION_KINDS = ['ONBOARDING', 'TUTOR'] as const;
export const ConversationKindSchema = z.enum(CONVERSATION_KINDS);
export type ConversationKind = z.infer<typeof ConversationKindSchema>;

export const MESSAGE_ROLES = ['USER', 'ASSISTANT', 'SYSTEM'] as const;
export const MessageRoleSchema = z.enum(MESSAGE_ROLES);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const INSIGHT_KINDS = [
  'STUDENT_HOME_COMMENT',
  'PARENT_SUMMARY',
  'TEACHER_STUDENT_SUMMARY',
] as const;
export const InsightKindSchema = z.enum(INSIGHT_KINDS);
export type InsightKind = z.infer<typeof InsightKindSchema>;

export const PAYMENT_STATUSES = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const BILLING_PERIODS = ['MONTH'] as const;
export const BillingPeriodSchema = z.enum(BILLING_PERIODS);
export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;

export const NOTIFICATION_TYPES = [
  'LESSON_SOON',
  'LESSON_CANCELLED',
  'ASSIGNMENT_NEW',
  'ASSIGNMENT_DUE',
  'ASSIGNMENT_GRADED',
  'ATTENDANCE_ABSENT',
  'SUBMISSION_RECEIVED',
  'COURSE_PUBLISHED',
  'PAYMENT_DUE',
  'PAYMENT_SUCCEEDED',
  'GENERATION_DONE',
  'INSIGHT_READY',
] as const;
export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const ACTIVITY_TYPES = [
  'APP_OPENED',
  'BLOCK_OPENED',
  'BLOCK_COMPLETED',
  'SUBMISSION_SUBMITTED',
  'LESSON_ATTENDED',
  'TUTOR_MESSAGE',
] as const;
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPES);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

export const TICKET_STATUSES = ['OPEN', 'ANSWERED', 'CLOSED'] as const;
export const TicketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const CLUB_CATEGORIES = [
  'ROBOTICS',
  'PROGRAMMING',
  'LANGUAGES',
  'CHESS',
  'MATH',
  'ART',
  'MUSIC',
  'SPORT',
  'SCIENCE',
  'OTHER',
] as const;
export const ClubCategorySchema = z.enum(CLUB_CATEGORIES);
export type ClubCategory = z.infer<typeof ClubCategorySchema>;

export const CLUB_CATEGORY_LABELS: Record<ClubCategory, string> = {
  ROBOTICS: 'Робототехника',
  PROGRAMMING: 'Программирование',
  LANGUAGES: 'Иностранные языки',
  CHESS: 'Шахматы',
  MATH: 'Математика',
  ART: 'Искусство',
  MUSIC: 'Музыка',
  SPORT: 'Спорт',
  SCIENCE: 'Наука',
  OTHER: 'Другое',
};

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Ученик',
  PARENT: 'Родитель',
  TEACHER: 'Преподаватель',
  SCHOOL_ADMIN: 'Администратор школы',
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Присутствовал',
  ABSENT: 'Отсутствовал',
  LATE: 'Опоздал',
  EXCUSED: 'Уважительная причина',
};

export const BLOCK_TYPE_META: Record<BlockType, { label: string; isAssignment: boolean }> = {
  TEXT: { label: 'Текст', isAssignment: false },
  VIDEO: { label: 'Видео', isAssignment: false },
  IMAGE: { label: 'Изображение', isAssignment: false },
  FILE: { label: 'Файл', isAssignment: false },
  QUIZ: { label: 'Тест', isAssignment: true },
  QUESTION: { label: 'Вопрос', isAssignment: true },
  PRACTICE: { label: 'Практика', isAssignment: true },
  HOMEWORK: { label: 'Домашнее задание', isAssignment: true },
  INTERACTIVE: { label: 'Интерактив', isAssignment: false },
};
