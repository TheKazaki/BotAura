require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BRAND_COLOR = Number.parseInt(process.env.BRAND_COLOR || "0x172554", 16);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "aura-data.json");
const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const CRON_FIELDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
];

if (!TOKEN || !CLIENT_ID) {
  throw new Error("Configura DISCORD_TOKEN y DISCORD_CLIENT_ID en el archivo .env.");
}

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadStore() {
  if (!fs.existsSync(DATA_FILE)) return { guilds: {} };
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!parsed || typeof parsed !== "object" || !parsed.guilds) {
    throw new Error(`El archivo de datos no tiene un formato válido: ${DATA_FILE}`);
  }
  return parsed;
}

const store = loadStore();

function saveStore() {
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporaryFile, DATA_FILE);
}

function guildData(guildId) {
  if (!store.guilds[guildId]) {
    store.guilds[guildId] = {
      settings: {},
      tickets: {},
      orders: { slots: 1, active: [], waiting: [] },
      activities: {},
      ranking: {},
      requests: {},
    };
  }
  store.guilds[guildId].requests ||= {};
  return store.guilds[guildId];
}

const settingOptions = [
  ["welcome_channel", "Canal de bienvenida"],
  ["rules_channel", "Canal de normativa"],
  ["citizen_role", "Rol Ciudadano"],
  ["ticket_category", "Categoría de tickets"],
  ["staff_role", "Rol del personal"],
  ["logs_channel", "Canal de registros"],
  ["request_channel", "Canal de publicación de solicitudes"],
  ["orders_channel", "Canal de encargos"],
  ["activity_channel", "Canal de actividades"],
  ["ocr_channel", "Canal de transcripción OCR"],
  ["banner_url", "URL del banner"],
];

const commands = [
  new SlashCommandBuilder()
    .setName("aura-config")
    .setDescription("Configura los canales, roles y recursos de Aura Security.")
    .addStringOption((option) =>
      option
        .setName("clave")
        .setDescription("Ajuste que quieres configurar.")
        .setRequired(true)
        .addChoices(...settingOptions.map(([name, value]) => ({ name: value, value: name }))),
    )
    .addStringOption((option) =>
      option.setName("valor").setDescription("ID, URL o texto para el ajuste elegido.").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("aura-panel")
    .setDescription("Publica un panel de normativa o de tickets.")
    .addStringOption((option) =>
      option
        .setName("tipo")
        .setDescription("Tipo de panel.")
        .setRequired(true)
        .addChoices(
          { name: "Normativa", value: "rules" },
          { name: "Tickets", value: "tickets" },
        ),
    )
    .addChannelOption((option) =>
      option.setName("canal").setDescription("Canal de destino (por defecto, este canal)."),
    ),
  new SlashCommandBuilder()
    .setName("normativa")
    .setDescription("Abre un formulario para configurar y publicar el embed de normativa."),
  new SlashCommandBuilder().setName("solicitud").setDescription("Abre el formulario privado para solicitar cobertura de un evento."),
  new SlashCommandBuilder()
    .setName("encargo")
    .setDescription("Administra la cola de encargos y turnos del personal.")
    .addSubcommand((subcommand) => subcommand.setName("unirse").setDescription("Entra a la cola de encargos."))
    .addSubcommand((subcommand) => subcommand.setName("salir").setDescription("Sale de la cola de encargos."))
    .addSubcommand((subcommand) => subcommand.setName("estado").setDescription("Muestra los turnos y la lista de espera."))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cupos")
        .setDescription("Configura de 1 a 3 empleados por turno.")
        .addIntegerOption((option) =>
          option.setName("cantidad").setDescription("Cupos simultáneos.").setMinValue(1).setMaxValue(3).setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName("actividad")
    .setDescription("Crea y administra actividades programadas.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("crear")
        .setDescription("Abre un formulario para crear una actividad programada."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("editar")
        .setDescription("Busca la actividad y abre un formulario para editarla.")
        .addStringOption((option) =>
          option.setName("actividad").setDescription("Nombre e ID de la actividad.").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("eliminar")
        .setDescription("Elimina una actividad.")
        .addStringOption((option) =>
          option.setName("actividad").setDescription("Nombre e ID de la actividad.").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("listar").setDescription("Lista las actividades."))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("activar")
        .setDescription("Activa una actividad programada.")
        .addStringOption((option) =>
          option.setName("actividad").setDescription("Nombre e ID de la actividad.").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("desactivar")
        .setDescription("Desactiva una actividad sin eliminarla.")
        .addStringOption((option) =>
          option.setName("actividad").setDescription("Nombre e ID de la actividad.").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("empleado")
        .setDescription("Añade o quita un empleado de una asistencia.")
        .addStringOption((option) =>
          option.setName("actividad").setDescription("Nombre e ID de la actividad.").setRequired(true).setAutocomplete(true),
        )
        .addStringOption((option) => option.setName("ocurrencia").setDescription("Fecha/hora UTC YYYY-MM-DDTHH:MM.").setRequired(true))
        .addUserOption((option) => option.setName("usuario").setDescription("Empleado.").setRequired(true))
        .addStringOption((option) =>
          option
            .setName("accion")
            .setDescription("Acción.")
            .setRequired(true)
            .addChoices({ name: "Añadir", value: "add" }, { name: "Quitar", value: "remove" }),
        ),
    ),
  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Muestra el ranking mensual del personal.")
    .addIntegerOption((option) =>
      option.setName("mes").setDescription("Mes (1-12); por defecto, el actual.").setMinValue(1).setMaxValue(12),
    )
    .addIntegerOption((option) =>
      option.setName("ano").setDescription("Año; por defecto, el actual.").setMinValue(2020).setMaxValue(2100),
    ),
].map((command) => command.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

function isStaff(interaction) {
  const configuredRole = guildData(interaction.guildId).settings.staff_role;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    (configuredRole && (
      interaction.member?.roles?.cache?.has(configuredRole) ||
      interaction.member?.roles?.includes(configuredRole)
    ));
}

function requireStaff(interaction) {
  if (isStaff(interaction)) return true;
  interaction.reply({ content: "Este comando requiere permisos de administración o el rol de personal configurado.", ephemeral: true });
  return false;
}

function makeEmbed(title, description) {
  return new EmbedBuilder().setColor(BRAND_COLOR).setTitle(title).setDescription(description).setTimestamp();
}

function parseCronField(expression, { min, max }, dayOfWeek = false) {
  const values = new Set();
  for (const part of expression.split(",")) {
    const segments = part.split("/");
    if (segments.length > 2 || !segments[0] || (segments.length === 2 && !segments[1])) return null;
    const [rangePart, stepPart] = segments;
    if (stepPart !== undefined && !/^\d+$/.test(stepPart)) return null;
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return null;

    let start;
    let end;
    if (rangePart === "*") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const range = rangePart.split("-");
      if (range.length !== 2) return null;
      if (range.some((value) => !/^\d+$/.test(value))) return null;
      start = Number(range[0]);
      end = Number(range[1]);
    } else {
      if (!/^\d+$/.test(rangePart)) return null;
      start = Number(rangePart);
      end = stepPart === undefined ? start : max;
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) return null;
    for (let value = start; value <= end; value += step) {
      values.add(dayOfWeek && value === 7 ? 0 : value);
    }
  }
  return values;
}

function parseCron(expression) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const values = fields.map((field, index) => parseCronField(field, CRON_FIELDS[index], index === 4));
  if (values.some((field) => !field)) return null;
  return { fields, values };
}

function parseCronList(expression) {
  const crons = expression.split(";").map((cron) => cron.trim());
  if (!crons.length || crons.some((cron) => !parseCron(cron))) return null;
  return crons;
}

function cronMatches(parsedCron, date) {
  const { fields, values } = parsedCron;
  const [minute, hour, day, month, weekday] = values;
  if (!minute.has(date.getUTCMinutes()) || !hour.has(date.getUTCHours()) || !month.has(date.getUTCMonth() + 1)) {
    return false;
  }

  const dayOfMonthMatches = day.has(date.getUTCDate());
  const dayOfWeekMatches = weekday.has(date.getUTCDay());
  const dayOfMonthWildcard = fields[2] === "*" || fields[2] === "*/1";
  const dayOfWeekWildcard = fields[4] === "*" || fields[4] === "*/1";
  const dayMatches = dayOfMonthWildcard && dayOfWeekWildcard
    ? true
    : dayOfMonthWildcard
      ? dayOfWeekMatches
      : dayOfWeekWildcard
        ? dayOfMonthMatches
        : dayOfMonthMatches || dayOfWeekMatches;
  return dayMatches;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchTextChannel(guild, channelId) {
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId);
  return channel?.isTextBased() ? channel : null;
}

function makeRulesPanel(guildId) {
  const settings = guildData(guildId).settings;
  const embed = makeEmbed(
    settings.rules_title || "Aura Security | Normativa",
    settings.rules_content || settings.rules_text || "Lee y acepta la normativa para obtener el rol Ciudadano.",
  );
  if (settings.rules_image) embed.setImage(settings.rules_image);
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("aura:accept-rules").setLabel("Aceptar normativa").setEmoji("✅").setStyle(ButtonStyle.Success),
    )],
  };
}

function rulesForm(settings) {
  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Título del embed")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(256)
    .setValue(settings.rules_title || "Aura Security | Normativa");
  const content = new TextInputBuilder()
    .setCustomId("content")
    .setLabel("Contenido de la normativa")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000)
    .setValue(settings.rules_content || settings.rules_text || "Lee y acepta la normativa para obtener el rol Ciudadano.");
  const image = new TextInputBuilder()
    .setCustomId("image")
    .setLabel("URL HTTPS de imagen (opcional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(1000);
  const roleId = new TextInputBuilder()
    .setCustomId("role-id")
    .setLabel("ID del rol que se asigna al aceptar")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);
  if (settings.rules_image) image.setValue(settings.rules_image);
  if (settings.citizen_role) roleId.setValue(settings.citizen_role);

  return new ModalBuilder()
    .setCustomId("aura:rules:configure")
    .setTitle("Configurar normativa")
    .addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(content),
      new ActionRowBuilder().addComponents(image),
      new ActionRowBuilder().addComponents(roleId),
    );
}

