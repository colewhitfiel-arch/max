import sampleText from '../samples/arduino-distance.md?raw';

/** Имя файла примера — по нему же тур демо-режима узнаёт «свой» конспект. */
export const SAMPLE_MATERIAL_NAME = 'Конспект — датчик расстояния HC-SR04.md';

/**
 * Пример конспекта для проверки конструктора курса без своих файлов: настоящий Markdown-файл,
 * который загружается тем же путём, что и выбранный с диска (upload-url → PUT → confirm).
 */
export function sampleMaterialFile(): File {
  return new File([sampleText], SAMPLE_MATERIAL_NAME, { type: 'text/markdown' });
}
