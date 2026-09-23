/**
 * Домашние задания для аналитики родителя и успеваемости у преподавателя (и «Успеваемости» в
 * профиле ученика — только настоящие задания, `studentClubHomework`) — фейковый сервер повторяет
 * правила analytics (docs/04 §4.6): статусы DONE / FAILED / SOON / LATER, итоги, окно
 * «Выполненные задания».
 *
 * Задания группы = настоящие задания демо-мира (`db.assignments`, сдачи из `db.submissions`)
 * + детерминированно сгенерированные «учебные» задания, чтобы экраны «Успеваемость» и «Задания»
 * выглядели наполненными (робототехника — 45, Python — 30, шахматы — 45). Сгенерированные живут
 * только здесь и видны родителю и преподавателю (у обоих «неправильно» — меньше 30%); ученик их
 * не видит. Дедлайны разложены от −30 до +21 дня от «сейчас», сдачи и баллы засеяны хешем
 * (ученик, задание) — у каждого ребёнка своя картина, одинаковая от запуска к запуску.
 */
import type {
  ChildHomeworkProgress,
  ClubCategory,
  ClubHomework,
  CodeSnippet,
  GroupBrief,
  HomeworkCounts,
  HomeworkTask,
  HomeworkTaskDetail,
  HomeworkTaskStatus,
} from '@edu/contracts';
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { addDays, startOfDay } from '@/shared/lib/dates';
import { dueAtOf, groupBrief, groupIdsOfStudent } from './demo';
import { hash, roll } from './seed';
import { db } from './state';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Дедлайн ближе этого — «скоро» (жёлтый). */
const SOON_MS = 72 * HOUR_MS;
/** Проверено меньше чем на 30% — «неправильно» (красный). */
const FAIL_RATIO = 0.3;
/** У ученика «правильно» — как у кристаллов: проверено больше чем на 75% (docs/04 §4.6). */
const STUDENT_PASS_RATIO = 0.75;
/** Окно дедлайнов сгенерированных заданий, дни от «сейчас». */
const DUE_FROM = -30;
const DUE_TO = 21;
const GENERATED_MAX_SCORE = 10;

/** Сколько всего заданий показать в группе (настоящие + сгенерированные). */
const TASKS_PER_CATEGORY: Partial<Record<ClubCategory, number>> = {
  ROBOTICS: 45,
  PROGRAMMING: 30,
  CHESS: 45,
};
const TASKS_DEFAULT = 24;

/**
 * Сколько процентов прошедших заданий ребёнок не сдал. Алексей в демо сдаёт реже Даши — так на
 * главной родителя видно правило кругов: чем меньше сделано, тем круг больше (docs/04 §4.6).
 */
const SKIP_PERCENT: Partial<Record<string, number>> = { [DEMO_IDS.students.alexey]: 45 };
const SKIP_PERCENT_DEFAULT = 15;
/** Сколько процентов будущих заданий сдано заранее (у «пропускающего» — реже). */
const EARLY_PERCENT: Partial<Record<string, number>> = { [DEMO_IDS.students.alexey]: 5 };
const EARLY_PERCENT_DEFAULT = 20;

// ---------- Банк условий ----------

interface TaskTemplate {
  title: string;
  statement: string;
  code: CodeSnippet | null;
  correctAnswer: string;
  wrongAnswer: string;
}

const python = (source: string): CodeSnippet => ({ language: 'python', source });
const cpp = (source: string): CodeSnippet => ({ language: 'cpp', source });
const text = (source: string): CodeSnippet => ({ language: 'text', source });

