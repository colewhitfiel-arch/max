import { Button, QrCodeIcon } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useScanCheckIn } from '../model/use-scan-check-in';
import { ManualCheckInSheet } from './ManualCheckInSheet';

/**
 * «Отметиться по QR»: в MAX открывает встроенный сканер, вне MAX — ввод ссылки из QR-кода.
 * Код проверяет сервер на экране отметки (`/check-in/:code`).
 */
export function QrCheckInButton() {
  const { t } = useTranslation('student');
  const { scan, scanning, manualOpen, closeManual, openCode } = useScanCheckIn();

  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        leftIcon={<QrCodeIcon />}
        loading={scanning}
        onClick={() => void scan()}
      >
        {t('checkIn.scan')}
      </Button>
      <ManualCheckInSheet open={manualOpen} onClose={closeManual} onCode={openCode} />
    </>
  );
}
