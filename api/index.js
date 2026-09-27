// Точка входа Vercel Functions: весь /api/* приходит сюда (vercel.json → rewrites).
// Сам обработчик — NestJS из apps/api, собранный `nest build` (apps/api/src/vercel.ts).
module.exports = require('../apps/api/dist/vercel.js').default;