const ROBOTICS_TASKS: TaskTemplate[] = [
  {
    title: 'Остановка перед препятствием',
    statement:
      'Подставьте функцию вместо __________, чтобы робот останавливался, когда препятствие находится на расстоянии 15 см или ближе',
    code: python(`def control_robot(distance):
    if distance <= 15:
        __________()
    else:
        move_forward()


def move_forward():
    print("Robot is moving forward")


def stop_robot():
    print("Robot stopped")`),
    correctAnswer: 'stop_robot',
    wrongAnswer: 'move_backward',
  },
  {
    title: 'Поворот в свободную сторону',
    statement:
      'Подставьте команду вместо пропуска, чтобы робот поворачивал в сторону, где больше свободного пространства',
    code: cpp(`int front = readDistance(FRONT);
int left  = readDistance(LEFT);
int right = readDistance(RIGHT);

if (front < 20) {
    stopMotors();
    delay(200);

    if (left > right) {
        turnLeft();
    } else {
        ____________________;
    }
} else {
    moveForward();
}`),
    correctAnswer: 'turnRight()',
    wrongAnswer: 'turnLeft()',
  },
  {
    title: 'Мигающий светодиод',
    statement:
      'Допишите задержку вместо пропусков, чтобы светодиод на 13-м пине мигал ровно раз в секунду',
    code: cpp(`void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(____);
  digitalWrite(13, LOW);
  delay(____);
}`),
    correctAnswer: '500',
    wrongAnswer: '1000',
  },
  {
    title: 'Датчик расстояния',
    statement:
      'Допишите формулу, которая переводит время эха ультразвукового датчика (в микросекундах) в сантиметры',
    code: cpp(`long duration = pulseIn(ECHO_PIN, HIGH);
int distance = ______________;
Serial.println(distance);`),
    correctAnswer: 'duration / 58',
    wrongAnswer: 'duration * 58',
  },
  {
    title: 'Езда по линии',
    statement:
      'Допишите условие, чтобы робот поворачивал налево, когда левый датчик видит чёрную линию',
    code: python(`BLACK = 0

while True:
    left = read_line_sensor("left")
    right = read_line_sensor("right")
    if __________:
        turn_left()
    elif right == BLACK:
        turn_right()
    else:
        move_forward()`),
    correctAnswer: 'left == BLACK',
    wrongAnswer: 'left != BLACK',
  },
  {
    title: 'Скорость мотора',
    statement:
      'Какое значение передать в analogWrite, чтобы мотор крутился примерно на половине мощности?',
    code: cpp(`const int MOTOR_PIN = 9;

void setup() {
  pinMode(MOTOR_PIN, OUTPUT);
}

void loop() {
  analogWrite(MOTOR_PIN, ___);
}`),
    correctAnswer: '127',
    wrongAnswer: '50',
  },
  {
    title: 'Сервопривод',
    statement:
      'Поверните сервопривод так, чтобы манипулятор смотрел прямо вперёд — в середину диапазона',
    code: cpp(`#include <Servo.h>

Servo arm;

void setup() {
  arm.attach(6);
  arm.write(___);
}`),
    correctAnswer: '90',
    wrongAnswer: '180',
  },
  {
    title: 'Счётчик препятствий',
    statement: 'Что выведет программа, если датчик по очереди вернул расстояния из списка?',
    code: python(`distances = [30, 12, 8, 25, 14]
count = 0
for d in distances:
    if d <= 15:
        count += 1
print(count)`),
    correctAnswer: '3',
    wrongAnswer: '2',
  },
  {
    title: 'Схема с кнопкой',
    statement:
      'Нарисуйте схему подключения кнопки к пину 2 без внешнего резистора и напишите, какой режим пина нужен',
    code: null,
    correctAnswer: 'Кнопка между пином 2 и GND, режим INPUT_PULLUP',
    wrongAnswer: 'Кнопка между пином 2 и 5V, режим INPUT',
  },
];

