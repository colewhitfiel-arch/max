/**
 * Пути экранов родителя, на которые ссылаются страницы разных фич (главная, настройки →
 * кошелёк). Живут в shared, чтобы страницы одной роли не импортировали модули друг друга
 * (AGENT_GUIDE §3); схема URL — docs/FOUNDATION. Состояние «открыт из приложения» —
 * `FROM_APP_STATE` / `isFromApp` из `@/shared/lib/navigation`.
 */

/** Главная родителя — куда закрываются экраны, открытые не из приложения. */
export const PARENT_HOME_PATH = '/parent';

/** Пополнение кошелька родителя (заглушка, docs/07 F13). */
export const PARENT_WALLET_PATH = '/parent/wallet';