function makeTicketPanel() {
  return {
    embeds: [makeEmbed("Aura Security | Soporte", "Selecciona una categoría para abrir un ticket privado.")],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("aura:ticket-category")
        .setPlaceholder("Selecciona el motivo del ticket")
        .addOptions(
          { label: "Soporte general", value: "Soporte general", emoji: "🛟" },
          { label: "Reportar un problema", value: "Reportar un problema", emoji: "🚨" },
          { label: "Consulta administrativa", value: "Consulta administrativa", emoji: "📋" },
          { label: "Otro", value: "Otro", emoji: "💬" },
        ),
    )],
  };
}

function requestForm(customId, request) {
  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Nombre del evento")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(256);
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Descripción")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(3000);
  const time = new TextInputBuilder()
    .setCustomId("time")
    .setLabel("Hora UTC (formato HH:MM)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);
  const guards = new TextInputBuilder()
    .setCustomId("guards")
    .setLabel("Cantidad máxima de guardias")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2);
  const banner = new TextInputBuilder()
    .setCustomId("banner")
    .setLabel("Banner HTTPS (opcional)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(1000);

  if (request) {
    title.setValue(request.title);
    description.setValue(request.description);
    time.setValue(request.time);
    guards.setValue(String(request.maxGuards));
    if (request.banner) banner.setValue(request.banner);
  }

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(request ? "Editar solicitud" : "Nueva solicitud de evento")
    .addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(description),
      new ActionRowBuilder().addComponents(time),
      new ActionRowBuilder().addComponents(guards),
      new ActionRowBuilder().addComponents(banner),
    );
}

function formatRequestUsers(userIds, limit = 35) {
  if (!userIds.length) return "Ninguno";
  const visible = userIds.slice(0, limit).map((userId, index) => `${index + 1}. <@${userId}>`);
  if (userIds.length > limit) visible.push(`... y ${userIds.length - limit} más`);
  return visible.join("\n");
}