const PROGRAMMING_TASKS: TaskTemplate[] = [
  {
    title: 'Числа от 1 до 10',
    statement: 'Допишите аргументы range, чтобы программа вывела числа от 1 до 10',
    code: python(`for i in range(__________):
    print(i)`),
    correctAnswer: '1, 11',
    wrongAnswer: '1, 10',
  },
  {
    title: 'Чётные числа',
    statement: 'Подставьте оператор вместо пропуска, чтобы программа печатала только чётные числа',
    code: python(`for n in range(1, 21):
    if n % 2 ___ 0:
        print(n)`),
    correctAnswer: '==',
    wrongAnswer: '!=',
  },
  {
    title: 'Сумма списка',
    statement: 'Что выведет программа?',
    code: python(`numbers = [3, 7, 2, 8]
total = 0
for x in numbers:
    total += x
print(total)`),
    correctAnswer: '20',
    wrongAnswer: '8',
  },
  {
    title: 'Обратный отсчёт',
    statement: 'Допишите условие цикла, чтобы отсчёт шёл от 5 до 1',
    code: python(`n = 5
while __________:
    print(n)
    n -= 1
print("Старт!")`),
    correctAnswer: 'n > 0',
    wrongAnswer: 'n >= 0',
  },
  {
    title: 'Заглавные буквы',
    statement: 'Какой метод сделает все буквы имени заглавными?',
    code: python(`name = "alex"
print(name.__________())`),
    correctAnswer: 'upper',
    wrongAnswer: 'capitalize',
  },
  {
    title: 'Наибольшее из трёх',
    statement: 'Допишите функцию, которая возвращает наибольшее из трёх чисел',
    code: python(`def max_of_three(a, b, c):
    return __________


print(max_of_three(4, 9, 2))  # 9`),
    correctAnswer: 'max(a, b, c)',
    wrongAnswer: 'a if a > b else b',
  },
  {
    title: 'Словарь с баллами',
    statement: 'Что выведет программа?',
    code: python(`scores = {"Алексей": 85, "Даша": 92}
scores["Алексей"] += 10
print(scores["Алексей"])`),
    correctAnswer: '95',
    wrongAnswer: '85',
  },
  {
    title: 'Добавление в список',
    statement: 'Подставьте метод вместо пропуска, чтобы добавить элемент в конец списка',
    code: python(`fruits = ["яблоко", "банан"]
fruits.__________("груша")
print(fruits)`),
    correctAnswer: 'append',
    wrongAnswer: 'add',
  },
];

const CHESS_TASKS: TaskTemplate[] = [
  {
    title: 'Мат в один ход',
    statement: 'Белые начинают и ставят мат в один ход. Запишите ход в шахматной нотации',
    code: text(`8 | ♜ . ♝ ♛ ♚ ♝ . ♜
7 | ♟ ♟ ♟ ♟ . ♟ ♟ ♟
6 | . . ♞ . . ♞ . .
5 | . . . . ♟ . . ♕
4 | . . ♗ . ♙ . . .
3 | . . . . . . . .
2 | ♙ ♙ ♙ ♙ . ♙ ♙ ♙
1 | ♖ ♘ ♗ . ♔ . ♘ ♖
    a b c d e f g h`),
    correctAnswer: 'Ф:f7#',
    wrongAnswer: 'Ф:e5+',
  },
  {
    title: 'Вилка конём',
    statement: 'Найдите ход конём, который нападает сразу на короля и ферзя чёрных',
    code: text('FEN: 4k3/8/8/3q4/4N3/8/8/4K3 w - - 0 1'),
    correctAnswer: 'Кf6+',
    wrongAnswer: 'Кc5',
  },
  {
    title: 'Ценность фигур',
    statement: 'Сколько пешек примерно стоит ладья?',
    code: null,
    correctAnswer: '5',
    wrongAnswer: '3',
  },
  {
    title: 'Поля коня',
    statement: 'Сколько полей атакует конь, стоящий на e4 на пустой доске?',
    code: null,
    correctAnswer: '8',
    wrongAnswer: '6',
  },
  {
    title: 'Линейный мат',
    statement: 'Белые ставят мат в два хода двумя ладьями. Запишите первый ход',
    code: text('FEN: 6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1'),
    correctAnswer: 'Лa7',
    wrongAnswer: 'Лb8+',
  },
  {
    title: 'Пат или мат',
    statement: 'Белые: Крf7, Фg6. Чёрные: Крh8. Ход чёрных. Это мат, пат или ни то ни другое?',
    code: null,
    correctAnswer: 'Пат',
    wrongAnswer: 'Мат',
  },
  {
    title: 'Короткая рокировка',
    statement: 'Как записывается короткая рокировка?',
    code: null,
    correctAnswer: '0-0',
    wrongAnswer: '0-0-0',
  },
  {
    title: 'Итальянская партия',
    statement: 'Какой ход белых делает итальянскую партию после 1.e4 e5 2.Кf3 Кc6?',
    code: null,
    correctAnswer: '3.Сc4',
    wrongAnswer: '3.Сb5',
  },
];

