# Control — seguimiento de pendientes, reuniones y equipo

App web (PWA) para gestionar proyectos de ingeniería minera sin que se pase nada: **captura rápida por voz**, pendientes con responsable y fecha, reuniones con minuta y acuerdos convertidos en acciones, seguimiento del equipo y revisión semanal.
Los datos se guardan en tu dispositivo (funciona sin internet) y se sincronizan con **tu Google Sheet**.

**App:** https://web-2022.github.io/Control/

---

## Qué hace

| Módulo | Para qué sirve |
|---|---|
| **Captura rápida** | Botón `+` / micrófono (o tecla `N` / `V`). Dicta o escribe una frase y la app detecta fecha, hora, responsable, proyecto, prioridad y disciplina. |
| **Hoy** | Tablero: vencidos, para hoy, reuniones del día, lo que esperas de otros, indicadores de cumplimiento y carga por proyecto/persona. |
| **Inbox** | Lo capturado sin fecha o sin proyecto/responsable. Se clasifica en segundos. |
| **Pendientes** | Vistas Lista, Kanban (arrastrar y soltar), Por responsable, Por proyecto y **Esperando a** (lo delegado, con recordatorio por WhatsApp/correo). Filtros combinables y búsqueda. Posponer +1 día / +1 semana con un toque. Historial de cambios. |
| **Reuniones** | Agenda, minuta por voz con autoguardado, acuerdos que se vuelven acciones, pendientes de los participantes para revisar, y minuta lista para WhatsApp/correo. |
| **Equipo** | Carga de cada persona (abiertos, vencidos) y vista 1:1 con agenda para copiar o enviar. |
| **Proyectos** | Fase (Conceptual, PFS, FS, Detalle…), disciplinas, hitos/entregables con avance automático y **entregables típicos por fase** precargados. |
| **Revisión semanal** | Checklist guiado (vaciar cuaderno, Inbox, vencidos, delegados, hitos, reuniones, planificar). |
| **Alertas** | Notificaciones del navegador antes de reuniones y pendientes con hora; correo diario opcional a las 7:00. |
| **Exportar** | CSV (abre directo en Excel) y respaldo/restauración JSON. |

La primera vez la app se abre con **datos de ejemplo** para que la explores. Bórralos desde el aviso de la pantalla Hoy o desde Ajustes.

---

## Frases que entiende

| Dices o escribes | Resultado |
|---|---|
| `mañana 10am revisar costos CAPEX con Ana, prioridad alta` | Mañana 10:00 · Ana · Alta · Costos |
| `Enviar informe de ventilación a @Juan el viernes` | Viernes · Juan · Ventilación |
| `#Huaylla revisar secuencia de minado 15/11 !alta` | Proyecto Huaylla · 15/11 · Alta · Planeamiento |
| `la próxima semana coordinar línea base ambiental con María` | Lunes próximo · María · Permisos y ambiental |
| `pasado mañana 9:30 kickoff línea de transmisión 60 kV #L60` | +2 días 09:30 · L60 · Electricidad |
| `encargar a María el análisis de sostenimiento para el 25/11` | María · 25/11 · Geomecánica |
| `esperando respuesta de Luis sobre cotización de transformador` | Estado “Esperando a tercero” · Luis |
| `fin de mes cerrar presupuesto OPEX #Ccollpa` | Último día del mes · Ccollpa · Costos |
| `lunes a las 8 de la mañana revisar plan de cierre` | Lunes 08:00 · Permisos y ambiental |
| `en 3 días entregar cronograma del estudio` | Hoy + 3 días |

- **Fecha:** hoy, mañana, pasado mañana, lunes…domingo, próximo lunes, 15/11, 20 de noviembre, el 18, en 3 días, la próxima semana, esta semana, fin de mes.
- **Hora:** 10am, 3 pm, 10:30, a las 3 (=15:00), 8 de la mañana, mediodía, en la tarde.
- **Responsable:** `@Juan`, con Juan, responsable Juan, pedir/encargar/delegar a Juan, o el nombre al inicio. Si la persona no existe, se crea en el Equipo.
- **Proyecto:** `#Código` o “proyecto Código” (el código corto se define en cada proyecto).
- **Prioridad:** `!alta`, `!media`, `!baja`, prioridad alta, urgente.

> **Voz:** funciona en Chrome y Edge (PC y Android). En iPhone/iPad usa el micrófono del teclado dentro del cuadro de captura: el texto se interpreta igual.

---

## Empezar (usuarios nuevos)

1. Abre **https://web-2022.github.io/Control/**.
2. Pulsa **Continuar con Google** y acepta los permisos.
3. Listo: la app crea sola la hoja **“Control – Mis datos”** en tu Google Drive y guarda ahí todo. Entra con la misma cuenta en el celular y en la PC para ver lo mismo.

La app usa solo el permiso `drive.file`: puede ver **únicamente** la hoja que ella crea, nada más de tu Drive. Ver la [política de privacidad](privacidad.html).

Para compartir la app con un colega usa el botón **Compartir** (arriba en la app).

## Conexión avanzada con Apps Script (opcional)

La forma recomendada es **Continuar con Google**. Lo siguiente solo es necesario si prefieres usar tu propio Apps Script.

### 1. Publicar la app (GitHub Pages)

1. En el repositorio: **Settings → Pages**.
2. *Source:* **Deploy from a branch** · *Branch:* `main` · carpeta `/ (root)` → **Save**.
3. En 1–2 minutos estará en `https://web-2022.github.io/Control/`.

