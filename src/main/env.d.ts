/** Vite inlines `?raw` imports as strings — used for the migration .sql files. */
declare module '*.sql?raw' {
  const contents: string
  export default contents
}
