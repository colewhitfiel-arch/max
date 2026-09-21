// Прямой импорт lib/ обходит debug-обёртку pdf-parse (см. files/extract/text-extractor.ts).
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdf from 'pdf-parse';
  export default pdf;
}
