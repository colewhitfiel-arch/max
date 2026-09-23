import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AiIcon,
  AppLayout,
  Avatar,
  Badge,
  BellIcon,
  BookIcon,
  BottomNavigation,
  Button,
  CalendarClockIcon,
  Card,
  ChatBubble,
  ChatComposer,
  ChevronsDownIcon,
  Checkbox,
  Chip,
  ClipboardIcon,
  Divider,
  DockSheet,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FireIcon,
  GemIcon,
  GlobeIcon,
  Grid,
  HomeIcon,
  IconButton,
  IconTile,
  IllustrationRow,
  Inline,
  Input,
  ListRow,
  LockIcon,
  LogoutIcon,
  LifebuoyIcon,
  Modal,
  MoonIcon,
  PageHeader,
  PlusIcon,
  MonthCalendar,
  ProgressBar,
  ProgressRing,
  Screen,
  SegmentedControl,
  SettingsIcon,
  Select,
  SendIcon,
  Sheet,
  SparkIcon,
  StarIcon,
  Skeleton,
  SkeletonText,
  Spinner,
  Stack,
  StatTile,
  Switch,
  Tabs,
  Tag,
  Text,
  TrashIcon,
  TypingIndicator,
  Textarea,
  Toast,
  ToastProvider,
  UserIcon,
  WeekArc,
  PlanetMap,
  PieChart,
  SegmentBar,
  StatusGrid,
  CodeBlock,
  Band,
  CardColumns,
  HeartAvatar,
  HeartCarousel,
  HeartShapeIcon,
  PieChartIcon,
  ProgressBubble,
  ProgressBubbleGroup,
  ScoopPanel,
  WalletChip,
  WalletIcon,
  BarChart,
  ClipboardListIcon,
  DataTable,
  GraduationCapIcon,
  Illustration,
  LineChart,
  WalletHero,
  applyAccent,
  getAccent,
  type Accent,
  applyTheme,
  getTheme,
  useToast,
  type Theme,
  type Tone,
} from '../index';
import './playground.css';

const TONES: Tone[] = ['neutral', 'info', 'success', 'warning', 'danger'];

