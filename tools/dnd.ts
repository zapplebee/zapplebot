import { tool, text } from "../bot-tool";
import { z } from "zod";
import { JSONFilePreset } from "lowdb/node";
import { rollDiceTool } from "./dice";

// --- Dice helpers (delegate to rollDiceTool) ---

async function roll(sides: number): Promise<number> {
  const { rolls } = await rollDiceTool.implementation({ count: 1, sides }) as { rolls: number[]; sum: number };
  return rolls[0]!;
}

async function d20(advantage = false, disadvantage = false): Promise<number> {
  const count = advantage || disadvantage ? 2 : 1;
  const { rolls } = await rollDiceTool.implementation({ count, sides: 20 }) as { rolls: number[]; sum: number };
  if (advantage) return Math.max(...rolls);
  if (disadvantage) return Math.min(...rolls);
  return rolls[0]!;
}

async function parseDamage(expr: string, crit = false): Promise<number> {
  const m = expr.match(/([0-9]+)d([0-9]+)([+-][0-9]+)?/i);
  if (!m) return 1;
  const count = parseInt(m[1]!) * (crit ? 2 : 1);
  const sides = parseInt(m[2]!);
  const bonus = parseInt(m[3] ?? "0");
  const { sum } = await rollDiceTool.implementation({ count, sides }) as { rolls: number[]; sum: number };
  return Math.max(1, sum + bonus);
}

// --- Monster definitions ---

const STAT_BLOCKS = {
  kobold: {
    ac: 12,
    rollHp: async () => Math.max(1, (await rollDiceTool.implementation({ count: 2, sides: 6 }) as { sum: number }).sum - 2),
    attacks: [
      { name: "Dagger", bonus: 4, damage: "1d4+2", damageType: "piercing" },
      { name: "Sling", bonus: 4, damage: "1d4+2", damageType: "bludgeoning" },
    ],
    // Pack Tactics: advantage when 2+ living kobolds
    packTactics: true,
    traits: ["Pack Tactics: advantage on attack rolls when an ally is adjacent", "Sunlight Sensitivity"],
  },
  goblin: {
    ac: 15,
    rollHp: async () => Math.max(1, (await rollDiceTool.implementation({ count: 2, sides: 6 }) as { sum: number }).sum),
    attacks: [
      { name: "Scimitar", bonus: 4, damage: "1d6+2", damageType: "slashing" },
      { name: "Shortbow", bonus: 4, damage: "1d6+2", damageType: "piercing" },
    ],
    packTactics: false,
    traits: ["Nimble Escape: can Disengage or Hide as a bonus action — +2 AC against opportunity attacks"],
  },
} as const;

type MonsterType = keyof typeof STAT_BLOCKS;

// --- Character sheet ---

export type Character = {
  name: string;
  ac: number;
  hp: number;
  maxHp: number;
  attackBonus: number;
  damage: string;
};

// --- Combat state ---

type Monster = {
  id: string;
  type: MonsterType;
  hp: number;
  maxHp: number;
};

type DndData = {
  combat: {
    monsters: Monster[];
    playerAc: number;
  } | null;
  characters: Record<string, Character>; // keyed by Discord user ID
};

const db = await JSONFilePreset<DndData>("dnd.json", { combat: null, characters: {} });
db.data.characters ??= {};

export async function saveCharacter(userId: string, character: Character) {
  db.data.characters[userId] = character;
  await db.write();
}

export function getCharacter(userId: string): Character | undefined {
  return db.data.characters[userId];
}

export function getAliveMonsters(): { id: string; type: MonsterType; hp: number; maxHp: number; ac: number }[] {
  return (db.data.combat?.monsters ?? [])
    .filter((m) => m.hp > 0)
    .map((m) => ({ id: m.id, type: m.type, hp: m.hp, maxHp: m.maxHp, ac: STAT_BLOCKS[m.type].ac }));
}

export function hasCombat(): boolean {
  return db.data.combat !== null && (db.data.combat.monsters?.some((m) => m.hp > 0) ?? false);
}

// --- Tool ---