function makeRequestMessage(request, id) {
  const embed = makeEmbed(request.title, request.description)
    .addFields(
      { name: "Hora (UTC)", value: request.time, inline: true },
      { name: "Cupo", value: `${request.attendees.length}/${request.maxGuards} guardias`, inline: true },
      { name: "Asistencia", value: formatRequestUsers(request.attendees) },
      { name: `Lista de espera (${request.waiting.length})`, value: formatRequestUsers(request.waiting) },
      { name: `Provisionales (${request.provisional.length})`, value: formatRequestUsers(request.provisional) },
    )
    .setFooter({ text: `Solicitud ${id} | Creada por ${request.creatorTag}` });
  if (request.banner) embed.setImage(request.banner);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`aura:request:attend:${id}`).setLabel("✅ Asistir / salir").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`aura:request:provisional:${id}`).setLabel("🟡 Provisional").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`aura:request:reject:${id}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`aura:request:edit:${id}`).setLabel("✏️ Editar").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`aura:request:delete:${id}`).setLabel("🗑️ Eliminar").setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

async function getRequestMessage(guild, request) {
  const channel = await fetchTextChannel(guild, request.channelId);
  if (!channel) return null;
  const message = await channel.messages.fetch(request.messageId);
  return { channel, message };
}

function canManageRequest(interaction, request) {
  return request.creatorId === interaction.user.id || isStaff(interaction);
}

function removeRequestStatus(request, userId) {
  const wasAttending = request.attendees.includes(userId);
  request.attendees = request.attendees.filter((id) => id !== userId);
  request.waiting = request.waiting.filter((id) => id !== userId);
  request.provisional = request.provisional.filter((id) => id !== userId);
  let promoted = false;
  if (wasAttending && request.waiting.length) {
    request.attendees.push(request.waiting.shift());
    promoted = true;
  }
  return { wasAttending, promoted };
}

async function createRequest(interaction) {
  const data = guildData(interaction.guildId);
  const channel = await fetchTextChannel(interaction.guild, data.settings.request_channel);
  if (!channel) {
    return interaction.reply({
      content: "El canal de solicitudes no está configurado. Un administrador debe usar `/aura-config` con `request_channel`.",
      ephemeral: true,
    });
  }

  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  const time = interaction.fields.getTextInputValue("time").trim();
  const maxGuards = Number(interaction.fields.getTextInputValue("guards").trim());
  const banner = interaction.fields.getTextInputValue("banner").trim();
  if (!title || !description) {
    return interaction.reply({ content: "El nombre y la descripción son obligatorios.", ephemeral: true });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return interaction.reply({ content: "La hora debe tener formato de 24 horas HH:MM UTC, por ejemplo `18:30`.", ephemeral: true });
  }
  if (!Number.isInteger(maxGuards) || maxGuards < 1 || maxGuards > 50) {
    return interaction.reply({ content: "La cantidad máxima debe ser un número entre 1 y 50.", ephemeral: true });
  }
  if (banner && !isHttpsUrl(banner)) {
    return interaction.reply({ content: "El banner debe ser una URL HTTPS válida.", ephemeral: true });
  }

  let id = randomUUID().slice(0, 8);
  while (data.requests[id]) id = randomUUID().slice(0, 8);
  const request = {
    title,
    description,
    time,
    maxGuards,
    banner: banner || null,
    creatorId: interaction.user.id,
    creatorTag: interaction.user.tag,
    channelId: channel.id,
    attendees: [],
    waiting: [],
    provisional: [],
    createdAt: new Date().toISOString(),
  };

  const message = await channel.send(makeRequestMessage(request, id));
  request.messageId = message.id;
  data.requests[id] = request;
  saveStore();
  return interaction.reply({ content: `Solicitud **${title}** enviada al canal ${channel}.`, ephemeral: true });
}

async function editRequest(interaction) {
  const id = interaction.customId.slice("aura:request:edit:".length);
  const data = guildData(interaction.guildId);
  const request = data.requests[id];
  if (!request) return interaction.reply({ content: "Esta solicitud ya no existe.", ephemeral: true });
  if (!canManageRequest(interaction, request)) {
    return interaction.reply({ content: "Solo quien creó la solicitud o el personal puede editarla.", ephemeral: true });
  }

  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  const time = interaction.fields.getTextInputValue("time").trim();
  const maxGuards = Number(interaction.fields.getTextInputValue("guards").trim());
  const banner = interaction.fields.getTextInputValue("banner").trim();
  if (!title || !description) {
    return interaction.reply({ content: "El nombre y la descripción son obligatorios.", ephemeral: true });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return interaction.reply({ content: "La hora debe tener formato de 24 horas HH:MM UTC, por ejemplo `18:30`.", ephemeral: true });
  }
  if (!Number.isInteger(maxGuards) || maxGuards < 1 || maxGuards > 50) {
    return interaction.reply({ content: "La cantidad máxima debe ser un número entre 1 y 50.", ephemeral: true });
  }
  if (banner && !isHttpsUrl(banner)) {
    return interaction.reply({ content: "El banner debe ser una URL HTTPS válida.", ephemeral: true });
  }

  const updated = {
    ...request,
    title,
    description,
    time,
    maxGuards,
    banner: banner || null,
    attendees: [...request.attendees],
    waiting: [...request.waiting],
    provisional: [...request.provisional],
  };
  while (updated.attendees.length > maxGuards) updated.waiting.unshift(updated.attendees.pop());
  while (updated.attendees.length < maxGuards && updated.waiting.length) updated.attendees.push(updated.waiting.shift());

  const target = await getRequestMessage(interaction.guild, request);
  if (!target) return interaction.reply({ content: "No se encontró el canal de la solicitud.", ephemeral: true });
  await target.message.edit(makeRequestMessage(updated, id));
  data.requests[id] = updated;
  saveStore();
  return interaction.reply({ content: `Solicitud **${title}** actualizada.`, ephemeral: true });
}

async function handleRequestButton(interaction) {
  const [, , action, id] = interaction.customId.split(":");
  const data = guildData(interaction.guildId);
  const request = data.requests[id];
  if (!request) return interaction.reply({ content: "Esta solicitud ya no existe.", ephemeral: true });

  if (action === "edit") {
    if (!canManageRequest(interaction, request)) {
      return interaction.reply({ content: "Solo quien creó la solicitud o el personal puede editarla.", ephemeral: true });
    }
    return interaction.showModal(requestForm(`aura:request:edit:${id}`, request));
  }
  if (action === "delete") {
    if (!canManageRequest(interaction, request)) {
      return interaction.reply({ content: "Solo quien creó la solicitud o el personal puede eliminarla.", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const target = await getRequestMessage(interaction.guild, request);
    if (target) await target.message.delete();
    delete data.requests[id];
    saveStore();
    return interaction.editReply("Solicitud eliminada.");
  }

  let response;
  if (action === "attend") {
    const wasAttending = request.attendees.includes(interaction.user.id);
    if (wasAttending) {
      const { promoted } = removeRequestStatus(request, interaction.user.id);
      response = promoted
        ? "Saliste de la asistencia. La primera persona de la lista de espera ocupó tu lugar."
        : "Saliste de la asistencia.";
    } else if (request.waiting.includes(interaction.user.id)) {
      const position = request.waiting.indexOf(interaction.user.id) + 1;
      response = `Ya estás en la lista de espera, posición ${position}.`;
    } else {
      request.provisional = request.provisional.filter((userId) => userId !== interaction.user.id);
      if (request.attendees.length < request.maxGuards) {
        request.attendees.push(interaction.user.id);
        response = "Tu asistencia quedó confirmada.";
      } else {
        request.waiting.push(interaction.user.id);
        response = `El cupo está completo. Quedaste en la lista de espera, posición ${request.waiting.length}.`;
      }
    }
  } else if (action === "provisional") {
    const wasProvisional = request.provisional.includes(interaction.user.id);
    const { wasAttending, promoted } = removeRequestStatus(request, interaction.user.id);
    if (!wasProvisional) {
      request.provisional.push(interaction.user.id);
      response = wasAttending && promoted
        ? "Tu estado quedó como provisional. La primera persona de la lista de espera ocupó tu lugar."
        : wasAttending
          ? "Tu asistencia quedó como provisional."
          : "Tu estado quedó como provisional.";
    } else {
      response = "Tu estado provisional se quitó.";
    }
  } else if (action === "reject") {
    const hadStatus = request.attendees.includes(interaction.user.id) ||
      request.waiting.includes(interaction.user.id) ||
      request.provisional.includes(interaction.user.id);
    const { promoted } = removeRequestStatus(request, interaction.user.id);
    response = hadStatus
      ? promoted
        ? "Se quitó tu estado. La primera persona de la lista de espera ocupó el cupo."
        : "Se quitó tu estado de esta solicitud."
      : "Indicaste que no asistirás.";
  } else {
    return interaction.reply({ content: "Acción de solicitud desconocida.", ephemeral: true });
  }

  saveStore();
  await interaction.deferUpdate();
  await interaction.message.edit(makeRequestMessage(request, id));
  return interaction.followUp({ content: response, ephemeral: true });
}

async function handleCommand(interaction) {
  const data = guildData(interaction.guildId);
  if (interaction.commandName === "aura-config") {
    if (!requireStaff(interaction)) return;
    const key = interaction.options.getString("clave", true);
    const value = interaction.options.getString("valor", true).trim();
    if (!value) return interaction.reply({ content: "El valor no puede estar vacío.", ephemeral: true });
    if (key === "rules_text" && value.length > 4000) {
      return interaction.reply({ content: "El texto de normativa no puede superar los 4000 caracteres.", ephemeral: true });
    }
    data.settings[key] = value;
    saveStore();
    return interaction.reply({ content: `Configuración actualizada: **${key}**.`, ephemeral: true });
  }

  if (interaction.commandName === "aura-panel") {
    if (!requireStaff(interaction)) return;
    const panelType = interaction.options.getString("tipo", true);
    const channel = interaction.options.getChannel("canal") || interaction.channel;
    if (!channel?.isTextBased()) return interaction.reply({ content: "El destino debe ser un canal de texto.", ephemeral: true });
    await channel.send(panelType === "rules" ? makeRulesPanel(interaction.guildId) : makeTicketPanel());
    return interaction.reply({ content: "Panel publicado.", ephemeral: true });
  }

  if (interaction.commandName === "normativa") {
    if (!requireStaff(interaction)) return;
    if (!data.settings.rules_channel) {
      return interaction.reply({
        content: "Configura primero `rules_channel` con `/aura-config`.",
        ephemeral: true,
      });
    }
    const channel = await fetchTextChannel(interaction.guild, data.settings.rules_channel);
    if (!channel) return interaction.reply({ content: "El canal de normativa no es válido.", ephemeral: true });
    return interaction.showModal(rulesForm(data.settings));
  }

  if (interaction.commandName === "solicitud") {
    return interaction.showModal(requestForm("aura:request:create"));
  }

  if (interaction.commandName === "encargo") return handleOrderCommand(interaction, data);
  if (interaction.commandName === "actividad") return handleActivityCommand(interaction, data);
  if (interaction.commandName === "ranking") return handleRankingCommand(interaction, data);
}

async function handleOrderCommand(interaction, data) {
  const orders = data.orders;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "cupos") {
    if (!requireStaff(interaction)) return;
    orders.slots = interaction.options.getInteger("cantidad", true);
    while (orders.active.length > orders.slots) {
      orders.waiting.unshift(orders.active.pop());
    }
    fillOrderSlots(orders);
    saveStore();
    await announceOrderState(interaction.guild, data);
    return interaction.reply({ content: `Turnos configurados para ${orders.slots} empleado(s).`, ephemeral: true });
  }
  if (subcommand === "unirse") {
    const userId = interaction.user.id;
    if (orders.active.includes(userId) || orders.waiting.includes(userId)) {
      return interaction.reply({ content: "Ya estás en el turno o en la lista de espera.", ephemeral: true });
    }
    if (orders.active.length < orders.slots) {
      orders.active.push(userId);
      orders.startedAt ||= Date.now();
      saveStore();
      await announceOrderState(interaction.guild, data);
      return interaction.reply({ content: "Te has unido al turno activo.", ephemeral: true });
    }
    orders.waiting.push(userId);
    saveStore();
    return interaction.reply({ content: "Turno completo. Te añadí a la lista de espera.", ephemeral: true });
  }
  if (subcommand === "salir") {
    orders.active = orders.active.filter((id) => id !== interaction.user.id);
    orders.waiting = orders.waiting.filter((id) => id !== interaction.user.id);
    if (!orders.active.length) orders.startedAt = null;
    fillOrderSlots(orders);
    saveStore();
    await announceOrderState(interaction.guild, data);
    return interaction.reply({ content: "Has salido de la cola de encargos.", ephemeral: true });
  }
  const active = orders.active.length ? orders.active.map((id) => `<@${id}>`).join(", ") : "Sin empleados";
  const waiting = orders.waiting.length ? orders.waiting.map((id, index) => `${index + 1}. <@${id}>`).join("\n") : "Sin lista de espera";
  return interaction.reply({ embeds: [makeEmbed("Turnos de encargos", `**Cupos:** ${orders.slots}\n**Activos:** ${active}\n**En espera:**\n${waiting}`)], ephemeral: true });
}

function fillOrderSlots(orders) {
  while (orders.active.length < orders.slots && orders.waiting.length) {
    orders.active.push(orders.waiting.shift());
    orders.startedAt = Date.now();
  }
}

async function announceOrderState(guild, data) {
  const channel = await fetchTextChannel(guild, data.settings.orders_channel);
  if (!channel) return;
  const active = data.orders.active.length ? data.orders.active.map((id) => `<@${id}>`).join(", ") : "Sin empleados";
  await channel.send({ embeds: [makeEmbed("Aura Security | Encargos", `**Turno activo:** ${active}\n**Cupos:** ${data.orders.slots}\n**Duración:** 30 minutos por rotación.`)] });
}

function getActivityCrons(activity) {
  if (typeof activity.cron === "string") return activity.cron.split(";").map((cron) => cron.trim()).filter(Boolean);
  if (!Array.isArray(activity.days) || !Array.isArray(activity.times)) return [];
  return activity.days.flatMap((day) => {
    const weekday = DAY_NAMES.indexOf(day);
    if (weekday < 0) return [];
    return activity.times.flatMap((time) => {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
      return match ? [`${Number(match[2])} ${Number(match[1])} * * ${weekday}`] : [];
    });
  });
}

function activityForm(customId, activity) {
  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Nombre de la actividad")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(256);
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Descripción")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000);
  const cron = new TextInputBuilder()
    .setCustomId("cron")
    .setLabel("Cron UTC (separa varios con ;)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4000);
  const banner = new TextInputBuilder()
    .setCustomId("banner")
    .setLabel("Banner HTTPS (vacío para quitarlo)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(1000);

  if (activity) {
    title.setValue(activity.title);
    description.setValue(activity.description);
    cron.setValue(getActivityCrons(activity).join("; "));
    if (activity.banner) banner.setValue(activity.banner);
  }

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(activity ? "Editar actividad" : "Crear actividad")
    .addComponents(
      new ActionRowBuilder().addComponents(title),
      new ActionRowBuilder().addComponents(description),
      new ActionRowBuilder().addComponents(cron),
      new ActionRowBuilder().addComponents(banner),
    );
}

async function handleActivityAutocomplete(interaction) {
  const data = guildData(interaction.guildId);
  const focused = interaction.options.getFocused().toLocaleLowerCase();
  const matches = Object.entries(data.activities)
    .filter(([id, activity]) => `${activity.title} - ${id}`.toLocaleLowerCase().includes(focused))
    .slice(0, 25)
    .map(([id, activity]) => ({
      name: `${activity.title} - ${id}`.slice(0, 100),
      value: id,
    }));
  return interaction.respond(matches);
}

async function handleActivityCommand(interaction, data) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "listar") {
    const entries = Object.entries(data.activities);
    const description = entries.length
      ? entries.slice(0, 20).map(([id, activity]) =>
        `\`${id}\` — **${activity.title}** | ${activity.active === false ? "⏸️ Desactivada" : "✅ Activa"} | \`${getActivityCrons(activity).join(" | ") || "sin cron"}\`${activity.banner ? " | banner" : ""}`,
      ).join("\n")
      : "No hay actividades configuradas.";
    return interaction.reply({
      embeds: [makeEmbed("Actividades programadas", description)],
      ephemeral: true,
    });
  }
  if (!requireStaff(interaction)) return;

  if (subcommand === "crear") {
    return interaction.showModal(activityForm("aura:activity:create"));
  }

  if (subcommand === "editar") {
    const id = interaction.options.getString("actividad", true);
    const activity = data.activities[id];
    if (!activity) return interaction.reply({ content: "No se encontró esa actividad.", ephemeral: true });
    return interaction.showModal(activityForm(`aura:activity:edit:${id}`, activity));
  }

  if (subcommand === "eliminar") {
    const id = interaction.options.getString("actividad", true);
    if (!data.activities[id]) return interaction.reply({ content: "No se encontró esa actividad.", ephemeral: true });
    delete data.activities[id];
    saveStore();
    return interaction.reply({ content: `Actividad \`${id}\` eliminada.`, ephemeral: true });
  }

  if (subcommand === "activar" || subcommand === "desactivar") {
    const id = interaction.options.getString("actividad", true);
    const activity = data.activities[id];
    if (!activity) return interaction.reply({ content: "No se encontró esa actividad.", ephemeral: true });
    activity.active = subcommand === "activar";
    saveStore();
    return interaction.reply({
      content: `Actividad \`${id}\` ${activity.active ? "activada" : "desactivada"}.`,
      ephemeral: true,
    });
  }

  if (subcommand === "empleado") {
    const id = interaction.options.getString("actividad", true);
    const occurrence = interaction.options.getString("ocurrencia", true);
    const user = interaction.options.getUser("usuario", true);
    const action = interaction.options.getString("accion", true);
    const activity = data.activities[id];
    if (!activity) return interaction.reply({ content: "No se encontró esa actividad.", ephemeral: true });
    if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(occurrence)) {
      return interaction.reply({ content: "La ocurrencia debe tener formato YYYY-MM-DDTHH:MM en UTC.", ephemeral: true });
    }
    activity.attendance[occurrence] ||= [];
    activity.attendance[occurrence] = action === "add"
      ? [...new Set([...activity.attendance[occurrence], user.id])]
      : activity.attendance[occurrence].filter((userId) => userId !== user.id);
    saveStore();
    return interaction.reply({ content: `Asistencia actualizada para <@${user.id}>.`, ephemeral: true });
  }
}