/** Планета-заглушка для PlanetMap: цветной круг (в приложении — картинки из макета). */
const planet = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="${color}"/><ellipse cx="38" cy="36" rx="16" ry="10" fill="white" opacity="0.35"/></svg>`,
  )}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ui-playground__section">
      <Text variant="title" as="h2" className="ui-playground__section-title">
        {title}
      </Text>
      <Stack gap={4}>{children}</Stack>
    </section>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="ui-playground__row">
      {label && (
        <Text variant="caption" tone="muted" className="ui-playground__row-label">
          {label}
        </Text>
      )}
      <Inline gap={2} align="center">
        {children}
      </Inline>
    </div>
  );
}

function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>(() => getTheme());
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return (
    <SegmentedControl
      aria-label="Тема"
      options={[
        { value: 'light', label: 'Светлая' },
        { value: 'dark', label: 'Тёмная' },
        { value: 'system', label: 'Системная' },
      ]}
      value={theme}
      onChange={(value) => setTheme(value as Theme)}
    />
  );
}

function ToastDemo() {
  const toast = useToast();
  return (
    <Row>
      {TONES.map((tone) => (
        <Button
          key={tone}
          variant="secondary"
          size="sm"
          onClick={() =>
            toast.show({
              tone,
              title: `Тост: ${tone}`,
              description: 'Пояснение к уведомлению',
              action: tone === 'danger' ? { label: 'Повторить', onClick: () => {} } : undefined,
            })
          }
        >
          {tone}
        </Button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => toast.show({ title: 'Липкий', duration: 0 })}
      >
        без таймера
      </Button>
      <Button variant="ghost" size="sm" onClick={() => toast.clear()}>
        очистить
      </Button>
    </Row>
  );
}

function ChatDemo() {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const robot = (
    <IconTile tone="info" size="sm">
      <AiIcon />
    </IconTile>
  );
  return (
    <Stack gap={3}>
      <ChatBubble avatar={robot} meta="12:30">
        Привет! Я твой тьютор. Спроси, что сделать сегодня или как решить задачу.
      </ChatBubble>
      <ChatBubble side="end" meta="12:31">
        Объясни цикл for в Python
      </ChatBubble>
      <ChatBubble avatar={robot} streaming typingLabel="Тьютор печатает…" />
      <ChatBubble avatar={robot} streaming>
        Цикл for перебирает элементы
      </ChatBubble>
      <Row label="TypingIndicator">
        <TypingIndicator />
      </Row>
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => {
          setDraft('');
          setBusy(true);
          setTimeout(() => setBusy(false), 1500);
        }}
        busy={busy}
        onStop={() => setBusy(false)}
        placeholder="Напиши вопрос…"
        inputLabel="Вопрос ИИ-тьютору"
      />
    </Stack>
  );
}

function OverlaysDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <Row>
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Открыть Modal
        </Button>
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Открыть Sheet
        </Button>
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
          Открыть Drawer
        </Button>
      </Row>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Уведомления">
        <Card padding="none">
          <ListRow title="Скоро занятие" subtitle="Робототехника сегодня в 15:00" />
          <ListRow title="Новое задание" subtitle="Задачи 1–10, стр. 52" />
        </Card>
      </Drawer>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        closeLabel="Закрыть окно"
        title="Подтверждение"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={() => setModalOpen(false)}>Подтвердить</Button>
          </>
        }
      >
        <Text>Escape, клик по фону и крестик закрывают окно. Tab зациклен внутри.</Text>
      </Modal>
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Выбор действия"
        footer={
          <Button fullWidth variant="secondary" onClick={() => setSheetOpen(false)}>
            Закрыть
          </Button>
        }
      >
        <Stack gap={0}>
          <ListRow title="Отметить присутствие" onClick={() => setSheetOpen(false)} />
          <ListRow title="Отметить опоздание" onClick={() => setSheetOpen(false)} />
          <ListRow title="Отметить пропуск" onClick={() => setSheetOpen(false)} />
        </Stack>
      </Sheet>
    </>
  );
}

/** Строка «календарь · день · колокольчик» и пристыкованная к ней шторка с месяцем. */
function DockSheetDemo() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  return (
    <>
      <Inline ref={anchorRef} justify="between" align="center" wrap={false}>
        <IconButton aria-label="Календарь" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Text as="span" tone={open ? 'warning' : 'muted'}>
            <CalendarClockIcon size={30} />
          </Text>
        </IconButton>
        <Text as="span">Сегодня</Text>
        <IconButton aria-label="Уведомления: 5">
          <BellIcon size={30} count={5} />
        </IconButton>
      </Inline>
      <DockSheet
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        tab={selected.toLocaleDateString('ru')}
        aside={
          <Stack gap={1}>
            <Text variant="caption" tone="primary">
              17:00–18:30
            </Text>
            <Text variant="caption">Робототехника</Text>
          </Stack>
        }
      >
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={setSelected}
          isMarked={(date) => date.getDay() === 2 || date.getDay() === 4}
        />
      </DockSheet>
    </>
  );
}

function FormsDemo() {
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(false);
  return (
    <Stack gap={4}>
      <Field label="Имя" hint="Как к тебе обращаться">
        <Input placeholder="Введи имя" />
      </Field>
      <Field label="Email" error="Неверный формат" required>
        <Input type="email" defaultValue="user@" />
      </Field>
      <Field label="Недоступно" disabled>
        <Input value="нельзя менять" readOnly />
      </Field>
      <Field label="О себе">
        <Textarea placeholder="Расскажи о своих интересах" />
      </Field>
      <Field label="Класс">
        <Select
          placeholder="Выбери класс"
          defaultValue=""
          options={[
            { value: '5', label: '5 класс' },
            { value: '6', label: '6 класс' },
            { value: '7', label: '7 класс', disabled: true },
          ]}
        />
      </Field>
      <Checkbox
        label="Согласен с правилами"
        description="Можно отозвать в настройках"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <Checkbox label="Недоступный" disabled />
      <Switch
        label="Уведомления"
        description="Напоминания о занятиях"
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
      />
      <Switch label="Недоступный" disabled defaultChecked />
    </Stack>
  );
}

function TabsDemo() {
  const [tab, setTab] = useState('today');
  return (
    <Stack gap={4}>
      <Tabs
        aria-label="Период"
        items={[
          { key: 'today', label: 'Сегодня', icon: <HomeIcon /> },
          { key: 'week', label: 'Неделя' },
          { key: 'month', label: 'Месяц', disabled: true },
          { key: 'all', label: 'Всё время' },
        ]}
        value={tab}
        onChange={setTab}
      >
        {(key) => <Text tone="muted">Панель вкладки «{key}»</Text>}
      </Tabs>
      <Tabs
        fitted
        items={[
          { key: 'a', label: 'Ученик' },
          { key: 'b', label: 'Родитель' },
        ]}
      />
      <Row label="SegmentedControl">
        <SegmentedControl
          aria-label="Период"
          options={[
            { value: '7', label: '7 дней' },
            { value: '30', label: '30 дней' },
            { value: '90', label: '90 дней', disabled: true },
          ]}
          defaultValue="30"
        />
        <SegmentedControl
          aria-label="Маленький"
          size="sm"
          options={[
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ]}
        />
      </Row>
      <SegmentedControl
        aria-label="На всю ширину"
        fullWidth
        options={[
          { value: 'list', label: 'Список' },
          { value: 'calendar', label: 'Календарь' },
        ]}
      />
    </Stack>
  );
}

function LayoutDemo() {
  const [active, setActive] = useState('home');
  return (
    <div className="ui-playground__frame">
      <AppLayout
        header={
          <PageHeader
            title="Главная"
            subtitle="Понедельник, 21 сентября"
            onBack={() => {}}
            backLabel="Назад к списку"
            actions={
              <IconButton aria-label="Уведомления">
                <BellIcon />
              </IconButton>
            }
          />
        }
        bottomNav={
          <BottomNavigation
            items={[
              { key: 'home', label: 'Главная', icon: <HomeIcon />, active: active === 'home' },
              {
                key: 'tutor',
                label: 'Тьютор',
                icon: <AiIcon />,
                active: active === 'tutor',
                badge: 3,
              },
              {
                key: 'courses',
                label: 'Курсы',
                icon: <BookIcon />,
                active: active === 'courses',
                prominent: true,
              },
              {
                key: 'settings',
                label: 'Настройки',
                icon: <SettingsIcon />,
                active: active === 'settings',
              },
              {
                key: 'profile',
                label: 'Профиль',
                icon: <UserIcon />,
                active: active === 'profile',
              },
            ]}
            onSelect={setActive}
          />
        }
      >
        <AppLayout.Content>
          <PageHeader
            variant="plain"
            title="Профиль"
            onBack={() => {}}
            actions={
              <IconButton aria-label="Уведомления">
                <Text as="span" tone="muted">
                  <BellIcon size={30} count={2} />
                </Text>
              </IconButton>
            }
          />
          <Screen>
            <Text variant="title">Экран «{active}»</Text>
            <Inline gap={3}>
              <StatTile label="Посещаемость" value="92%" hint="за 30 дней" tone="success" />
              <StatTile label="Задания" value="3" hint="к сдаче" tone="warning" />
            </Inline>
            <Card padding="none">
              <ListRow
                left={<Avatar name="Мария Иванова" />}
                title="Робототехника"
                subtitle="Сегодня, 15:30 · каб. 12"
                right={<Badge tone="info">через 2 ч</Badge>}
                onClick={() => {}}
              />
              <ListRow
                left={<Avatar name="Пётр Сидоров" />}
                title="Шахматы"
                subtitle="Завтра, 10:00"
                onClick={() => {}}
              />
            </Card>
            {Array.from({ length: 6 }, (_, i) => (
              <Card key={i}>
                <Text>Карточка для проверки скролла №{i + 1}</Text>
              </Card>
            ))}
          </Screen>
        </AppLayout.Content>
      </AppLayout>
    </div>
  );
}

const DEMO_TASK_TONES: Tone[] = ['success', 'success', 'danger', 'warning', 'neutral'];
const DEMO_TASK_STATUS: Record<Tone, string> = {
  success: 'выполнено',
  danger: 'неправильно',
  warning: 'скоро дедлайн',
  neutral: 'позже',
  info: '',
};

const DEMO_CODE = `def control_robot(distance):
    if distance <= 15:
        __________()
    else:
        move_forward()


