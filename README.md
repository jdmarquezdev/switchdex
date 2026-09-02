# SwitchDex

Catálogo web ligero y responsive para explorar títulos de juegos desde una fuente JSON configurable. Astro se ejecuta en modo SSR con el adaptador Node y obtiene los datos de una API Node independiente. El catálogo vive en un volumen persistente y puede actualizarse sin compilar ni redesplegar el frontend.

## Fuente de los datos

SwitchDex no incluye ni mantiene ningún catálogo propio: el repositorio trae un catálogo ficticio para desarrollo y CI, y cada operador conecta su fuente mediante `CATALOG_SOURCE_URL`. El visor es genérico sobre metadatos: título, fechas, géneros, idiomas, tamaños, portadas y descripciones.

El adaptador de referencia es `langegen-switch-games`, pensado para el formato JSON publicado por el proyecto público `Langegen/switch-games` (recopilación de metadatos de títulos con portadas e imágenes alojadas en servicios externos como FastPic). El visor solo consume los metadatos que esa fuente expone; su disponibilidad y contenido son responsabilidad de quien opera la fuente. `npm run catalog:sync` descarga y normaliza la fuente fuera del build.

Si aparece otra forma JSON, basta con añadir un adaptador nuevo en `src/data/adapters/` y seleccionarlo con `CATALOG_SOURCE_TYPE`; el modelo interno queda aislado de los nombres de campos de cada origen.

## Funcionalidades

- **Catálogo en cuadrícula** con portadas, scroll infinito por bloques de 24 tarjetas y botón de respaldo accesible.
- **Búsqueda instantánea por título** sobre un índice compacto, con ordenación por fecha o título (A–Z / Z–A). La búsqueda y el orden se reflejan en la URL para compartirlos.
- **Fichas de detalle dinámicas** en `/game/[id]`: portada grande, sinopsis, metadatos y galería de capturas con carga diferida, sin generar miles de páginas.
- **Idiomas del juego con banderas**: cada ficha muestra los idiomas normalizados acompañados de su bandera, generada como SVG inline sin dependencias externas.
- **Selector de español e inglés** en toda la interfaz; la preferencia se recuerda en el navegador y cada ficha muestra la descripción localizada disponible.
- **Traducción con IA configurable**: descripciones sin versión ES/EN traducibles con OpenAI, Anthropic, Google Gemini, GLM, Kimi, OpenRouter, Ollama o LM Studio (ver «Traducción con IA local o en la nube»), tanto en lote como al vuelo desde la propia ficha.

## Requisitos

- Node.js 22.12 o superior (recomendado: Node 22 LTS).
- npm 10 o superior.
- Una URL HTTPS con JSON compatible, solo si se quiere reemplazar el fixture de demostración.

## Puesta en marcha

```bash
npm install
cp .env.example .env
npm run catalog:sync
npm run api:start
```

En otro terminal:

```bash
npm run dev
```

Si `CATALOG_SOURCE_URL` no está definida, el actualizador usa `tests/fixtures/catalog.json`. Para probar la web sin red, elimina o deja vacía esa variable en `.env`.

La compilación de producción genera el servidor SSR. No descarga ni sincroniza el catálogo:

```bash
npm run build
npm start
```

El frontend escucha en `PORT` (4321 por defecto). La API se inicia por separado con `npm run api:start`; ningún comando de arranque de la API ejecuta el build de Astro.

## Configuración