async function handleRankingCommand(interaction, data) {
  const current = new Date();
  const year = interaction.options.getInteger("ano") || current.getUTCFullYear();
  const month = interaction.options.getInteger("mes") || current.getUTCMonth() + 1;
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const scores = data.ranking[key] || {};
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const description = sorted.length
    ? sorted.map(([userId, count], index) => `**${index + 1}.** <@${userId}> — ${count} actividad(es)`).join("\n")
    : "Todavía no hay asistencias completadas para este mes.";
  return interaction.reply({ embeds: [makeEmbed(`Ranking mensual | ${key}`, description)] });
}

async function handleButton(interaction) {
  const data = guildData(interaction.guildId);
  if (interaction.customId === "aura:accept-rules") {
    const roleId = data.settings.citizen_role;
    if (!roleId) return interaction.reply({ content: "El rol Ciudadano aún no está configurado.", ephemeral: true });
    const role = await interaction.guild.roles.fetch(roleId);
    if (!role) return interaction.reply({ content: "No se encontró el rol configurado. Revisa /aura-config.", ephemeral: true });
    await interaction.member.roles.add(role);
    return interaction.reply({ content: "Normativa aceptada. Se te asignó el rol Ciudadano.", ephemeral: true });
  }
  if (interaction.customId.startsWith("aura:ticket-close:")) return closeTicket(interaction);
  if (interaction.customId.startsWith("aura:activity-done:")) return completeActivity(interaction);
  if (interaction.customId.startsWith("aura:request:")) return handleRequestButton(interaction);
}