def stop_robot():
    print("Robot stopped")  # готово`;

const DEMO_CPP = `#include <Servo.h>
int front = readDistance(FRONT);

if (front < 20) {
    stopMotors();
    delay(200);
} else {
    ____________________;
}`;

/** Аналитика родителя: круговая диаграмма, полосы кружков с раскрытием, сетка заданий, код. */
function ParentAnalyticsDemo() {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const tasks = Array.from({ length: 45 }, (_, index) => {
    const tone = DEMO_TASK_TONES[(index * 7) % DEMO_TASK_TONES.length] ?? 'neutral';
    return {
      key: `task-${index + 1}`,
      label: String(index + 1),
      tone,
      title: `Задание ${index + 1} — ${DEMO_TASK_STATUS[tone]}`,
    };
  });
  return (
    <Stack gap={4}>
      <Card>
        <PieChart
          aria-label="Правильно 25, неправильно 30, предстоят 45"
          slices={[
            { key: 'correct', value: 25, tone: 'success', explode: true },
            { key: 'wrong', value: 30, tone: 'danger' },
            { key: 'upcoming', value: 45, tone: 'warning' },
          ]}
          legend={[
            { tone: 'success', label: 'Правильно' },
            { tone: 'danger', label: 'Неправильно' },
            { tone: 'warning', label: 'Предстоят' },
          ]}
        />
      </Card>
      <Row label="PieChart: один сектор / все нули">
        <PieChart
          size={80}
          aria-label="Правильно 12"
          slices={[{ key: 'correct', value: 12, tone: 'success', explode: true }]}
        />
        <PieChart size={80} aria-label="Нет заданий" slices={[]} />
      </Row>
      <Band as="section" aria-label="Робототехника">
        <Stack gap={2}>
          <Text weight="bold">Робототехника</Text>
          <SegmentBar
            aria-label="Задания по робототехнике"
            segments={[
              { key: 'correct', value: 18, tone: 'success', label: 'Правильно' },
              { key: 'upcoming', value: 20, tone: 'warning', label: 'Предстоят' },
              { key: 'wrong', value: 7, tone: 'danger', label: 'Неправильно' },
            ]}
          />
          <div>
            <Button
              variant="link"
              underline={expanded}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Скрыть' : 'Подробнее'}
            </Button>
          </div>
          {expanded && (
            <StatusGrid
              aria-label="Задания по робототехнике"
              items={tasks}
              onSelect={setSelected}
            />
          )}
          {selected && (
            <Text variant="caption" tone="muted">
              Выбрано: {selected}
            </Text>
          )}
        </Stack>
      </Band>
      <Band as="section" aria-label="Шахматы">
        <Stack gap={2}>
          <Text weight="bold">Шахматы (одна категория, редкие нули)</Text>
          <SegmentBar
            aria-label="Задания по шахматам"
            segments={[
              { key: 'correct', value: 1, tone: 'success', label: 'Правильно' },
              { key: 'upcoming', value: 0, tone: 'warning', label: 'Предстоят' },
              { key: 'wrong', value: 40, tone: 'danger', label: 'Неправильно' },
            ]}
          />
          <SegmentBar aria-label="Нет заданий" segments={[]} />
        </Stack>
      </Band>
      <Band tone="subtle">
        <Text variant="title" as="h3">
          Робототехника (tone=&quot;subtle&quot; — полоса курса над заданиями)
        </Text>
      </Band>
      <Band>
        <Stack gap={3}>
          <Text weight="medium">Задание 9</Text>
          <CodeBlock code={DEMO_CODE} language="python" />
          <CodeBlock code={DEMO_CPP} language="cpp" />
          <CodeBlock
            language="javascript"
            code={`// очень длинная строка прокручивается по горизонтали, а не переносится
const answer = await fetch(\`/api/tasks/\${id}\`).then((response) => response.json());`}
          />
        </Stack>
      </Band>
    </Stack>
  );
}

const DEMO_CHILDREN = [
  { key: 'a', name: 'Иванов Егор', label: 'Иванов Е. А', src: planet('#2cda00') },
  { key: 'b', name: 'Петрова Анна', label: 'Петрова А. С' },
  { key: 'c', name: 'Сидоров Олег', label: 'Сидоров О. И', src: planet('#00da91') },
  { key: 'd', name: 'Кузнецова Мила', label: 'Кузнецова М. Д' },
  { key: 'e', name: 'Орлов Тимур', label: 'Орлов Т. Р', src: planet('#f2b705') },
];

/** Правило главной родителя: чем больше сделано из рекомендованного, тем меньше круг. */
const bubbleSize = (done: number, recommended: number) => {
  const ratio = recommended > 0 ? Math.min(done / recommended, 1) : done > 0 ? 1 : 0;
  return 170 - (170 - 112) * ratio;
};

