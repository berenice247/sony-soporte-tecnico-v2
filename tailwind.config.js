/** Tailwind se compila con `npm run build:css` y el resultado (public/css/app.css) se sube al repositorio. */
// Los colores del tema claro/oscuro viven en variables CSS (src/input.css).
const c = (nombre) => `rgb(var(--${nombre}) / <alpha-value>)`;

module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        sony: { DEFAULT: '#dc2626', dark: '#b91c1c', soft: c('sony-soft') },
        ink: { DEFAULT: '#111827', soft: '#1f2937' },

        canvas: c('canvas'),
        surface: c('surface'),
        'surface-2': c('surface-2'),
        line: c('line'),
        'line-strong': c('line-strong'),

        slate: {
          50: c('s50'), 100: c('s100'), 200: c('s200'), 300: c('s300'), 400: c('s400'),
          500: c('s500'), 600: c('s600'), 700: c('s700'), 800: c('s800'), 900: c('s900'),
        },
        sky:     { 50: c('sky50'), 100: c('sky100'), 800: c('sky800'), 900: c('sky900'), 950: c('sky950') },
        amber:   { 50: c('amber50'), 100: c('amber100'), 800: c('amber800'), 900: c('amber900') },
        emerald: { 50: c('emerald50'), 100: c('emerald100'), 800: c('emerald800'), 900: c('emerald900') },
        red:     { 50: c('red50'), 100: c('red100'), 800: c('red800'), 900: c('red900') },
        violet:  { 100: c('violet100'), 800: c('violet800') },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
};