const DEFAULT_TASKS: TaskTemplate[] = [
  {
    title: 'Повторение темы',
    statement: 'Перечитайте конспект занятия и ответьте: какие три главные мысли вы запомнили?',
    code: null,
    correctAnswer: 'Три мысли из конспекта',
    wrongAnswer: 'Не помню',
  },
  {
    title: 'Практика',
    statement: 'Выполните упражнение из конспекта и опишите результат в двух-трёх предложениях',
    code: null,
    correctAnswer: 'Упражнение выполнено, результат описан',
    wrongAnswer: 'Результат не описан',
  },
  {
    title: 'Мини-проект',
    statement: 'Подготовьте короткий рассказ о том, что получилось сделать на неделе',
    code: null,
    correctAnswer: 'Рассказ о проекте',
    wrongAnswer: 'Без рассказа',
  },
];

const TEMPLATES_PER_CATEGORY: Partial<Record<ClubCategory, TaskTemplate[]>> = {
  ROBOTICS: ROBOTICS_TASKS,
  PROGRAMMING: PROGRAMMING_TASKS,
  CHESS: CHESS_TASKS,
};

// ---------- Задания группы ----------

/** Задание с «сдачей» ребёнка — общее представление настоящих и сгенерированных. */
interface HomeworkItem {
  assignmentId: string;
  title: string;
  statement: string;
  code: CodeSnippet | null;
  dueAt: string | null;
  publishedAt: string;
  maxScore: number;
  submittedAt: string | null;
  /** null — не сдано или не проверено. */
  score: number | null;
  answer: string | null;
  correctAnswer: string | null;
}

export type HomeworkEntry = HomeworkItem & {
  number: number;
  status: HomeworkTaskStatus;
  scorePercent: number | null;
};

/**
 * Чьими глазами статусы (docs/04 §4.6): у родителя и преподавателя красный — ниже 30%, у ученика —
 * не выше 75% (как у кристаллов).
 */
export type HomeworkViewer = 'parent' | 'teacher' | 'student';

/**
 * Кто видит сгенерированные задания (аналитика родителя и успеваемость у преподавателя); ученику —
 * только настоящие (`studentClubHomework`).
 */
export type AnalyticsViewer = Exclude<HomeworkViewer, 'student'>;

/** Какие группы ученика и чьими глазами. */
export interface HomeworkScope {
  /** Группы ученика; по умолчанию — все его активные (у преподавателя — только свои). */
  groupIds?: string[];
  viewer?: AnalyticsViewer;
}

const failedScore = (score: number, maxScore: number, viewer: HomeworkViewer) =>
  viewer === 'student' ? score / maxScore <= STUDENT_PASS_RATIO : score / maxScore < FAIL_RATIO;