async function handleSelect(interaction) {
  if (interaction.customId !== "aura:ticket-category") return;
  const category = interaction.values[0];
  const modal = new ModalBuilder().setCustomId(`aura:ticket-create:${Buffer.from(category).toString("base64url")}`).setTitle("Abrir ticket");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("ic-name").setLabel("Nombre In Game (IC)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("details").setLabel("¿En qué podemos ayudarte?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000),
    ),
  );
  return interaction.showModal(modal);
}

async function handleModal(interaction) {
  if (interaction.customId === "aura:rules:configure") {
    if (!requireStaff(interaction)) return;
    const data = guildData(interaction.guildId);
    if (!data.settings.rules_channel) {
      return interaction.reply({ content: "El canal de normativa no está configurado. Define `rules_channel` con `/aura-config` y vuelve a intentarlo.", ephemeral: true });
    }
    const title = interaction.fields.getTextInputValue("title").trim();
    const content = interaction.fields.getTextInputValue("content").trim();
    const image = interaction.fields.getTextInputValue("image").trim();
    const roleId = interaction.fields.getTextInputValue("role-id").trim();
    if (!title || !content) {
      return interaction.reply({ content: "El título y el contenido de la normativa no pueden quedar vacíos.", ephemeral: true });
    }
    if (!/^\d{17,20}$/.test(roleId)) {
      return interaction.reply({ content: "Ingresa un ID de rol de Discord válido (17 a 20 dígitos).", ephemeral: true });
    }
    if (image && !isHttpsUrl(image)) {
      return interaction.reply({ content: "La imagen debe ser una URL HTTPS válida.", ephemeral: true });
    }

    const channel = await fetchTextChannel(interaction.guild, data.settings.rules_channel);
    const role = await interaction.guild.roles.fetch(roleId);
    if (!channel) return interaction.reply({ content: "El canal configurado para normativa no es válido.", ephemeral: true });
    if (!role) return interaction.reply({ content: "No existe un rol con ese ID en este servidor.", ephemeral: true });

    data.settings.rules_title = title;
    data.settings.rules_content = content;
    data.settings.rules_image = image || null;
    data.settings.citizen_role = role.id;
    delete data.settings.rules_text;
    await channel.send(makeRulesPanel(interaction.guildId));
    saveStore();
    return interaction.reply({ content: `Normativa publicada en ${channel}; al aceptarla se asignará ${role}.`, ephemeral: true });
  }

  if (interaction.customId === "aura:activity:create") {
    if (!requireStaff(interaction)) return;
    const title = interaction.fields.getTextInputValue("title").trim();
    const description = interaction.fields.getTextInputValue("description").trim();
    const cron = interaction.fields.getTextInputValue("cron").trim();
    const banner = interaction.fields.getTextInputValue("banner").trim();
    if (!title || !description) {
      return interaction.reply({ content: "El nombre y la descripción no pueden quedar vacíos.", ephemeral: true });
    }
    if (!parseCronList(cron)) {
      return interaction.reply({
        content: "Cron inválido. Usa cinco campos por horario: `minuto hora día-del-mes mes día-de-la-semana`. Separa varios horarios con `;`.",
        ephemeral: true,
      });
    }
    if (banner && !isHttpsUrl(banner)) {
      return interaction.reply({ content: "El banner debe ser una URL HTTPS válida.", ephemeral: true });
    }

    const data = guildData(interaction.guildId);
    let id = randomUUID().slice(0, 8);
    while (data.activities[id]) id = randomUUID().slice(0, 8);
    data.activities[id] = {
      title,
      description,
      cron,
      banner: banner || null,
      active: true,
      sent: {},
      completed: {},
      attendance: {},
    };
    saveStore();
    return interaction.reply({ content: `Actividad **${title}** creada con ID \`${id}\`.`, ephemeral: true });
  }

  if (interaction.customId.startsWith("aura:activity:edit:")) {
    if (!requireStaff(interaction)) return;
    const id = interaction.customId.slice("aura:activity:edit:".length);
    const data = guildData(interaction.guildId);
    const activity = data.activities[id];
    if (!activity) return interaction.reply({ content: "La actividad ya no existe; vuelve a seleccionarla.", ephemeral: true });

    const title = interaction.fields.getTextInputValue("title").trim();
    const description = interaction.fields.getTextInputValue("description").trim();
    const cron = interaction.fields.getTextInputValue("cron").trim();
    const banner = interaction.fields.getTextInputValue("banner").trim();
    if (!title || !description) {
      return interaction.reply({ content: "El nombre y la descripción no pueden quedar vacíos.", ephemeral: true });
    }
    if (!parseCronList(cron)) {
      return interaction.reply({
        content: "Cron inválido. Usa cinco campos por horario: `minuto hora día-del-mes mes día-de-la-semana`. Separa varios horarios con `;`.",
        ephemeral: true,
      });
    }
    if (banner && !isHttpsUrl(banner)) {
      return interaction.reply({ content: "El banner debe ser una URL HTTPS válida.", ephemeral: true });
    }

    activity.title = title;
    activity.description = description;
    activity.cron = cron;
    activity.banner = banner || null;
    activity.active ??= true;
    saveStore();
    return interaction.reply({ content: `Actividad **${title}** (\`${id}\`) actualizada.`, ephemeral: true });
  }

  if (interaction.customId === "aura:request:create") return createRequest(interaction);
  if (interaction.customId.startsWith("aura:request:edit:")) return editRequest(interaction);
  if (interaction.customId.startsWith("aura:ticket-create:")) return createTicket(interaction);
}

