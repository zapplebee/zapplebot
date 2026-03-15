import {
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type Client,
  type Interaction,
} from "discord.js";
import { logger } from "./global";
import { saveCharacter, getCharacter, getAliveMonsters, hasCombat, dndCombatTool } from "./tools/dnd";
import { openai, MODEL } from "./llm-client";

// --- Modal custom IDs ---
const MODAL_CREATE_CHARACTER = "dnd_create_character";
const MODAL_SPAWN = "dnd_spawn";

// --- Slash command registration ---

export async function registerSlashCommands(client: Client) {
  const guildId = client.guilds.cache.first()?.id;
  if (!guildId) {
    logger.warn("registerSlashCommands: no guild found, skipping");
    return;
  }

  const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, guildId),
    {
      body: [
        {
          name: "dnd",
          description: "D&D combat commands",
          options: [
            { type: 1, name: "create-character", description: "Create or update your character sheet" },
            { type: 1, name: "my-character", description: "Show your current character sheet" },
            { type: 1, name: "spawn", description: "Spawn a horde of monsters" },
            { type: 1, name: "attack", description: "Attack a monster" },
            { type: 1, name: "monster-turn", description: "Monsters take their turn attacking you" },
            { type: 1, name: "status", description: "Show the current horde status" },
            { type: 1, name: "clear", description: "End the current combat" },
          ],
        },
      ],
    }
  );

  logger.info("slash commands registered", { guildId, commands: ["/dnd"] });
}

// --- Flavor text via LLM ---

async function flavor(situation: string): Promise<string> {
  try {
    const resp = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "/no_think You are a D&D narrator. Write exactly 1-2 vivid sentences of combat flavor. No mechanics, just drama.",
        },
        { role: "user", content: situation },
      ],
      max_tokens: 120,
    });
    return resp.choices[0]?.message.content?.trim() ?? "";
  } catch {
    return "";
  }
}

// --- Interaction handler ---

