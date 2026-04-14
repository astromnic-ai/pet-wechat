import { z } from "zod";

export const deviceTypeSchema = z.enum(["collar", "desktop"]);
export const interactionRangeSchema = z.enum(["day", "week", "month"]);
export const userSettingThemeSchema = z.enum(["system", "light", "dark", "blue"]);
export const userSettingLanguageSchema = z.enum(["zh-CN", "zh-TW", "en-US"]);

export const updateMeSchema = z
  .object({
    nickname: z.string().trim().min(1).max(64).optional(),
    avatarUrl: z.string().trim().url().nullable().optional(),
  })
  .strict();

export const updateSettingsSchema = z
  .object({
    messageEnabled: z.boolean().optional(),
    soundEnabled: z.boolean().optional(),
    theme: userSettingThemeSchema.optional(),
    language: userSettingLanguageSchema.optional(),
  })
  .strict();

export const bindPhoneSendCodeSchema = z
  .object({
    phone: z.string().trim().regex(/^1\d{10}$/, "Invalid phone"),
  })
  .strict();

export const bindPhoneVerifySchema = bindPhoneSendCodeSchema
  .extend({
    code: z.string().trim().length(6),
  })
  .strict();

export const bindEmailSendCodeSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

export const bindEmailVerifySchema = bindEmailSendCodeSchema
  .extend({
    code: z.string().trim().length(6),
  })
  .strict();

export const contentSlugSchema = z.enum([
  "help",
  "about",
  "privacy",
  "user-agreement",
]);