/** Главная родителя: акцент, дети-сердца, кошелёк, панель с вогнутым краем, круги прогресса. */
function ParentHomeDemo() {
  const toast = useToast();
  const [accent, setAccent] = useState<Accent>(() => getAccent());
  const [count, setCount] = useState(3);
  const [child, setChild] = useState<string | null>('a');
  const [period, setPeriod] = useState('7');
  const [chess, setChess] = useState(28);
  useEffect(() => {
    applyAccent(accent);
  }, [accent]);
  // Уход со страницы — вернуть синий акцент остальному приложению.
  useEffect(() => () => applyAccent('blue'), []);
  const kids = DEMO_CHILDREN.slice(0, count);
  return (
    <Stack gap={4}>
      <Row label="Акцент (applyAccent)">
        <SegmentedControl
          aria-label="Акцент"
          options={[
            { value: 'blue', label: 'Синий — ученик' },
            { value: 'green', label: 'Зелёный — родитель' },
            { value: 'orange', label: 'Оранжевый — репетитор' },
          ]}
          value={accent}
          onChange={(value) => setAccent(value as Accent)}
        />
      </Row>
      <Inline justify="between">
        <Inline gap={2}>
          <Avatar name="Фамилия Анна" />
          <Text>Фамилия А. В</Text>
        </Inline>
        <WalletChip
          amount="6700"
          aria-label="Баланс 6700 ₽, пополнить"
          onClick={() => toast.show({ title: 'Пополнение баланса' })}
        />
      </Inline>
      <HeartCarousel
        aria-label="Дети"
        items={kids}
        value={child}
        onChange={setChild}
        onAdd={() => {
          const next = DEMO_CHILDREN[count];
          if (!next) return;
          setCount(count + 1);
          setChild(next.key);
        }}
        addLabel="Добавить"
      />
      <Row label="Детей в ленте">
        {[0, 1, 3, 5].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === count ? 'primary' : 'secondary'}
            onClick={() => {
              setCount(value);
              setChild(value > 0 ? 'a' : null);
            }}
          >
            {`Детей: ${value}`}
          </Button>
        ))}
      </Row>
      <ScoopPanel>
        <Stack gap={5}>
          <CardColumns
            aria-label="Расписание на сегодня"
            columns={[
              {
                key: 'name',
                header: 'Название',
                fit: true,
                action: {
                  label: 'Добавить кружок',
                  onClick: () => toast.show({ title: 'Добавить кружок' }),
                },
              },
              { key: 'teacher', header: 'Репетитор', align: 'center' },
              { key: 'time', header: 'Время', align: 'center', nowrap: true },
            ]}
            rows={[
              {
                key: 'robo',
                cells: { name: 'Робототехника', teacher: 'Фамилия А. В', time: '17:00-18:30' },
              },
              {
                key: 'chess',
                cells: { name: 'Шахматы', teacher: 'Фамилия А. В', time: '19:00-20:30' },
              },
            ]}
          />
          <Inline justify="between">
            <Text variant="caption" weight="bold">
              Выполненные задания
            </Text>
            <SegmentedControl
              aria-label="Период"
              variant="accent"
              options={[
                { value: '1', label: '1 день' },
                { value: '7', label: '7 дней' },
                { value: '30', label: '30 дней' },
              ]}
              value={period}
              onChange={setPeriod}
            />
          </Inline>
          <ProgressBubbleGroup aria-label="Выполненные задания по кружкам">
            <ProgressBubble
              size={bubbleSize(chess, 45)}
              title="Шахматы"
              image={planet('#f2b705')}
              value={chess}
              suffix="/45*"
              aria-label={`Шахматы: ${chess} из 45 рекомендованных`}
            />
            <ProgressBubble
              size={bubbleSize(30, 30)}
              title="Робототехника"
              image={planet('#2cda00')}
              value={30}
              suffix="/30*"
            />
            <ProgressBubble
              size={bubbleSize(0, 12)}
              title="Программирование"
              image={planet('#5b3fd6')}
              value={0}
              suffix="/12*"
            />
          </ProgressBubbleGroup>
          <Row label="Круг сжимается, когда заданий сделано больше">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setChess((v) => Math.min(45, v + 5))}
            >
              +5 заданий
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChess(0)}>
              Ничего не сделано
            </Button>
          </Row>
        </Stack>
      </ScoopPanel>
      <Row label="HeartAvatar: primary / accent / plain + add / инициалы">
        <HeartAvatar name="Иванов Егор" src={planet('#2cda00')} />
        <HeartAvatar name="Петрова Анна" tone="accent" size={100} />
        <HeartAvatar name="Добавить ребёнка" tone="plain" add size={80} />
      </Row>
      <Row label="Иконки родителя">
        <PieChartIcon size={32} />
        <Text as="span" tone="primary">
          <WalletIcon size={32} />
        </Text>
        <Text as="span" tone="success">
          <HeartShapeIcon size={32} />
        </Text>
      </Row>
    </Stack>
  );
}