export async function handleInteraction(interaction: Interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return;
  if (interaction.isChatInputCommand() && interaction.commandName !== "dnd") return;

  // ── /dnd create-character ──────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.options.getSubcommand() === "create-character") {
    const existing = getCharacter(interaction.user.id);
    const modal = new ModalBuilder()
      .setCustomId(MODAL_CREATE_CHARACTER)
      .setTitle(existing ? "Edit Your Character" : "Create Your Character");

    const name = new TextInputBuilder().setCustomId("char_name").setLabel("Character name").setStyle(TextInputStyle.Short).setRequired(true);
    const ac   = new TextInputBuilder().setCustomId("char_ac").setLabel("Armor Class (e.g. 16)").setStyle(TextInputStyle.Short).setRequired(true);
    const hp   = new TextInputBuilder().setCustomId("char_hp").setLabel("Max HP (e.g. 28)").setStyle(TextInputStyle.Short).setRequired(true);
    const atk  = new TextInputBuilder().setCustomId("char_attack_bonus").setLabel("Attack bonus (e.g. 5)").setStyle(TextInputStyle.Short).setRequired(true);
    const dmg  = new TextInputBuilder().setCustomId("char_damage").setLabel("Damage dice (e.g. 1d8+3)").setStyle(TextInputStyle.Short).setRequired(true);

    if (existing) {
      name.setValue(existing.name);
      ac.setValue(String(existing.ac));
      hp.setValue(String(existing.maxHp));
      atk.setValue(String(existing.attackBonus));
      dmg.setValue(existing.damage);
    }

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(name),
      new ActionRowBuilder<TextInputBuilder>().addComponents(ac),
      new ActionRowBuilder<TextInputBuilder>().addComponents(hp),
      new ActionRowBuilder<TextInputBuilder>().addComponents(atk),
      new ActionRowBuilder<TextInputBuilder>().addComponents(dmg),
    );
    await interaction.showModal(modal);
    return;
  }

  // ── /dnd my-character ──────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.options.getSubcommand() === "my-character") {
    const char = getCharacter(interaction.user.id);
    if (!char) {
      await interaction.reply({ content: "You don't have a character yet. Use `/dnd create-character` to make one.", ephemeral: false });
      return;
    }
    await interaction.reply({
      content: `**${char.name}** (<@${interaction.user.id}>)\nAC: ${char.ac} | HP: ${char.hp}/${char.maxHp} | Attack: +${char.attackBonus} | Damage: ${char.damage}`,
      ephemeral: false,
    });
    return;
  }

  // ── /dnd spawn ─────────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.options.getSubcommand() === "spawn") {
    const modal = new ModalBuilder().setCustomId(MODAL_SPAWN).setTitle("Spawn a Horde");
    const kobolds = new TextInputBuilder().setCustomId("spawn_kobolds").setLabel("Number of kobolds").setStyle(TextInputStyle.Short).setRequired(false).setValue("0");
    const goblins = new TextInputBuilder().setCustomId("spawn_goblins").setLabel("Number of goblins").setStyle(TextInputStyle.Short).setRequired(false).setValue("0");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(kobolds),
      new ActionRowBuilder<TextInputBuilder>().addComponents(goblins),
    );
    await interaction.showModal(modal);
    return;
  }

  // ── /dnd attack ────────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.options.getSubcommand() === "attack") {
    const char = getCharacter(interaction.user.id);
    if (!char) {
      await interaction.reply({ content: "You need a character first. Use `/dnd create-character`.", ephemeral: false });
      return;
    }
    const alive = getAliveMonsters();
    if (alive.length === 0) {
      await interaction.reply({ content: "No monsters to attack! Use `/dnd spawn` to summon a horde.", ephemeral: false });
      return;
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId("dnd_attack_select")
      .setPlaceholder("Choose your target")
      .addOptions(
        alive.map((m) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${m.id} (${m.hp}/${m.maxHp} HP, AC ${m.ac})`)
            .setValue(m.id)
        )
      );
    await interaction.reply({
      content: `**${char.name}**, choose your target:`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    });
    return;
  }

  // ── /dnd monster-turn ──────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.options.getSubcommand() === "monster-turn") {
    const char = getCharacter(interaction.user.id);
    if (!char) {
      await interaction.reply({ content: "You need a character first. Use `/dnd create-character`.", ephemeral: false });
      return;
    }
    if (!hasCombat()) {
      await interaction.reply({ content: "No active combat. Use `/dnd spawn` first.", ephemeral: false });
      return;
    }

    await interaction.deferReply();

    const result = await dndCombatTool.implementation({ action: "monster_turn" }) as {
      attacks: { attacker: string; attack_name: string; hit: boolean; crit: boolean; damage: number; damage_type: string; d20: number; attack_total: number; player_ac: number; pack_tactics_advantage: boolean }[];
      total_damage: number;
      message?: string;
    };

    if (result.message) {
      await interaction.editReply(result.message);
      return;
    }

    const lines = result.attacks.map((a) => {
      if (a.hit) return `**${a.attacker}** hits **${char.name}** with ${a.attack_name} — rolled ${a.d20}+${4} = ${a.attack_total} vs AC ${a.player_ac}${a.crit ? " 💥 CRIT" : ""} → **${a.damage} ${a.damage_type} damage**${a.pack_tactics_advantage ? " *(pack tactics)*" : ""}`;
      return `**${a.attacker}** misses **${char.name}** with ${a.attack_name} — rolled ${a.d20}+${4} = ${a.attack_total} vs AC ${a.player_ac}`;
    });

    const situation = result.attacks.length === 0
      ? "The monsters growl but do nothing."
      : `${char.name} is attacked by ${result.attacks.length} monster(s). ${result.attacks.filter(a => a.hit).length} hit for a total of ${result.total_damage} damage.`;

    const flavorText = await flavor(situation);

    await interaction.editReply(
      [flavorText, "", ...lines, "", `**Total damage to ${char.name}: ${result.total_damage}**`]
        .filter(Boolean).join("\n")
    );
    return;
  }

  // ── /dnd status ────────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.options.getSubcommand() === "status") {
    const result = await dndCombatTool.implementation({ action: "status" }) as {
      error?: string;
      alive: { id: string; type: string; hp: number; maxHp: number; ac: number }[];
      dead: string[];
      player_ac: number;
      combat_over: boolean;
    };

    if (result.error) {
      await interaction.reply({ content: result.error, ephemeral: false });
      return;
    }
    if (result.combat_over) {
      await interaction.reply({ content: "The battlefield is clear. All monsters are defeated!", ephemeral: false });
      return;
    }

    const aliveLines = result.alive.map((m) => `• **${m.id}** — ${m.hp}/${m.maxHp} HP (AC ${m.ac})`);
    const deadLine = result.dead.length > 0 ? `\n☠️ Slain: ${result.dead.join(", ")}` : "";
    await interaction.reply({ content: `**Horde Status**\n${aliveLines.join("\n")}${deadLine}`, ephemeral: false });
    return;
  }

  // ── /dnd clear ─────────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.options.getSubcommand() === "clear") {
    await dndCombatTool.implementation({ action: "clear" });
    await interaction.reply({ content: "Combat ended. The horde disperses.", ephemeral: false });
    return;
  }

  // ── Modal: create-character ────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === MODAL_CREATE_CHARACTER) {
    const isUpdate = !!getCharacter(interaction.user.id);
    const name = interaction.fields.getTextInputValue("char_name");
    const ac = parseInt(interaction.fields.getTextInputValue("char_ac"));
    const hp = parseInt(interaction.fields.getTextInputValue("char_hp"));
    const attackBonus = parseInt(interaction.fields.getTextInputValue("char_attack_bonus"));
    const damage = interaction.fields.getTextInputValue("char_damage");

    if (isNaN(ac) || isNaN(hp) || isNaN(attackBonus)) {
      await interaction.reply({ content: "AC, HP, and attack bonus must be numbers.", ephemeral: false });
      return;
    }

    await saveCharacter(interaction.user.id, { name, ac, hp, maxHp: hp, attackBonus, damage });
    logger.info("character saved", { userId: interaction.user.id, isUpdate, name, ac, hp, attackBonus, damage });

    const verb = isUpdate ? "updated" : "created";
    await interaction.reply({
      content: `Character ${verb}! **${name}** (<@${interaction.user.id}>) — AC: ${ac} | HP: ${hp} | Attack: +${attackBonus} | Damage: ${damage}`,
      ephemeral: false,
    });
    return;
  }

  // ── Modal: spawn ───────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === MODAL_SPAWN) {
    const kobolds = parseInt(interaction.fields.getTextInputValue("spawn_kobolds")) || 0;
    const goblins = parseInt(interaction.fields.getTextInputValue("spawn_goblins")) || 0;

    if (kobolds + goblins === 0) {
      await interaction.reply({ content: "Specify at least one kobold or goblin.", ephemeral: false });
      return;
    }

    await interaction.deferReply();

    const result = await dndCombatTool.implementation({ action: "spawn", kobolds, goblins }) as {
      spawned: { id: string; type: string; hp: number; ac: number }[];
      player_ac: number;
    };

    const lines = result.spawned.map((m) => `• **${m.id}** — ${m.hp} HP (AC ${m.ac})`);
    const situation = `A horde of ${result.spawned.length} monster(s) emerges: ${result.spawned.map(m => m.id).join(", ")}.`;
    const flavorText = await flavor(situation);

    await interaction.editReply(
      [flavorText, "", "**Horde spawned:**", ...lines].filter(Boolean).join("\n")
    );
    return;
  }

  // ── Select menu: attack ────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "dnd_attack_select") {
    const char = getCharacter(interaction.user.id);
    if (!char) {
      await interaction.reply({ content: "You need a character first. Use `/dnd create-character`.", ephemeral: false });
      return;
    }

    const targetId = interaction.values[0]!;
    await interaction.deferUpdate();

    const result = await dndCombatTool.implementation({
      action: "attack",
      target_id: targetId,
      attack_bonus: char.attackBonus,
      damage_dice: char.damage,
    }) as {
      error?: string;
      target: string;
      d20: number;
      attack_bonus: number;
      attack_total: number;
      target_ac: number;
      hit: boolean;
      crit: boolean;
      damage: number;
      target_hp_remaining: number;
      target_killed: boolean;
      monsters_remaining: number;
    };

    if (result.error) {
      await interaction.followUp(result.error);
      return;
    }

    const mechLine = result.hit
      ? `**${char.name}** attacks **${result.target}** — rolled ${result.d20}+${result.attack_bonus} = ${result.attack_total} vs AC ${result.target_ac}${result.crit ? " 💥 CRIT" : ""} → **${result.damage} damage** (${result.target_hp_remaining} HP remaining)`
      : `**${char.name}** attacks **${result.target}** — rolled ${result.d20}+${result.attack_bonus} = ${result.attack_total} vs AC ${result.target_ac} → **miss**`;

    const situation = result.target_killed
      ? `${char.name} slays ${result.target} with a ${result.crit ? "critical hit" : "killing blow"} dealing ${result.damage} damage. ${result.monsters_remaining} monster(s) remain.`
      : result.hit
      ? `${char.name} hits ${result.target} for ${result.damage} damage${result.crit ? " (critical hit!)" : ""}. It has ${result.target_hp_remaining} HP left.`
      : `${char.name} swings at ${result.target} but misses completely.`;

    const flavorText = await flavor(situation);

    const suffix = result.target_killed
      ? `\n☠️ **${result.target} has been slain!** ${result.monsters_remaining} monster(s) remain.`
      : "";

    // Remove the select menu from the original message, post result as follow-up
    await interaction.editReply({ content: `**${char.name}** attacks **${targetId}**…`, components: [] });
    await interaction.followUp([flavorText, "", mechLine, suffix].filter(Boolean).join("\n"));
    return;
  }
}