### 2. Crear la base de datos en Google Sheets

1. Crea un Google Sheet nuevo (por ejemplo, “Control – Base de datos”).
2. Menú **Extensiones → Apps Script**.
3. Borra el contenido de `Código.gs` y pega **todo** el archivo [`apps-script/Code.gs`](apps-script/Code.gs). Guarda (💾).
4. **Configuración del proyecto** (⚙️, a la izquierda) → *Zona horaria*: **(GMT-05:00) Lima**.
5. Arriba elige la función **`configurarInicial`** y pulsa **▶ Ejecutar**.
   - Google pedirá permisos: *Revisar permisos → tu cuenta → Configuración avanzada → Ir a (no seguro) → Permitir*. Es normal: el script es tuyo.
   - En el **Registro de ejecución** aparecerá: `TU TOKEN (cópialo en Ajustes de la app): xxxxxxxx`. **Cópialo.**
   - Se crean las hojas: Pendientes, Reuniones, Acuerdos, Personas, Proyectos y Config.
6. **Implementar → Nueva implementación** → ⚙️ tipo **Aplicación web**:
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier usuario**
   - **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

> El acceso “Cualquier usuario” es necesario para que la app pueda llamar al script, pero **sin el token nadie puede leer ni escribir**. No compartas el token. Si crees que se filtró, ejecuta `cambiarToken`.

### 3. Conectar la app

1. Abre la app → **Ajustes**.
2. Pega la **URL** y el **token** → **Probar conexión** (debe decir “✔ Conectado…”).
3. **Guardar y sincronizar**. Si tienes datos de ejemplo, la app te ofrecerá borrarlos antes de conectar (recomendado).
4. Repite el paso 3 en cada dispositivo (celular, PC): todos verán los mismos datos.

### 4. (Opcional) Correo diario a las 7:00

En Apps Script, ejecuta la función **`activarResumenDiario`**. Cada mañana recibirás un correo con vencidos, pendientes de hoy y reuniones. Para cambiar el destinatario, edita `EMAIL_RESUMEN` en la hoja **Config**. Para desactivarlo: `desactivarResumenDiario`.

### 5. Instalar la app

- **Android (Chrome):** menú ⋮ → **Instalar app** / *Agregar a pantalla principal*. Mantén pulsado el ícono para ver los accesos directos “Capturar por voz” e “Inbox”.
- **iPhone/iPad (Safari):** botón Compartir → **Agregar a inicio**.
- **PC (Chrome/Edge):** ícono de instalar ⊕ en la barra de direcciones.

### Actualizar el Apps Script más adelante

Si cambias `Code.gs`: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. La URL se mantiene.

---

## Cómo se sincroniza

- Todo cambio se guarda al instante en el dispositivo (IndexedDB) y queda en una cola.
- La app sube la cola y baja los cambios de otros dispositivos: al abrir, 2 s después de cada cambio, al volver la conexión y cada 60 s.
- Si dos dispositivos editan lo mismo, **gana el cambio más reciente**.
- Sin internet la app sigue funcionando; el indicador muestra “Sin conexión” o “N por subir” y sincroniza sola al reconectar.
- Los borrados son lógicos (columna `deleted`), así también se sincronizan. No edites a mano las columnas `id`, `updatedAt` ni `_srv`.

---

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `N` | Captura rápida |
| `V` | Captura por voz |
| `/` | Buscar |
| `g` luego `h` / `p` / `r` / `i` / `e` / `y` | Ir a Hoy / Pendientes / Reuniones / Inbox / Equipo / Proyectos |
| `Enter` | Guardar captura (`Ctrl+Enter`: guardar y capturar otra) |
| `Esc` | Cerrar ventana |

---

## Estructura del código

```
index.html            Estructura de la página
manifest.json, sw.js  PWA: instalación y modo sin conexión
css/styles.css        Estilos (tema oscuro/claro)
js/app.js             Arranque, rutas (#/hoy, #/pendientes…), atajos y alertas
js/store.js           Datos locales (IndexedDB), cola de sincronización, historial
js/sync.js            Sincronización con Google Sheets (Apps Script)
js/parser.js          Interpreta frases en español (fecha, hora, @persona, #proyecto…)
js/voz.js             Dictado por voz (Web Speech API)
js/vistas.js          Pantallas
js/modales.js         Captura rápida y formularios
js/componentes.js     Filas, chips y selects reutilizables
js/modelo.js          Reglas: vencidos, hoy, esperando, indicadores
js/catalogo.js        Estados, fases, disciplinas mineras y entregables típicos
js/demo.js            Datos de ejemplo
apps-script/Code.gs   Backend en Google Apps Script
tests/parser.test.mjs Pruebas del intérprete de frases (node tests/parser.test.mjs)
```

Sin frameworks ni compilación: edita los archivos y publica. Al cambiar archivos de la app, sube la `VERSION` en `sw.js` para que los dispositivos instalados se actualicen.

### Personalizar

- **Disciplinas y palabras clave:** desde *Ajustes → Disciplinas* o en `js/catalogo.js`.
- **Entregables típicos por fase:** `ENTREGABLES_TIPICOS` en `js/catalogo.js`.
- **Nuevas reglas de frases:** `js/parser.js` (agrega un caso en `tests/parser.test.mjs` y ejecuta las pruebas).