/** Статус по правилам docs/04 §4.6 (лучшая попытка = единственная сдача мока). */
export function homeworkStatus(
  item: Pick<HomeworkItem, 'submittedAt' | 'score' | 'maxScore' | 'dueAt'>,
  now = new Date(),
  viewer: HomeworkViewer = 'parent',
): HomeworkTaskStatus {
  if (item.submittedAt) {
    return item.score !== null && failedScore(item.score, item.maxScore, viewer)
      ? 'FAILED'
      : 'DONE';
  }
  if (!item.dueAt) return 'LATER';
  const left = new Date(item.dueAt).getTime() - now.getTime();
  if (left < 0) return 'FAILED';
  return left <= SOON_MS ? 'SOON' : 'LATER';
}

/** Настоящие опубликованные задания группы и сдачи ребёнка. */
function realItems(studentId: string, groupId: string): HomeworkItem[] {
  return db.assignments
    .filter((a) => a.groupId === groupId && a.publishedAt)
    .map((a) => {
      const s = db.submissions.find((x) => x.assignmentId === a.id && x.studentId === studentId);
      const submitted =
        !!s?.submittedAt && (s.status === 'SUBMITTED' || s.status === 'GRADED') ? s : null;
      return {
        assignmentId: a.id,
        title: a.title,
        statement:
          a.description ??
          (a.type === 'QUIZ' ? 'Пройти тест в курсе и набрать проходной балл.' : a.title),
        code: null,
        dueAt: dueAtOf(a),
        publishedAt: a.publishedAt!,
        maxScore: a.maxScore,
        submittedAt: submitted?.submittedAt ?? null,
        score: submitted?.status === 'GRADED' ? submitted.score : null,
        answer: submitted ? (submitted.text ?? 'Ответ отправлен') : null,
        correctAnswer: null,
      };
    });
}

interface GeneratedSlot {
  id: string;
  template: TaskTemplate;
  title: string;
  dueOffset: number;
  /** Держим несданным, чтобы в сетке всегда была жёлтая клетка. */
  keepOpen: boolean;
}

/** Раскладка сгенерированных заданий группы — одна на всех учеников группы. */
function generatedSlots(
  groupId: string,
  count: number,
  templates: TaskTemplate[],
): GeneratedSlot[] {
  const prefix = hash(groupId).toString(16).padStart(8, '0');
  const span = DUE_TO - DUE_FROM;
  const slots = Array.from({ length: count }, (_, k): GeneratedSlot => {
    const base = DUE_FROM + (count > 1 ? Math.round((k * span) / (count - 1)) : 0);
    const jitter = roll(`${groupId}:${k}`, 'due', 3) - 1;
    const template = templates[k % templates.length]!;
    const round = Math.floor(k / templates.length);
    return {
      id: `${prefix}-0000-7000-a000-${(k + 1).toString(16).padStart(12, '0')}`,
      template,
      title: round === 0 ? template.title : `${template.title} · ${round + 1}`,
      dueOffset: Math.min(DUE_TO, Math.max(DUE_FROM, base + jitter)),
      keepOpen: false,
    };
  });
  // Ближайшее будущее задание — на завтра и несданное: «скоро дедлайн» есть у каждого.
  const next = slots.find((slot) => slot.dueOffset >= 0);
  if (next) {
    next.dueOffset = 1;
    next.keepOpen = true;
  }
  return slots;
}

/** Дедлайн «через N дней в 23:59» — как у демо-заданий (`dueAtOf`). */
function dueDate(offsetDays: number, now: Date): Date {
  const due = addDays(startOfDay(now), offsetDays);
  due.setHours(23, 59, 0, 0);
  return due;
}

/**
 * Сдача ребёнка по сгенерированному заданию. Прошедший дедлайн: ~15% не сдано (`SKIP_PERCENT`), остальное сдано
 * до дедлайна; проверено, если дедлайн был ≥ 2 дней назад (~22% проверенных — меньше 30%).
 * Будущий дедлайн: ~20% сдано заранее (`EARLY_PERCENT`), ещё не проверено.
 */