/** Иллюстрация-заглушка главной репетитора 342×256 (в приложении — картинка из макета). */
const TUTOR_ART = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 256"><rect x="70" y="40" width="200" height="130" rx="10" fill="#2a2a2a"/><rect x="82" y="56" width="52" height="60" rx="6" fill="#3a3a3a"/><rect x="144" y="56" width="52" height="60" rx="6" fill="#3a3a3a" stroke="#ffa600" stroke-width="2"/><rect x="206" y="56" width="52" height="60" rx="6" fill="#3a3a3a"/><circle cx="108" cy="78" r="12" fill="#ffa600"/><circle cx="170" cy="78" r="12" fill="#ffa600"/><circle cx="232" cy="78" r="12" fill="#ffa600"/><rect x="82" y="128" width="96" height="30" rx="6" fill="#3a3a3a"/><rect x="190" y="128" width="68" height="30" rx="6" fill="#3a3a3a"/><circle cx="150" cy="190" r="18" fill="#1e1e1e"/><rect x="138" y="206" width="24" height="44" rx="8" fill="#1e1e1e"/><path d="M270 210c10-30 30-40 40-60-4 26-18 44-40 60z" fill="#ffa600"/></svg>`,
)}`;

const DEMO_HOURS = ['4:00', '8:00', '12:00', '16:00', '20:00', '00:00'];
const DEMO_WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const DEMO_MONTH_LABELS = ['24.08', '29.08', '3.09', '8.09', '13.09', '18.09', '23.09'];

/** Баланс по точкам для периода (рубли): ступеньки поступлений и один вывод. */
function demoBalance(period: string, balance: number): number[] {
  if (period === 'day') return [2700, 2700, 7200, 7200, 7200, balance];
  if (period === 'week') return [15200, 18200, 5812, 8812, 9312, 9312, balance];
  return Array.from({ length: 30 }, (_, day) =>
    day === 29 ? balance : 3000 + ((day * 1700) % 14000),
  );
}

const TX_COLUMNS = [
  { key: 'group', header: 'Группа', align: 'center' as const, weight: 52 },
  { key: 'name', header: 'ФИО ученика', weight: 125 },
  { key: 'sum', header: 'Сумма', align: 'center' as const, weight: 68, nowrap: true },
  { key: 'time', header: 'Время', align: 'center' as const, weight: 76, nowrap: true },
];

const txRow = (key: string, group: string, sum: string, time: string, withdrawal = false) => ({
  key,
  tone: withdrawal ? ('danger' as const) : undefined,
  cells: {
    group: withdrawal ? (
      <Text as="span" variant="caption" tone="danger">
        {group}
      </Text>
    ) : (
      group
    ),
    name: withdrawal ? 'Вывод' : 'Фамилия А. Б.',
    sum: (
      <Text as="span" variant="caption" weight="medium" tone={withdrawal ? 'danger' : 'success'}>
        {sum}
      </Text>
    ),
    time,
  },
});

/** Главная, кошелёк и успеваемость репетитора: иллюстрация, «зебра», графики, таблица. */
function TutorDemo() {
  const toast = useToast();
  const [period, setPeriod] = useState('day');
  const [performancePeriod, setPerformancePeriod] = useState('day');
  const [balance, setBalance] = useState(6700);
  const points = demoBalance(period, balance).map((value, index) => ({
    key: String(index),
    value,
  }));
  const xLabels = period === 'day' ? DEMO_HOURS : period === 'week' ? DEMO_WEEK : DEMO_MONTH_LABELS;
  const top = Math.max(...points.map((point) => point.value));
  return (
    <Stack gap={4}>
      <Row label="Иконки меню репетитора">
        <Text as="span" tone="muted">
          <ClipboardListIcon size={40} />
        </Text>
        <Text as="span" tone="primary">
          <GraduationCapIcon size={47} />
        </Text>
      </Row>
      <Inline justify="between">
        <Inline gap={2}>
          <Avatar name="Мария Иванова" />
          <Text>Иванова М. П.</Text>
        </Inline>
        <WalletChip
          amount={String(balance)}
          plus={false}
          aria-label={`Баланс ${balance} ₽, открыть кошелёк`}
          onClick={() => toast.show({ title: 'Открыть кошелёк' })}
        />
      </Inline>
      <Illustration src={TUTOR_ART} />
      <CardColumns
        aria-label="Расписание на сегодня"
        striped
        columns={[
          { key: 'name', header: 'Название', fit: true },
          { key: 'group', header: 'Группа', align: 'center', nowrap: true },
          { key: 'time', header: 'Время', align: 'center', nowrap: true },
        ]}
        rows={[
          {
            key: 'a',
            cells: {
              name: 'Робототехника',
              group: '001',
              time: (
                <Text as="span" variant="small" tone="primary">
                  12:00-13:30
                </Text>
              ),
            },
          },
          { key: 'b', cells: { name: 'Китайский', group: '012', time: '16:30-18:00' } },
          { key: 'c', cells: { name: 'Робототехника', group: '002', time: '19:00-20:30' } },
        ]}
      />

      <Text variant="caption" tone="muted">
        Кошелёк: WalletHero + переключатель периода + LineChart (ступенчатая линия)
      </Text>
      <Inline gap={4} align="start" wrap={false}>
        <WalletHero
          amount={String(balance)}
          aria-label={`Баланс ${balance} ₽`}
          actionLabel="Вывести"
          actionDisabled={balance === 0}
          onAction={() => {
            setBalance(0);
            toast.show({ title: 'Вывод оформлен (демо)' });
          }}
        />
        <Stack gap={2} align="end" style={{ flex: 1, minWidth: 0 }}>
          <SegmentedControl
            aria-label="Период"
            variant="accent"
            options={[
              { value: 'day', label: '1 день' },
              { value: 'week', label: '7 дней' },
              { value: 'month', label: '30 дней' },
            ]}
            value={period}
            onChange={setPeriod}
          />
          <LineChart
            title="Изменение баланса"
            aria-label={`Баланс за период: до ${balance} ₽, максимум ${top} ₽`}
            points={points}
            xLabels={xLabels}
            step
            style={{ alignSelf: 'stretch' }}
          />
        </Stack>
      </Inline>
      <Row label="Баланс">
        <Button size="sm" variant="secondary" onClick={() => setBalance(6700)}>
          Вернуть 6700
        </Button>
      </Row>

      <Text variant="caption" weight="bold">
        Транзакции
      </Text>
      <Stack gap={3}>
        <CardColumns
          aria-label="Транзакции за вчера"
          caption="вчера"
          variant="compact"
          striped
          columns={TX_COLUMNS}
          rows={[
            txRow('t1', '001', '2500', '10:00'),
            txRow('t2', '012', '5000', '17:00'),
            txRow('t3', '003', '3000', '17:28'),
            txRow('t4', '—', '12388', '19:00', true),
          ]}
        />
        <CardColumns
          aria-label="Транзакции за сегодня"
          caption="сегодня"
          variant="compact"
          striped="even"
          showHeader={false}
          columns={TX_COLUMNS}
          rows={[txRow('t5', '001', '2500', '10:00'), txRow('t6', '012', '5000', '17:00')]}
        />
      </Stack>
      <Text variant="caption" weight="bold">
        Вам должны
      </Text>
      <CardColumns
        aria-label="Вам должны"
        variant="compact"
        striped="even"
        columns={[
          ...TX_COLUMNS.slice(0, 3),
          { key: 'date', header: 'Дата', align: 'center', weight: 76, nowrap: true },
        ]}
        rows={[
          { key: 'd1', group: '001', sum: '2500', date: '24.10.26', overdue: true },
          { key: 'd2', group: '012', sum: '5000', date: '27.10.26', overdue: false },
          { key: 'd3', group: '003', sum: '3000', date: '1.11.26', overdue: false },
        ].map((debt) => ({
          key: debt.key,
          cells: {
            group: debt.group,
            name: 'Фамилия А. Б.',
            sum: (
              <Text as="span" variant="caption" weight="medium" tone="primary">
                {debt.sum}
              </Text>
            ),
            date: (
              <Text as="span" variant="caption" tone={debt.overdue ? 'danger' : 'default'}>
                {debt.date}
              </Text>
            ),
          },
        }))}
      />

      <Row label="Общая успеваемость: BarChart + DataTable">
        <SegmentedControl
          aria-label="Период успеваемости"
          variant="accent"
          options={[
            { value: 'day', label: '1 день' },
            { value: 'week', label: '7 дней' },
            { value: 'month', label: '30 дней' },
            { value: 'course', label: '1 курс' },
          ]}
          value={performancePeriod}
          onChange={setPerformancePeriod}
        />
      </Row>
      <BarChart
        title="Посещения"
        aria-label="Группа 001: посетили 15, пропустили 4; группа 003: посетили 12, пропустили 3; группа 007: занятий не было"
        legend={[
          {
            key: 'robotics',
            title: 'Робототехника',
            tone: 'primary',
            items: [{ label: 'посетили' }, { label: 'пропустили', dim: true }],
          },
          {
            key: 'chinese',
            title: 'Китайский',
            tone: 'success',
            items: [{ label: 'посетили' }, { label: 'пропустили', dim: true }],
          },
        ]}
        bars={[
          {
            key: '001',
            label: '001',
            tone: 'primary',
            segments: [
              { key: 'attended', value: performancePeriod === 'day' ? 15 : 60 },
              { key: 'missed', value: 4, dim: true },
            ],
          },
          {
            key: '003',
            label: '003',
            tone: 'success',
            segments: [
              { key: 'attended', value: performancePeriod === 'day' ? 12 : 44 },
              { key: 'missed', value: 3, dim: true },
            ],
          },
          { key: '007', label: '007', tone: 'info', segments: [{ key: 'attended', value: 0 }] },
        ]}
      />
      <Text variant="caption" tone="muted">
        BarChart: 11 групп и длинная легенда — столбцы ужимаются, дальше прокрутка
      </Text>
      <BarChart
        title="Посещения"
        aria-label="Одиннадцать групп: посещения по каждой"
        legend={[
          {
            key: 'robotics',
            title: 'Робототехника и электроника',
            tone: 'primary',
            items: [{ label: 'посетили' }, { label: 'пропустили', dim: true }],
          },
        ]}
        bars={Array.from({ length: 11 }, (_, index) => ({
          key: `g${index}`,
          label: String(index + 1).padStart(3, '0'),
          tone: 'primary' as const,
          segments: [
            { key: 'attended', value: 8 + ((index * 5) % 11) },
            { key: 'missed', value: index % 4, dim: true },
          ],
        }))}
      />
      <DataTable
        caption="Домашние задания по группам"
        columns={[
          { key: 'group', header: 'Группа', weight: 1 },
          {
            key: 'correct',
            header: 'Правильно выполненные дз',
            align: 'center',
            weight: 2.2,
            tone: 'success',
          },
          { key: 'done', header: 'Выполненные дз', align: 'center', weight: 1.5, tone: 'primary' },
        ]}
        rows={['001', '003', '012'].map((group, index) => ({
          key: group,
          cells: { group, correct: 30 - index * 7, done: 50 - index * 9 },
          'aria-label': `Группа ${group}: ученики`,
          onClick: () => toast.show({ title: `Группа ${group}` }),
        }))}
      />
      <BottomNavigation
        aria-label="Меню репетитора"
        items={[
          { key: 'home', label: 'Главная', icon: <HomeIcon />, active: true },
          {
            key: 'assignments',
            label: 'Задания',
            icon: <ClipboardListIcon />,
            iconSize: 'lg',
          },
          {
            key: 'performance',
            label: 'Успеваемость',
            icon: <GraduationCapIcon />,
            prominent: true,
          },
          { key: 'settings', label: 'Настройки', icon: <SettingsIcon /> },
          { key: 'profile', label: 'Профиль', icon: <UserIcon /> },
        ]}
        onSelect={(key) => toast.show({ title: `Меню: ${key}` })}
      />
    </Stack>
  );
}

function PlaygroundContent() {
  return (
    <div className="ui-playground">
      <header className="ui-playground__header">
        <Text variant="heading">UI Playground</Text>
        <Text tone="muted">
          Все компоненты @edu/ui во всех вариантах. Визуал временный — заменяется в токенах и CSS.
        </Text>
        <ThemeSwitcher />
      </header>

      <Section title="Text">
        <Text variant="heading">Heading 24px</Text>
        <Text variant="title">Title 20px</Text>
        <Text variant="body">Body 16px — основной текст интерфейса.</Text>
        <Text variant="caption">Caption 12px — подписи и вспомогательный текст.</Text>
        <Row label="tone">
          <Text tone="muted">muted</Text>
          <Text tone="primary">primary</Text>
          <Text tone="success">success</Text>
          <Text tone="warning">warning</Text>
          <Text tone="danger">danger</Text>
        </Row>
        <Text truncate style={{ maxWidth: 240 }}>
          Очень длинный текст, который обрезается многоточием, если не помещается в одну строку.
        </Text>
      </Section>

      <Section title="Button">
        {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
          <Row key={variant} label={variant}>
            <Button variant={variant} size="sm">
              Small
            </Button>
            <Button variant={variant}>Medium</Button>
            <Button variant={variant} size="lg">
              Large
            </Button>
            <Button variant={variant} leftIcon={<PlusIcon />}>
              Иконка
            </Button>
            <Button variant={variant} loading>
              Загрузка
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
          </Row>
        ))}
        <Button fullWidth>Full width</Button>
        <Row label="IconButton">
          <IconButton aria-label="Добавить" variant="primary">
            <PlusIcon />
          </IconButton>
          <IconButton aria-label="Добавить" variant="secondary">
            <PlusIcon />
          </IconButton>
          <IconButton aria-label="Добавить">
            <PlusIcon />
          </IconButton>
          <IconButton aria-label="Удалить" variant="danger">
            <PlusIcon />
          </IconButton>
          <IconButton aria-label="Маленькая" size="sm">
            <PlusIcon />
          </IconButton>
          <IconButton aria-label="Большая" size="lg">
            <PlusIcon />
          </IconButton>
          <IconButton aria-label="Загрузка" loading>
            <PlusIcon />
          </IconButton>
          <IconButton aria-label="Недоступна" disabled>
            <PlusIcon />
          </IconButton>
        </Row>
      </Section>

      <Section title="Формы: Field, Input, Textarea, Select, Checkbox, Switch">
        <FormsDemo />
      </Section>

      <Section title="Chip, Badge, Avatar">
        <Row label="Chip">
          <Chip>Не выбран</Chip>
          <Chip selected>Выбран</Chip>
          <Chip leftIcon={<BookIcon />}>С иконкой</Chip>
          <Chip disabled>Недоступен</Chip>
        </Row>
        <Row label="Badge">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
          <Badge tone="success" dot>
            с точкой
          </Badge>
        </Row>
        <Row label="Tag">
          {TONES.map((tone) => (
            <Tag key={tone} tone={tone}>
              {tone}
            </Tag>
          ))}
          <Tag tone="info" icon={<SparkIcon />}>
            с иконкой
          </Tag>
        </Row>
        <Row label="IconTile">
          {TONES.map((tone) => (
            <IconTile key={tone} tone={tone}>
              <StarIcon />
            </IconTile>
          ))}
          <IconTile size="sm">
            <MoonIcon />
          </IconTile>
          <IconTile size="lg" tone="info">
            <AiIcon />
          </IconTile>
        </Row>
        <Row label="Avatar">
          <Avatar name="Анна Петрова" size="sm" />
          <Avatar name="Анна Петрова" />
          <Avatar name="Анна Петрова" size="lg" />
          <Avatar name="Анна Петрова" size="xl" />
          <Avatar name="Анна Петрова" size="xl" ring />
          <Avatar />
          <Avatar name="Битая ссылка" src="https://invalid.local/x.png" />
        </Row>
      </Section>

      <Section title="Tabs, SegmentedControl">
        <TabsDemo />
      </Section>

      <Section title="Card, ListRow, StatTile">
        <Card>
          <Text>Обычная карточка, padding md</Text>
        </Card>
        <Card padding="sm">
          <Text>padding sm</Text>
        </Card>
        <Card interactive onClick={() => {}}>
          <Text>Интерактивная карточка (role=button, Enter/Space)</Text>
        </Card>
        <Card interactive disabled onClick={() => {}}>
          <Text>Интерактивная недоступная</Text>
        </Card>
        <Card padding="none">
          <ListRow title="Простая строка" />
          <ListRow title="С подзаголовком" subtitle="Вторая строка, приглушённая" />
          <ListRow
            left={<Avatar name="Иван Орлов" />}
            title="Со слотами и кликом"
            subtitle="Шеврон появляется автоматически"
            onClick={() => {}}
          />
          <ListRow
            title="Со значением справа"
            right={<Badge tone="warning">3 задания</Badge>}
            onClick={() => {}}
          />
          <ListRow title="Недоступная" disabled onClick={() => {}} />
        </Card>
        <Inline gap={3}>
          {TONES.map((tone) => (
            <StatTile
              key={tone}
              label={tone}
              value="42"
              hint="подсказка"
              tone={tone}
              icon={<BookIcon />}
              style={{ minWidth: 140 }}
            />
          ))}
        </Inline>
      </Section>

      <Section title="Progress">
        {TONES.map((tone) => (
          <ProgressBar key={tone} value={(TONES.indexOf(tone) + 1) * 18} tone={tone} label={tone} />
        ))}
        <ProgressBar value={50} size="sm" label="тонкий" />
        <Row label="ProgressRing">
          {TONES.map((tone, i) => (
            <ProgressRing key={tone} value={(i + 1) * 18} tone={tone} label={tone}>
              {(i + 1) * 18}%
            </ProgressRing>
          ))}
          <ProgressRing value={75} size={80} thickness={8}>
            75%
          </ProgressRing>
        </Row>
      </Section>

      <Section title="WeekArc">
        <Card>
          <Stack gap={3}>
            <Text weight="bold" align="center">
              Посещения
            </Text>
            <WeekArc
              aria-label="Посещения за неделю"
              items={[
                { key: 'mon', label: 'пн', tone: 'neutral', title: 'понедельник — нет уроков' },
                { key: 'tue', label: 'вт', tone: 'neutral', title: 'вторник — нет уроков' },
                { key: 'wed', label: 'ср', tone: 'success', title: 'среда — посещено' },
                { key: 'thu', label: 'чт', tone: 'success', title: 'четверг — посещено' },
                { key: 'fri', label: 'пт', tone: 'danger', title: 'пятница — пропуск' },
                { key: 'sat', label: 'сб', tone: 'muted', title: 'суббота — предстоит' },
                { key: 'sun', label: 'вс', tone: 'info', title: 'воскресенье — сегодня' },
              ]}
              legend={[
                { tone: 'success', label: 'посещено' },
                { tone: 'danger', label: 'пропуск' },
                { tone: 'info', label: 'сегодня' },
                { tone: 'neutral', label: 'нет уроков' },
              ]}
            />
          </Stack>
        </Card>
      </Section>

      <Section title="PieChart, SegmentBar, StatusGrid, CodeBlock, Band, Button link">
        <ParentAnalyticsDemo />
      </Section>

      <Section title="HeartCarousel, WalletChip, ScoopPanel, ProgressBubble, accent">
        <ParentHomeDemo />
        <Text variant="caption" tone="muted">
          Свайп/перетаскивание мышью или ←/→ листают детей: сердце, вставшее в центр, выбирается;
          «+» в конце ленты — добавить ребёнка (центрирование его не выбирает).
        </Text>
      </Section>

      <Section title="Режим репетитора: Illustration, WalletHero, LineChart, BarChart, DataTable, CardColumns compact/striped">
        <TutorDemo />
        <Text variant="caption" tone="muted">
          Оранжевый акцент включается переключателем выше («Оранжевый — репетитор»). «Вывести»
          обнуляет демо-баланс; строки таблицы успеваемости кликабельны целиком.
        </Text>
      </Section>

      <Section title="MonthCalendar, DockSheet">
        <Card>
          <div style={{ height: 164 }}>
            <MonthCalendar
              month={new Date(2026, 8, 1)}
              onMonthChange={() => undefined}
              selected={new Date(2026, 8, 22)}
              today={new Date(2026, 8, 22)}
              onSelect={() => undefined}
              isMarked={(date) => [15, 19, 23, 26].includes(date.getDate())}
            />
          </div>
        </Card>
        <DockSheetDemo />
        <Text variant="caption" tone="muted">
          Иконка календаря открывает шторку: вкладка с датой встаёт на уровень строки, кнопки по
          бокам остаются нажимаемыми; тап мимо или Escape закрывают.
        </Text>
      </Section>

      <Section title="IllustrationRow">
        <IllustrationRow items={[{ key: 'a', src: planet('#3aa0ff') }]} />
        <IllustrationRow
          items={[
            { key: 'a', src: planet('#3aa0ff') },
            { key: 'b', src: planet('#f2b705') },
          ]}
        />
        <IllustrationRow
          muted
          items={[
            { key: 'a', src: planet('#3aa0ff') },
            { key: 'b', src: planet('#f2b705') },
            { key: 'c', src: planet('#5b3fd6') },
          ]}
        />
      </Section>

      <Section title="PlanetMap">
        <PlanetMap
          aria-label="Карта заданий по кружкам"
          items={[
            { key: 'prog', image: planet('#5b3fd6'), value: 160, label: 'программирование' },
            { key: 'eng', image: planet('#1858fa'), value: 120, label: 'английский' },
            {
              key: 'rob',
              image: planet('#3aa0ff'),
              value: 150,
              label: 'робототехника',
              marker: 'сделать до завтра',
              title: 'Робототехника: 150 баллов',
              onClick: () => alert('Робототехника'),
            },
            { key: 'chess', image: planet('#f2b705'), value: 125, label: 'шахматы' },
            { key: 'math', image: planet('#2cda00'), label: 'Математика', locked: true },
            { key: 'art', image: planet('#ff5a8a'), label: 'Искусство', locked: true },
          ]}
        />
        <Text variant="caption" tone="muted">
          Свайп вправо по траектории или стрелки ← → (список в фокусе) листают планеты; серые с
          замком — заблокированные.
        </Text>
      </Section>

      <Section title="ChatBubble, ChatComposer">
        <ChatDemo />
      </Section>

      <Section title="Иконки">
        <Row label="Контурные">
          <SendIcon />
          <TrashIcon />
          <MoonIcon />
          <GlobeIcon />
          <LifebuoyIcon />
          <LogoutIcon />
          <SparkIcon />
          <StarIcon />
          <ClipboardIcon />
        </Row>
        <Row label="Заливочные (Figma)">
          <HomeIcon size={32} />
          <AiIcon size={32} />
          <BookIcon size={32} />
          <SettingsIcon size={32} />
          <UserIcon size={32} />
          <CalendarClockIcon size={32} />
          <BellIcon size={32} />
          <BellIcon size={32} count={5} />
          <Text as="span" tone="warning">
            <FireIcon size={32} />
          </Text>
          <Text as="span" tone="primary">
            <GemIcon size={32} />
          </Text>
          <Text as="span" tone="warning">
            <ChevronsDownIcon />
          </Text>
          <LockIcon />
          <ClipboardListIcon size={32} />
          <Text as="span" tone="primary">
            <GraduationCapIcon size={32} />
          </Text>
        </Row>
      </Section>

      <Section title="Skeleton, Spinner">
        <Inline gap={3} align="start">
          <Skeleton width={40} height={40} round />
          <Stack gap={2} style={{ flex: 1 }}>
            <Skeleton height={16} width="60%" />
            <SkeletonText lines={3} />
          </Stack>
        </Inline>
        <Row label="Spinner">
          <Spinner size="sm" />
          <Spinner />
          <Spinner size="lg" />
        </Row>
      </Section>

      <Section title="EmptyState, ErrorState">
        <Card>
          <EmptyState
            title="Пока нет кружков"
            description="Пройди онбординг, и мы подберём занятия по интересам"
            action={<Button>Подобрать кружки</Button>}
          />
        </Card>
        <Card>
          <ErrorState description="Сервер не ответил. Проверь соединение." onRetry={() => {}} />
        </Card>
      </Section>

      <Section title="Modal, Sheet">
        <OverlaysDemo />
      </Section>

      <Section title="Toast">
        <ToastDemo />
        <Toast tone="info" title="Статичный тост" description="Рендер без провайдера" />
      </Section>

      <Section title="Grid">
        <Grid columns={2}>
          {TONES.map((tone) => (
            <StatTile key={tone} label={tone} value="42" tone={tone} />
          ))}
        </Grid>
      </Section>

      <Section title="Divider, Stack, Inline">
        <Stack gap={2}>
          <Text>Stack gap=2</Text>
          <Divider />
          <Text>Между элементами — Divider</Text>
        </Stack>
        <Inline gap={3}>
          <Text>Слева</Text>
          <Divider orientation="vertical" />
          <Text>Справа</Text>
        </Inline>
      </Section>

      <Section title="AppLayout, PageHeader, BottomNavigation, Screen">
        <LayoutDemo />
      </Section>
    </div>
  );
}

/** Демо-страница всех компонентов. Монтируется web-приложением на dev-роуте. */
export function UiPlayground() {
  return (
    <ToastProvider regionLabel="Уведомления" closeLabel="Закрыть уведомление">
      <PlaygroundContent />
    </ToastProvider>
  );
}

export default UiPlayground;