export const dndCombatTool = tool({
  name: "dnd_combat",
  description: text`
    Manages a D&D 5e combat encounter against a horde of kobolds and/or goblins.
    Handles all mechanics: dice rolls, AC checks, HP tracking, pack tactics, damage.
    The model narrates; this tool resolves all numbers.

    Use this tool whenever the user wants to fight monsters, asks about D&D combat,
    wants to attack something, or when the message includes /dnd.

    Actions:
    - spawn: create a horde (kobolds and/or goblins) and set the player's AC
    - attack: player attacks one monster by id (provide attack bonus and damage dice if known)
    - monster_turn: all living monsters each make one attack against the player
    - status: show current HP of all monsters
    - clear: end/reset the combat
  `,
  parameters: {
    action: z
      .enum(["spawn", "attack", "monster_turn", "status", "clear"])
      .describe("Combat action to perform"),
    kobolds: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Number of kobolds to spawn"),
    goblins: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Number of goblins to spawn"),
    player_ac: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe("Player's Armor Class (default 10 = unarmored)"),
    target_id: z
      .string()
      .optional()
      .describe("Monster ID to target, e.g. 'kobold-1' or 'goblin-3'"),
    attack_bonus: z
      .number()
      .int()
      .optional()
      .describe("Player's total attack bonus added to the d20 roll (default 0)"),
    damage_dice: z
      .string()
      .optional()
      .describe("Player's damage expression e.g. '1d8+3' or '2d6' (default '1d6')"),
  },
  implementation: async ({
    action,
    kobolds = 0,
    goblins = 0,
    player_ac = 10,
    target_id,
    attack_bonus = 0,
    damage_dice = "1d6",
  }: {
    action: "spawn" | "attack" | "monster_turn" | "status" | "clear";
    kobolds?: number;
    goblins?: number;
    player_ac?: number;
    target_id?: string;
    attack_bonus?: number;
    damage_dice?: string;
  }) => {
    // --- SPAWN ---
    if (action === "spawn") {
      const monsters: Monster[] = [];
      for (let i = 1; i <= kobolds; i++) {
        const hp = await STAT_BLOCKS.kobold.rollHp();
        monsters.push({ id: `kobold-${i}`, type: "kobold", hp, maxHp: hp });
      }
      for (let i = 1; i <= goblins; i++) {
        const hp = await STAT_BLOCKS.goblin.rollHp();
        monsters.push({ id: `goblin-${i}`, type: "goblin", hp, maxHp: hp });
      }
      if (monsters.length === 0) {
        return { error: "Specify at least one kobold or goblin to spawn." };
      }
      db.data.combat = { monsters, playerAc: player_ac };
      await db.write();
      return {
        spawned: monsters.map((m) => ({
          id: m.id,
          type: m.type,
          hp: m.hp,
          ac: STAT_BLOCKS[m.type].ac,
          traits: STAT_BLOCKS[m.type].traits,
        })),
        player_ac,
      };
    }

    const combat = db.data.combat;
    if (!combat) return { error: "No active combat. Use action: spawn first." };

    // --- STATUS ---
    if (action === "status") {
      const alive = combat.monsters.filter((m) => m.hp > 0);
      const dead = combat.monsters.filter((m) => m.hp <= 0);
      return {
        player_ac: combat.playerAc,
        alive: alive.map((m) => ({
          id: m.id,
          type: m.type,
          hp: m.hp,
          maxHp: m.maxHp,
          ac: STAT_BLOCKS[m.type].ac,
        })),
        dead: dead.map((m) => m.id),
        combat_over: alive.length === 0,
      };
    }

    // --- CLEAR ---
    if (action === "clear") {
      db.data.combat = null;
      await db.write();
      return { message: "Combat ended." };
    }

    // --- PLAYER ATTACK ---
    if (action === "attack") {
      if (!target_id) return { error: "Provide target_id to attack, e.g. 'kobold-1'." };
      const target = combat.monsters.find((m) => m.id === target_id);
      if (!target) return { error: `No monster with id '${target_id}'. Check status for valid ids.` };
      if (target.hp <= 0) return { error: `${target_id} is already dead.` };

      const def = STAT_BLOCKS[target.type];
      const attackRoll = await d20();
      const total = attackRoll + attack_bonus;
      const crit = attackRoll === 20;
      const hit = crit || total >= def.ac;
      const damage = hit ? await parseDamage(damage_dice, crit) : 0;

      if (hit) {
        target.hp = Math.max(0, target.hp - damage);
        await db.write();
      }

      return {
        target: target_id,
        d20: attackRoll,
        attack_bonus,
        attack_total: total,
        target_ac: def.ac,
        hit,
        crit,
        damage,
        target_hp_remaining: target.hp,
        target_killed: target.hp === 0,
        monsters_remaining: combat.monsters.filter((m) => m.hp > 0).length,
      };
    }

    // --- MONSTER TURN ---
    if (action === "monster_turn") {
      const alive = combat.monsters.filter((m) => m.hp > 0);
      if (alive.length === 0) {
        return { message: "No monsters remaining. Combat is over.", attacks: [], total_damage: 0 };
      }

      const livingKobolds = alive.filter((m) => m.type === "kobold").length;

      const attacks = await Promise.all(alive.map(async (monster) => {
        const def = STAT_BLOCKS[monster.type];
        const atk = def.attacks[Math.floor(Math.random() * def.attacks.length)]!;
        const advantage = def.packTactics && livingKobolds >= 2;
        const attackRoll = await d20(advantage);
        const total = attackRoll + atk.bonus;
        const crit = attackRoll === 20;
        const hit = crit || total >= combat.playerAc;
        const damage = hit ? await parseDamage(atk.damage, crit) : 0;
        return {
          attacker: monster.id,
          attack_name: atk.name,
          d20: attackRoll,
          attack_total: total,
          player_ac: combat.playerAc,
          pack_tactics_advantage: advantage,
          hit,
          crit,
          damage,
          damage_type: atk.damageType,
        };
      }));

      return {
        attacks,
        total_damage: attacks.reduce((sum, a) => sum + a.damage, 0),
      };
    }

    return { error: "Unknown action." };
  },
});