async function createTicket(interaction) {
  const data = guildData(interaction.guildId);
  if (Object.values(data.tickets).some((ticket) => ticket.userId === interaction.user.id && ticket.status === "open")) {
    return interaction.reply({ content: "Ya tienes un ticket abierto.", ephemeral: true });
  }
  const category = Buffer.from(interaction.customId.split(":").pop(), "base64url").toString("utf8");
  const icName = interaction.fields.getTextInputValue("ic-name");
  const details = interaction.fields.getTextInputValue("details");
  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16) || "usuario";
  const ticketId = randomUUID().slice(0, 8);
  const permissionOverwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
  ];
  const staffRole = data.settings.staff_role;
  if (staffRole) permissionOverwrites.push({ id: staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const channel = await interaction.guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: data.settings.ticket_category || undefined,
    permissionOverwrites,
    reason: `Ticket de ${interaction.user.tag}`,
  });
  data.tickets[channel.id] = { userId: interaction.user.id, ticketId, category, icName, status: "open", createdAt: new Date().toISOString() };
  saveStore();
  await channel.send({
    content: `${staffRole ? `<@&${staffRole}> ` : ""}<@${interaction.user.id}>`,
    embeds: [makeEmbed(`Ticket ${category}`, `**Usuario:** <@${interaction.user.id}>\n**Nombre IC:** ${icName}\n\n**Solicitud:**\n${details}`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aura:ticket-close:${ticketId}`).setLabel("Cerrar ticket").setStyle(ButtonStyle.Danger),
    )],
  });
  return interaction.reply({ content: `Ticket creado: ${channel}`, ephemeral: true });
}

async function closeTicket(interaction) {
  const data = guildData(interaction.guildId);
  const ticket = data.tickets[interaction.channelId];
  if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Este ticket ya está cerrado o no existe.", ephemeral: true });
  if (ticket.userId !== interaction.user.id && !isStaff(interaction)) {
    return interaction.reply({ content: "Solo quien abrió el ticket o el personal puede cerrarlo.", ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const messages = [];
  let before;
  while (true) {
    const batch = await interaction.channel.messages.fetch({ limit: 100, before });
    messages.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.last().id;
  }
  const transcript = messages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => `[${new Date(message.createdTimestamp).toISOString()}] ${message.author.tag}: ${message.content}${message.attachments.size ? ` [adjuntos: ${[...message.attachments.values()].map((file) => file.url).join(", ")}]` : ""}`)
    .join("\n");
  const logChannel = await fetchTextChannel(interaction.guild, data.settings.logs_channel);
  if (!logChannel) {
    return interaction.editReply("No se cerró el ticket: configura primero un canal de registros con /aura-config.");
  }
  await logChannel.send({
    content: `Transcripción del ticket **${ticket.ticketId}** (${interaction.channel.name}).`,
    files: [new AttachmentBuilder(Buffer.from(transcript || "Sin mensajes.", "utf8"), { name: `ticket-${ticket.ticketId}.txt` })],
  });
  ticket.status = "closed";
  ticket.closedAt = new Date().toISOString();
  saveStore();
  await interaction.editReply("Ticket cerrado y transcripción registrada.");
  await interaction.channel.delete(`Ticket cerrado por ${interaction.user.tag}`);
}

async function completeActivity(interaction) {
  const [, , activityId, encodedOccurrence] = interaction.customId.split(":");
  const occurrence = Buffer.from(encodedOccurrence, "base64url").toString("utf8");
  const data = guildData(interaction.guildId);
  const activity = data.activities[activityId];
  if (!activity || activity.completed[occurrence]) {
    return interaction.reply({ content: "Esta actividad ya fue completada o ya no existe.", ephemeral: true });
  }
  if (!isStaff(interaction)) return interaction.reply({ content: "Solo el personal puede marcar la actividad como hecha.", ephemeral: true });
  activity.attendance[occurrence] ||= [];
  if (!activity.attendance[occurrence].includes(interaction.user.id)) activity.attendance[occurrence].push(interaction.user.id);
  activity.completed[occurrence] = { completedBy: interaction.user.id, completedAt: new Date().toISOString() };
  const key = occurrence.slice(0, 7);
  data.ranking[key] ||= {};
  for (const userId of activity.attendance[occurrence]) {
    data.ranking[key][userId] = (data.ranking[key][userId] || 0) + 1;
  }
  saveStore();
  await interaction.update({
    embeds: [makeEmbed(`✅ ${activity.title}`, `${activity.description}\n\n**Asistencia:** ${activity.attendance[occurrence].map((id) => `<@${id}>`).join(", ")}`)],
    components: [],
  });
}

const invalidCronWarnings = new Set();
const activityPublicationsInFlight = new Set();

async function processActivitySchedule() {
  const now = new Date();
  const occurrence = now.toISOString().slice(0, 16);
  for (const [guildId, data] of Object.entries(store.guilds)) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const channel = await fetchTextChannel(guild, data.settings.activity_channel);
    if (!channel) continue;
    for (const [id, activity] of Object.entries(data.activities)) {
      if (activity.active === false || activity.sent?.[occurrence]) continue;
      const crons = getActivityCrons(activity);
      if (!crons.some((expression) => {
        const parsed = parseCron(expression);
        if (!parsed) {
          const warningKey = `${guildId}:${id}:${expression}`;
          if (!invalidCronWarnings.has(warningKey)) {
            console.error(`Cron inválido en la actividad ${id} del servidor ${guildId}: ${expression}`);
            invalidCronWarnings.add(warningKey);
          }
          return false;
        }
        return cronMatches(parsed, now);
      })) continue;

      const publicationKey = `${guildId}:${id}:${occurrence}`;
      if (activityPublicationsInFlight.has(publicationKey)) continue;
      activityPublicationsInFlight.add(publicationKey);
      try {
        const embed = makeEmbed(activity.title, `${activity.description}\n\n**Horario:** ${occurrence.replace("T", " ")} UTC`);
        if (activity.banner && isHttpsUrl(activity.banner)) embed.setImage(activity.banner);
        await channel.send({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`aura:activity-done:${id}:${Buffer.from(occurrence).toString("base64url")}`)
              .setLabel("Marcar como hecha")
              .setStyle(ButtonStyle.Success),
          )],
        });
        activity.sent ||= {};
        activity.sent[occurrence] = true;
        saveStore();
      } finally {
        activityPublicationsInFlight.delete(publicationKey);
      }
    }
  }
}

function fillRotatingOrders() {
  const now = Date.now();
  for (const [guildId, data] of Object.entries(store.guilds)) {
    const orders = data.orders;
    if (orders.active.length && orders.startedAt && now - orders.startedAt >= 30 * 60 * 1000) {
      orders.waiting.push(...orders.active);
      orders.active = [];
      orders.startedAt = null;
      fillOrderSlots(orders);
      const guild = client.guilds.cache.get(guildId);
      if (guild) announceOrderState(guild, data).catch((error) => console.error("No se pudo anunciar la rotación de encargos:", error));
      saveStore();
    }
  }
}

let ocrWorkerPromise;
async function transcribeImage(message, attachment) {
  const { createWorker } = require("tesseract.js");
  ocrWorkerPromise ||= createWorker(process.env.OCR_LANGUAGES || "spa+eng");
  const worker = await ocrWorkerPromise;
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`No se pudo descargar la imagen (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const result = await worker.recognize(buffer);
  const text = result.data.text.trim();
  await message.reply({
    embeds: [makeEmbed("Transcripción automática de imagen", text ? text.slice(0, 4000) : "No se detectó texto legible.")],
    allowedMentions: { repliedUser: false },
  });
}

client.on("guildMemberAdd", async (member) => {
  const settings = guildData(member.guild.id).settings;
  const channel = await fetchTextChannel(member.guild, settings.welcome_channel);
  if (!channel) return;
  const embed = makeEmbed("¡Te damos la bienvenida a Aura Security!", `Hola ${member}, nos alegra tenerte aquí.\n\nYa somos **${member.guild.memberCount}** miembros.`);
  embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  if (settings.logo_url) embed.setAuthor({ name: "Aura Security", iconURL: settings.logo_url });
  if (settings.banner_url) embed.setImage(settings.banner_url);
  await channel.send({ embeds: [embed] });
});

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  const channelId = guildData(message.guild.id).settings.ocr_channel;
  if (!channelId || channelId !== message.channelId) return;
  for (const attachment of message.attachments.values()) {
    if (!attachment.contentType?.startsWith("image/")) continue;
    if (attachment.size > 8 * 1024 * 1024) {
      await message.reply({ content: "La imagen supera el límite de OCR de 8 MB.", allowedMentions: { repliedUser: false } });
      continue;
    }
    try {
      await transcribeImage(message, attachment);
    } catch (error) {
      console.error("Error transcribiendo imagen:", error);
      await message.reply({ content: "No se pudo transcribir esta imagen. Revisa los registros del bot.", allowedMentions: { repliedUser: false } });
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.guildId) {
      if (interaction.isRepliable()) await interaction.reply({ content: "Aura Security solo está disponible en servidores.", ephemeral: true });
      return;
    }
    if (interaction.isAutocomplete()) await handleActivityAutocomplete(interaction);
    else if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton()) await handleButton(interaction);
    else if (interaction.isStringSelectMenu()) await handleSelect(interaction);
    else if (interaction.isModalSubmit()) await handleModal(interaction);
  } catch (error) {
    console.error("Error procesando interacción:", error);
    if (interaction.isAutocomplete()) {
      await interaction.respond([]).catch(console.error);
    } else if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Ocurrió un error al procesar la solicitud.", ephemeral: true }).catch(console.error);
    } else if (interaction.isRepliable() && interaction.deferred) {
      await interaction.followUp({ content: "Ocurrió un error al procesar la solicitud.", ephemeral: true }).catch(console.error);
    }
  }
});

client.once("ready", async () => {
  console.log(`Aura Security conectado como ${client.user.tag}.`);
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
  try {
    await rest.put(route, { body: commands });
    console.log(`Comandos registrados${GUILD_ID ? ` en el servidor ${GUILD_ID}` : " globalmente"}.`);
  } catch (error) {
    console.error("No se pudieron registrar los comandos de Aura Security:", error);
  }
  setInterval(() => {
    processActivitySchedule().catch((error) => console.error("Error procesando actividades:", error));
    fillRotatingOrders();
  }, 30_000);
});

async function shutdown() {
  if (ocrWorkerPromise) {
    const worker = await ocrWorkerPromise;
    await worker.terminate();
  }
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => shutdown().catch((error) => {
  console.error("Error al cerrar el bot:", error);
  process.exit(1);
}));
process.on("SIGTERM", () => shutdown().catch((error) => {
  console.error("Error al cerrar el bot:", error);
  process.exit(1);
}));

client.login(TOKEN);