| Variable | Uso | Valor predeterminado |
| --- | --- | --- |
| `CATALOG_SOURCE_URL` | Endpoint del catálogo. Debe ser HTTPS. | Fixture local |
| `CATALOG_SOURCE_TYPE` | Adaptador de entrada. | `compatible-json` |
| `CATALOG_FETCH_TIMEOUT_MS` | Timeout de descarga. | `30000` |
| `CATALOG_MAX_BYTES` | Límite de respuesta. | `52428800` |
| `CATALOG_CACHE_DIR` | Directorio de caché. | `.cache/catalog` |
| `CATALOG_API_URL` | URL de la API vista desde el proceso SSR. | `http://127.0.0.1:8787` |
| `CATALOG_INCLUDE_SOURCE_URLS` | Conserva enlaces informativos en el modelo interno (no se muestran en la web). | `false` |
| `TRANSLATION_PROVIDER` | IA para traducciones: `openai`, `anthropic`, `gemini`, `glm`, `kimi`, `openrouter`, `ollama` o `lmstudio`. | `ollama` |
| `TRANSLATION_API_KEY` | Clave del proveedor. Nunca llega al navegador. | Sin valor |
| `TRANSLATION_URL` | Endpoint propio; se deduce del proveedor si se omite. | Según proveedor |
| `TRANSLATION_MODEL` | Modelo usado para las traducciones. Es obligatorio al traducir. | Sin valor interno |
| `TRANSLATION_BATCH_SIZE` | Fichas traducidas por petición en lote. | `4` |
| `TRANSLATION_TIMEOUT_MS` | Timeout de cada petición de traducción. | `600000` |
| `TRANSLATION_THINK` | Solo Ollama: separa el razonamiento del texto final. | `low` recomendado |
| `TRANSLATION_API_HOST` | Interfaz de la API. En contenedor debe ser `0.0.0.0`. | `127.0.0.1` |
| `TRANSLATION_API_PORT` | Puerto interno para Caddy/Nginx. | `8787` |
| `TRANSLATION_ALLOWED_ORIGINS` | Orígenes web completos permitidos, separados por comas y con coincidencia exacta. | Mismo host de la API (compatibilidad) |
| `TRANSLATION_DAILY_LIMIT` | Máximo de fichas nuevas traducidas cada día. | `100` |
| `TRANSLATION_HOURLY_IP_LIMIT` | Peticiones por IP y hora, incluidas las cacheadas. | `10` |
| `SITE_URL` | URL canónica del sitio. | `https://catalog.example.com` |
| `SITE_NAME` | Nombre mostrado en metadatos. | `SwitchDex` |
| `SITE_DESCRIPTION` | Descripción SEO. | Descripción incluida |

`.env` está excluido de Git. No uses variables públicas para tokens: la fuente y las credenciales solo las utiliza la API.

Para el formato publicado por `Langegen/switch-games`, usa `CATALOG_SOURCE_TYPE=langegen-switch-games`. Este adaptador importa solo metadatos, limpia las etiquetas técnicas y las notas cirílicas añadidas a títulos latinos, y omite entradas cuyo título siga siendo cirílico. Los enlaces de la entrada quedan fuera salvo que se active explícitamente `CATALOG_INCLUDE_SOURCE_URLS=true`.

La fecha de publicación procede del campo `year` de esa fuente. El normalizador interpreta años, meses rusos, fechas completas y rangos; cuando una recopilación contiene varias fechas utiliza la más reciente. La mayoría de entradas solo tiene precisión mensual, así que los títulos del mismo mes se desempatan alfabéticamente.

## Formato de catálogo

El adaptador acepta un array de entradas o un objeto con una de estas claves: `games`, `items`, `data`, `catalog` o `results`. También reconoce alias frecuentes:

```json
{
  "games": [
    {
      "id": "stable-id",
      "title": "Example Homebrew",
      "title_id": "0100000000000001",
      "year": 2026,
      "genre": ["Aventura"],
      "developer": "Example Studio",
      "languages": ["Español", "English"],
      "size": "1.4 GB",
      "cover": "https://example.com/cover.webp",
      "screenshots": ["https://example.com/screen.webp"],
      "description": "Descripción en texto plano.",
      "description_es": "Descripción en español.",
      "description_en": "Description in English.",
      "content_type": "base"
    }
  ]
}
```

Una entrada inválida se omite sin romper el catálogo. El adaptador traduce los campos externos al modelo interno antes de que los componentes Astro los consuman.

Las descripciones bilingües pueden indicarse con `description_es` y `description_en`, o mediante `descriptions: { "es": "...", "en": "..." }`. El campo genérico `description` se conserva como respaldo cuando falta una traducción. El build no envía contenido a servicios externos; solo lo hace el comando manual `catalog:translate` cuando el operador lo ejecuta.

### Traducción con IA local o en la nube

La traducción es un paso manual y nunca se ejecuta dentro del build. Elige el proveedor con `TRANSLATION_PROVIDER`:

| Valor | Servicio | API key |
| --- | --- | --- |
| `openai` | OpenAI (ChatGPT) | Requerida |
| `anthropic` | Anthropic (Claude) | Requerida |
| `gemini` | Google Gemini | Requerida |
| `glm` | GLM (Zhipu) | Requerida |
| `kimi` | Kimi (Moonshot) | Requerida |
| `openrouter` | OpenRouter (agregador de muchos modelos) | Requerida |
| `ollama` | Ollama local o Ollama Cloud | Opcional (solo Cloud) |
| `lmstudio` | LM Studio local | No |

Ejemplos de configuración:

```env
# IA local con Ollama
TRANSLATION_PROVIDER=ollama
TRANSLATION_MODEL=qwen3:8b

# IA local con LM Studio
TRANSLATION_PROVIDER=lmstudio
TRANSLATION_MODEL=qwen2.5-7b-instruct

# OpenAI
TRANSLATION_PROVIDER=openai
TRANSLATION_API_KEY=sk-…
TRANSLATION_MODEL=gpt-4o-mini

# Anthropic
TRANSLATION_PROVIDER=anthropic
TRANSLATION_API_KEY=sk-ant-…
TRANSLATION_MODEL=claude-sonnet-4-5

# Google Gemini
TRANSLATION_PROVIDER=gemini
TRANSLATION_API_KEY=…
TRANSLATION_MODEL=gemini-2.0-flash

# GLM, Kimi u OpenRouter
TRANSLATION_PROVIDER=glm
TRANSLATION_API_KEY=…
TRANSLATION_MODEL=glm-4.7
```

Cualquier endpoint compatible con la API de chat de OpenAI (vLLM, llama.cpp server, etc.) funciona con `TRANSLATION_PROVIDER=openai` y `TRANSLATION_URL` apuntando a su base. A continuación ejecuta:

```bash
npm run catalog:update
npm run catalog:translate
npm run build
```

El comando usa exclusivamente el modelo indicado en `TRANSLATION_MODEL`, traduce cada descripción al español y al inglés y guarda el progreso en `.cache/catalog/translations.json`. Puede interrumpirse y reanudarse sin repetir lotes válidos. `--limit=10` permite una prueba pequeña, `--batch=1` reduce el lote si un modelo devuelve JSON inválido y `--force` regenera traducciones existentes:

```bash
npm run catalog:translate -- --limit=10
```

Cada traducción queda ligada al hash de la descripción de origen. Si el texto cambia, solo esa ficha vuelve a quedar pendiente. `catalog:update` mezcla la caché validada sin exponer la clave ni enviar traducciones al índice del navegador.

Los proveedores con respuesta estructurada (OpenAI y compatibles, Ollama) traducen por lotes; si un modelo falla, el comando cae automáticamente a traducción ficha a ficha y segmenta los textos largos por frases, validando cada fragmento antes de guardarlo. Anthropic y Gemini traducen siempre ficha a ficha. Para modelos de razonamiento en Ollama, `TRANSLATION_THINK=low` evita que el razonamiento contamine la traducción.

### Botón de traducción en la ficha

Las fichas sin versiones ES/EN muestran un botón **Traducir ahora**. El navegador llama al servicio por la ruta del mismo origen `/api/translate`; la clave del proveedor permanece exclusivamente en el servidor. Arráncalo en desarrollo con:

```bash
npm run translation:server
```

El servicio usa el mismo `TRANSLATION_PROVIDER`/`TRANSLATION_MODEL` que el comando manual. El frontend SSR publica `/api/translate` y lo reenvía a `CATALOG_API_URL`, por lo que las credenciales permanecen en la API. Si el frontend y la API usan hosts distintos, configura en la API los orígenes completos autorizados, sin barra final, por ejemplo `TRANSLATION_ALLOWED_ORIGINS=https://switchdex.jdmarquez.dev`. Se pueden indicar varios separados por comas. Las traducciones se escriben atómicamente en `.cache/catalog/translations.json`, la misma caché que usa `catalog:translate`. Una respuesta cacheada no vuelve a llamar a la IA ni consume el límite diario. Si cambia el texto fuente, su hash invalida únicamente esa traducción.

Durante desarrollo, deja `npm run api:start` abierto en un terminal y ejecuta `npm run dev` en otro. Astro redirige `/api` al servicio local automáticamente.

Para contener uso accidental o abusivo, el servicio aplica límites diarios persistentes y límites horarios en memoria por IP. Las peticiones simultáneas para una misma ficha comparten una única traducción en curso.

## Caché y actualización

```bash
npm run catalog:sync
npm run catalog:validate
```

El actualizador sigue el patrón `descarga → valida → archivo temporal → reemplazo atómico`. Una descarga fallida reutiliza `.cache/catalog/source.json`; nunca destruye primero una copia válida. Si hay URL configurada pero no existe ni red ni caché, termina con un error controlado.

El sync compara por ID y contenido normalizado, aplica el patrón `descarga → valida → archivo temporal → reemplazo atómico` y crea:

- `.cache/catalog/normalized.json`: documento interno para Astro.
- `.cache/catalog/source-normalized.json`: versión sin traducciones usada para comparar cambios.
- `.cache/catalog/source.json`: última descarga válida como respaldo.

No modifica ni elimina `.cache/catalog/translations.json`. Su salida estándar es una sola línea JSON con `counts`, `added`, `updated` y `removed`; por ejemplo, n8n puede usar `added` para construir la notificación.

