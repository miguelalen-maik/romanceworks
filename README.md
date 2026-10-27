# romanceworks

Base local de la web de ROMANCE con Next.js, App Router, TypeScript y CSS normal.
La ruta inicial implementa la página Coming Soon de ROMANCE como un único layout
responsive, a partir del [frame de Figma](https://www.figma.com/design/9sDfw9hu0EzdGIrYvYNqER/Romance-website?node-id=306-4696).

## Requisitos

- Node.js 24 LTS y npm disponibles en la terminal.
- Si utilizas nvm, ejecuta `nvm use` para usar la versión indicada en `.nvmrc`.

## Desarrollo local

Desde la carpeta del proyecto:

```sh
npm install
npm run dev
```

Abre http://localhost:3000 para ver la página Coming Soon.
Si el puerto está ocupado, Next.js indicará otro puerto en la terminal.

## Estructura

```text
app/
  globals.css       Fuente variable y estilos globales mínimos
  layout.tsx        Layout raíz con html y body
  page.tsx          Página Coming Soon
  page.module.css   Layout responsive y estilos de la página
components/
  .gitkeep          Conserva la carpeta vacía en Git
public/
  coming-soon/      Fondo, logo y monograma exportados de Figma
  fonts/            ABC Areal variable en WOFF2
  ...               Assets originales y favicons
.gitignore
.nvmrc
package.json
package-lock.json
tsconfig.json
README.md
```

Las páginas y rutas se añadirán en `app/`, los componentes compartidos en
`components/` y los assets en `public/`. Los estilos específicos podrán usar
archivos `*.module.css` junto a sus componentes.

## Referencia visual y assets

Las cuatro composiciones del frame representan la misma página. El bloque se
centra verticalmente, el logo escala con su contenedor y el fondo cubre el viewport
con recorte centrado. Por debajo de 35rem, la información inferior pasa a columna;
en desktop ancho (desde 100rem), la capa oscura del fondo usa el 70% frente al 80%
del resto de composiciones, como en Figma. No hay animaciones.

Los archivos de `public/coming-soon/` proceden del frame principal. Se conservan
los assets originales de `public/` sin sobrescribirlos. Next.js optimiza la imagen
de fondo; los SVG se muestran como archivos externos y los textos son HTML.

La declaración `@font-face` usa `public/fonts/ABCArealSuperfamilyVariable.woff2`
con el rango real de peso 400–700. El email visible y su enlace son
`hola@romanceworks.es` y `mailto:hola@romanceworks.es`, respectivamente. El enlace
se subraya en hover y muestra un contorno al recibir el foco de teclado.

Next.js genera `next-env.d.ts` y `.next/` al arrancar o compilar; no se guardan
en Git. `node_modules/` contiene las dependencias instaladas y también se ignora.

## Comprobaciones y producción local

```sh
npm run build
npm run typecheck
npm start
```

`npm start` sirve la compilación de producción en http://localhost:3000 y requiere
haber ejecutado `npm run build`. En instalaciones reproducibles o CI, utiliza
`npm ci` con el archivo `package-lock.json`.

## Visual Studio Code

Abre esta carpeta desde Archivo → Abrir carpeta, o ejecuta `code .` si tienes
instalado ese comando. Utiliza la terminal integrada para los comandos anteriores.

## Vercel

Cuando se decida desplegar, importa el repositorio en Vercel con esta carpeta
como raíz, selecciona Next.js y Node.js 24.x, y conserva los valores por defecto.
El comando de compilación es `npm run build`. Esta base no necesita variables
de entorno ni un archivo `vercel.json`. Todavía no se ha realizado ningún despliegue.
