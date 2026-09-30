import { parseAttendanceQrValue } from '@edu/contracts';
import { useToast } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMaxBridge } from '@/shared/max';

/** Экран отметки по коду занятия (его же открывает диплинк `startapp=checkin_<код>`). */
export const checkInPath = (code: string) => `/check-in/${encodeURIComponent(code)}`;

/**
 * Отметка по QR (docs/07 F6a): внутри MAX — встроенный сканер мессенджера (камеру и
 * распознавание берёт на себя MAX), код из отсканированной ссылки → экран отметки, где его
 * проверяет сервер. Вне MAX сканера нет — открывается ручной ввод ссылки (`manualOpen`).
 */
export function useScanCheckIn(options: { replace?: boolean } = {}) {
  const { t } = useTranslation('student');
  const bridge = useMaxBridge();
  const navigate = useNavigate();
  const toast = useToast();
  const [manualOpen, setManualOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  const openCode = (code: string) => {
    setManualOpen(false);
    navigate(checkInPath(code), { replace: options.replace ?? false });
  };

  const scan = async () => {
    if (!bridge.canScanQrCode()) {
      setManualOpen(true);
      return;
    }
    setScanning(true);
    let value: string | null;
    try {
      value = await bridge.scanQrCode();
    } catch {
      toast.show({
        tone: 'warning',
        title: t('checkIn.scanFailed'),
        description: t('checkIn.scanFailedHint'),
      });
      return;
    } finally {
      setScanning(false);
    }
    // Сканер закрыли, ничего не отсканировав, — просто остаёмся на месте.
    if (value === null) return;
    const code = parseAttendanceQrValue(value);
    if (!code) {
      bridge.haptic('error');
      toast.show({
        tone: 'warning',
        title: t('checkIn.notOurCode'),
        description: t('checkIn.notOurCodeHint'),
      });
      return;
    }
    openCode(code);
  };

  return {
    scan,
    scanning,
    manualOpen,
    closeManual: () => setManualOpen(false),
    openCode,
  };
}