Estos archivos se regeneran y no deben versionarse con datos reales.

## Verificación

```bash
npm run check
npm test
npm run build
```

Los tests cubren tamaños, años, idiomas, IDs, deduplicación y el adaptador. GitHub Actions usa siempre el fixture local, por lo que CI no depende de un endpoint externo.

## Despliegue en Coolify

Se mantienen dos procesos deliberadamente separados:

1. **API**: Build Pack `Dockerfile`, ubicación `/Dockerfile.api`, puerto `8787`. Añade todas las variables `CATALOG_*` y `TRANSLATION_*`, y monta un volumen persistente en `/app/.cache/catalog`. Este Dockerfile instala dependencias y ejecuta `npm run api:start`; no ejecuta `npm run build` de Astro.
2. **Frontend**: Build Pack `Dockerfile`, ubicación `/Dockerfile.frontend`, puerto `4321`. Define `CATALOG_API_URL` con una URL que el contenedor pueda alcanzar, por ejemplo `https://api.example.com` si la API ya está desplegada aparte. Publica el dominio de SwitchDex únicamente en este servicio.

En el primer arranque, la API ejecuta un sync inicial solo si el volumen todavía no contiene un catálogo. También puedes abrir su terminal y ejecutar `npm run catalog:sync` para comprobar la configuración. Tanto la API como el frontend exponen `/health`; el health del frontend también comprueba que la API tenga un catálogo listo. Coolify requiere que el proceso escuche en `0.0.0.0`, valor ya incluido en ambos Dockerfiles. Consulta la documentación oficial de [Dockerfile](https://coolify.io/docs/applications/build-packs/dockerfile), [almacenamiento persistente](https://coolify.io/docs/knowledge-base/persistent-storage) y [health checks](https://coolify.io/docs/knowledge-base/health-checks).

Fuera de Coolify, `deploy/Caddyfile.example` y `deploy/nginx.conf.example` muestran cómo publicar el frontend SSR. El frontend reenvía `/api/catalog`, `/api/game/:id` y `/api/translate` a `CATALOG_API_URL`; no hace falta exponer rutas distintas en el proxy frontal.

## Sincronización programada

En **Configuration → Scheduled Tasks** de la aplicación API, crea una tarea sobre su contenedor:

```text
Command: npm run --silent catalog:sync
Frequency: 0 */6 * * *
```

Coolify ejecuta las tareas dentro del contenedor y conserva su salida. El comando escribe una sola línea JSON, así que n8n/Hermes puede analizar `counts.added` y recorrer `added`, cuyos elementos tienen `id` y `title`, para enviar la notificación. Si `counts.added` vale cero no es necesario hacer nada. La frecuencia usa la zona horaria configurada en el servidor de Coolify; véase [Scheduled Tasks](https://coolify.io/docs/core/automation/scheduled-tasks/overview).

Para cron o un ejecutor externo puede usarse el mismo comando, o el envoltorio `deploy/update.sh`. `--silent` evita la cabecera de npm y deja únicamente el JSON en stdout. Ninguna de estas opciones recompila ni redespliega el frontend.

## Arquitectura

```text
fuente JSON → sync → volumen persistente → API → Astro SSR → navegador
```

- `src/data/`: adaptadores (`compatible-json`, `langegen-switch-games`), normalizador, tipos y cliente de la API.
- `src/components/`: componentes Astro sin framework cliente, incluidos los idiomas con banderas de la ficha.
- `src/scripts/catalog-ui.ts`: búsqueda por título, orden y scroll infinito en bloques de 24 tarjetas, con botón de respaldo accesible.
- `scripts/translation-providers.ts`: capa de proveedores de IA compartida por el traductor por lotes y la API al vuelo.
- `server/catalog-sync.ts`: descarga, comparación y escritura atómica del catálogo persistente.
- `server/catalog-api.ts`: endpoints de índice y ficha.
- `server/translation-api.ts`: proceso API que reúne catálogo y traducción bajo demanda.
- `scripts/`: comandos de sync, traducción y validación.
- `deploy/`: ejemplos de proxy y ejecución periódica.

`GET /api/catalog` devuelve solo el índice mínimo usado por búsqueda y orden. `GET /api/game/:id` devuelve la ficha completa. Las rutas `/game/:id` se resuelven en runtime, las imágenes usan carga diferida y fallback local, y la búsqueda y el orden se reflejan en la URL para compartirlos. Las capturas que una fuente compatible entregue como miniaturas de FastPic se normalizan a su recurso de tamaño completo durante la importación.
