import { useEffect, useState, type ReactNode } from 'react';
import {
  AppLayout,
  Avatar,
  Badge,
  BellIcon,
  BookIcon,
  BottomNavigation,
  Button,
  Card,
  ChatIcon,
  Checkbox,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  HomeIcon,
  IconButton,
  Inline,
  Input,
  ListRow,
  Modal,
  PageHeader,
  PlusIcon,
  ProgressBar,
  ProgressRing,
  Screen,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  SkeletonText,
  Spinner,
  Stack,
  StatTile,
  Switch,
  Tabs,
  Text,
  Textarea,
  Toast,
  ToastProvider,
  UserIcon,
  applyTheme,
  getTheme,
  useToast,
  type Theme,
  type Tone,
} from '../index';
import './playground.css';

const TONES: Tone[] = ['neutral', 'info', 'success', 'warning', 'danger'];

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

function OverlaysDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <>
      <Row>
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Открыть Modal
        </Button>
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Открыть Sheet
        </Button>
      </Row>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
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
              { key: 'courses', label: 'Курсы', icon: <BookIcon />, active: active === 'courses' },
              {
                key: 'tutor',
                label: 'Тьютор',
                icon: <ChatIcon />,
                active: active === 'tutor',
                badge: 3,
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
        <Row label="Avatar">
          <Avatar name="Анна Петрова" size="sm" />
          <Avatar name="Анна Петрова" />
          <Avatar name="Анна Петрова" size="lg" />
          <Avatar name="Анна Петрова" size="xl" />
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
    <ToastProvider>
      <PlaygroundContent />
    </ToastProvider>
  );
}

export default UiPlayground;
