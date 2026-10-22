# Aura Security

Bot de Discord para Aura Security, desarrollado con Node.js 20+ y discord.js 14.

## Inicio

1. Crea una aplicación y un bot en el [Discord Developer Portal](https://discord.com/developers/applications).
2. Habilita los intents **Server Members Intent** y **Message Content Intent**.
3. Invita el bot con los permisos para administrar roles, crear canales, enviar mensajes, insertar enlaces y adjuntar archivos.
4. Copia `.env.example` a `.env` y completa `DISCORD_TOKEN` y `DISCORD_CLIENT_ID`. Usa `DISCORD_GUILD_ID` para registrar comandos en un servidor de pruebas.
5. Instala dependencias y ejecuta:

   ```sh
   npm install
   npm start
   ```

Los datos se guardan en `data/aura-data.json`. Haz copias de seguridad de ese archivo. El bot requiere permiso para asignar el rol Ciudadano y para crear canales en la categoría configurada.

## Configuración inicial

Usa `/aura-config` para configurar el canal de bienvenida, normativa, solicitudes, encargos, actividades, registros y OCR; los roles de Ciudadano y personal; la categoría de tickets y el banner. Los comandos de configuración requieren permisos de administrador o el rol de personal configurado.

Configura el canal de publicación con `/aura-config` (`rules_channel`). Luego usa `/normativa`: se abrirá un modal privado para editar el título, el contenido, una URL HTTPS de imagen opcional y el ID del rol que se asigna al aceptar. El ID se precarga con el valor guardado y se valida contra los roles del servidor. Al enviar, el bot guarda la configuración en el JSON y publica el embed con el botón de aceptación. El rol debe estar por debajo del rol del bot en la jerarquía de Discord. Para tickets, usa `/aura-panel tipo:tickets`.

## Actividades con cron

Configura el canal de publicación con `/aura-config clave:activity_channel valor:<ID-del-canal>`. Después administra las actividades con `/actividad`:

- `crear`: abre un modal con nombre, descripción, cron y banner opcional.
- `listar`: muestra ID, estado y horario.
- `editar`: selecciona una actividad con autocompletado `nombre - ID` y abre un modal para actualizarla. Deja vacío el campo del banner para quitarlo.
- `activar` / `desactivar`: pausa o reanuda la publicación sin borrar la actividad.
- `eliminar`: selecciona la actividad con autocompletado `nombre - ID` y la borra.
- `empleado`: elige la actividad con autocompletado y añade o quita una persona de la asistencia de una ocurrencia.

El cron usa cinco campos estándar —`minuto hora día-del-mes mes día-de-la-semana`— y zona horaria UTC. Por ejemplo, `0 20 * * 1-5` publica cada día laborable a las 20:00 UTC. Admite `*`, listas, rangos y pasos; el día de semana acepta `0` o `7` para domingo. Se pueden añadir varias expresiones cron en el mismo campo separándolas con `;`. Cada publicación incluye el título, la descripción, el banner configurado y el botón de asistencia.

## Solicitudes de eventos

Configura el canal de publicación con `/aura-config clave:request_channel valor:<ID-del-canal>`. `/solicitud` abre un formulario privado para indicar nombre, descripción, hora UTC (`HH:MM`), cupo de guardias (1–50) y banner HTTPS opcional. La solicitud se publica como embed con botones para confirmar asistencia, quedar provisional, rechazar, editar y eliminar.

La asistencia respeta el cupo configurado. Al llenarse, las siguientes personas quedan en lista de espera; si alguien confirmado sale o rechaza, la primera persona en espera pasa automáticamente a asistencia. La persona que creó la solicitud o el personal configurado pueden editarla o eliminarla.

## Funciones

- **Bienvenidas:** embed con avatar, logo y banner opcionales.
- **Normativa:** panel con botón de aceptación que asigna el rol Ciudadano.
- **Tickets:** categorías, nombre In Game (IC), canal privado y transcripción TXT al cerrar.
- **Solicitudes:** formulario privado, publicación en embed, cupos de guardias, lista de espera FIFO, estados provisional/rechazado y edición/eliminación.
- **Encargos:** cupos de 1 a 3, cola de espera y rotación automática cada 30 minutos.
- **Actividades:** horarios cron, banner, activación/desactivación, edición, eliminación, asistencia y ranking mensual.
- **OCR:** transcribe imágenes publicadas en el canal configurado. Se limita a imágenes de hasta 8 MB; Tesseract descarga los datos de idioma al primer uso.

Las actividades usan horario UTC. El bot debe permanecer conectado para publicar actividades y rotaciones programadas.