function generatedItem(studentId: string, slot: GeneratedSlot, now: Date): HomeworkItem {
  const due = dueDate(slot.dueOffset, now);
  const seed = `${studentId}:${slot.id}`;
  let submittedAt: Date | null = null;
  let score: number | null = null;
  if (due.getTime() < now.getTime()) {
    if (roll(seed, 'skip', 100) >= (SKIP_PERCENT[studentId] ?? SKIP_PERCENT_DEFAULT)) {
      submittedAt = new Date(due.getTime() - (roll(seed, 'at', 60) + 2) * HOUR_MS);
      if (slot.dueOffset <= -2) {
        score = roll(seed, 'fail', 100) < 22 ? roll(seed, 'low', 3) : 4 + roll(seed, 'score', 7);
      }
    }
  } else if (
    !slot.keepOpen &&
    roll(seed, 'early', 100) < (EARLY_PERCENT[studentId] ?? EARLY_PERCENT_DEFAULT)
  ) {
    submittedAt = new Date(now.getTime() - (roll(seed, 'at', 36) + 1) * HOUR_MS);
  }
  const failed = score !== null && score / GENERATED_MAX_SCORE < FAIL_RATIO;
  return {
    assignmentId: slot.id,
    title: slot.title,
    statement: slot.template.statement,
    code: slot.template.code,
    dueAt: due.toISOString(),
    publishedAt: addDays(due, -7).toISOString(),
    maxScore: GENERATED_MAX_SCORE,
    submittedAt: submittedAt?.toISOString() ?? null,
    score,
    answer: submittedAt ? (failed ? slot.template.wrongAnswer : slot.template.correctAnswer) : null,
    correctAnswer: score !== null ? slot.template.correctAnswer : null,
  };
}

/**
 * Номер по `dueAt` (без дедлайна — в конце), затем по публикации; статус и процент — по правилам
 * docs/04 §4.6.
 */
function numbered(items: HomeworkItem[], now: Date, viewer: HomeworkViewer): HomeworkEntry[] {
  return [...items]
    .sort(
      (a, b) =>
        Number(a.dueAt === null) - Number(b.dueAt === null) ||
        (a.dueAt ?? '').localeCompare(b.dueAt ?? '') ||
        a.publishedAt.localeCompare(b.publishedAt) ||
        a.assignmentId.localeCompare(b.assignmentId),
    )
    .map((item, index) => ({
      ...item,
      number: index + 1,
      status: homeworkStatus(item, now, viewer),
      scorePercent: item.score === null ? null : Math.round((100 * item.score) / item.maxScore),
    }));
}

/**
 * Все задания группы глазами родителя ребёнка или преподавателя группы (настоящие +
 * сгенерированные; пороги у обоих одинаковые).
 */
export function homeworkOf(
  studentId: string,
  groupId: string,
  now = new Date(),
  viewer: AnalyticsViewer = 'parent',
): HomeworkEntry[] {
  const group = db.groups.find((g) => g.id === groupId);
  const category = db.clubs.find((c) => c.id === group?.clubId)?.category ?? 'OTHER';
  const real = realItems(studentId, groupId);
  const total = TASKS_PER_CATEGORY[category] ?? TASKS_DEFAULT;
  const templates = TEMPLATES_PER_CATEGORY[category] ?? DEFAULT_TASKS;
  const generated = generatedSlots(groupId, Math.max(0, total - real.length), templates).map(
    (slot) => generatedItem(studentId, slot, now),
  );
  return numbered([...real, ...generated], now, viewer);
}

/** correct = DONE, wrong = FAILED, upcoming = SOON + LATER. */
export function homeworkCounts(entries: Pick<HomeworkEntry, 'status'>[]): HomeworkCounts {
  return {
    correct: entries.filter((e) => e.status === 'DONE').length,
    wrong: entries.filter((e) => e.status === 'FAILED').length,
    upcoming: entries.filter((e) => e.status === 'SOON' || e.status === 'LATER').length,
  };
}

export function sumCounts(items: HomeworkCounts[]): HomeworkCounts {
  return items.reduce(
    (acc, c) => ({
      correct: acc.correct + c.correct,
      wrong: acc.wrong + c.wrong,
      upcoming: acc.upcoming + c.upcoming,
    }),
    { correct: 0, wrong: 0, upcoming: 0 },
  );
}

export interface GroupHomework {
  group: GroupBrief;
  entries: HomeworkEntry[];
}

/** Задания по группам ученика: по умолчанию — по всем активным, глазами родителя. */
export function childHomework(
  studentId: string,
  now = new Date(),
  { groupIds = groupIdsOfStudent(studentId), viewer = 'parent' }: HomeworkScope = {},
): GroupHomework[] {
  return groupIds.map((groupId) => ({
    group: groupBrief(groupId),
    entries: homeworkOf(studentId, groupId, now, viewer),
  }));
}

const toTask = (e: HomeworkEntry): HomeworkTask => ({
  assignmentId: e.assignmentId,
  number: e.number,
  title: e.title,
  status: e.status,
  dueAt: e.dueAt,
  scorePercent: e.scorePercent,
});

/**
 * Полоса итогов и сетка статусов по каждому кружку: аналитика ребёнка у родителя или
 * успеваемость ученика у преподавателя (`scope` — только его группы).
 */
export function clubHomeworkOf(
  studentId: string,
  now = new Date(),
  scope: HomeworkScope = {},
): ClubHomework[] {
  return childHomework(studentId, now, scope).map(({ group, entries }) => ({
    club: group.club,
    group,
    counts: homeworkCounts(entries),
    tasks: entries.map(toTask),
  }));
}

/**
 * «Успеваемость» в профиле ученика: только настоящие задания его групп — сгенерированные для
 * родителя ученик не видит (клетка открывает `/student/assignments/:id`); «правильно» — как у
 * кристаллов (docs/04 §4.6). Кружки без заданий не показываются.
 */
export function studentClubHomework(studentId: string, now = new Date()): ClubHomework[] {
  return groupIdsOfStudent(studentId)
    .map((groupId) => {
      const group = groupBrief(groupId);
      const entries = numbered(realItems(studentId, groupId), now, 'student');
      return {
        club: group.club,
        group,
        counts: homeworkCounts(entries),
        tasks: entries.map(toTask),
      };
    })
    .filter((item) => item.tasks.length > 0);
}

/** Задания группы с условиями и ответами (экран «Задания» родителя и преподавателя). */
export function homeworkTaskDetails(
  studentId: string,
  groupId: string,
  now = new Date(),
  viewer: AnalyticsViewer = 'parent',
): HomeworkTaskDetail[] {
  return homeworkOf(studentId, groupId, now, viewer).map((e) => ({
    ...toTask(e),
    statement: e.statement,
    code: e.code,
    answer: e.answer,
    correctAnswer: e.correctAnswer,
    score: e.score,
    maxScore: e.maxScore,
  }));
}

/**
 * «Выполненные задания» за последние `days` дней по каждой группе (docs/04 §4.6): done — сданные
 * в окне, recommended — с дедлайном в окне.
 */
export function homeworkProgress(
  studentId: string,
  days: number,
  now = new Date(),
): ChildHomeworkProgress {
  const from = now.getTime() - days * DAY_MS;
  const inWindow = (value: string | null) => {
    if (!value) return false;
    const t = new Date(value).getTime();
    return t >= from && t <= now.getTime();
  };
  return {
    days,
    items: childHomework(studentId, now).map(({ group, entries }) => ({
      club: group.club,
      group,
      done: entries.filter((e) => inWindow(e.submittedAt)).length,
      recommended: entries.filter((e) => inWindow(e.dueAt)).length,
    })),
  };
}
