import Keyv from "keyv";
import * as dotenv from "dotenv";
import { ChatInputCommandInteraction } from "discord.js";
dotenv.config();
export const unbDb = new Keyv(process.env.DB_URL, {
	namespace: "unbelievaboat",
});
unbDb.on("error", (err) => console.log("DB error:", err));

export interface UnbConfig {
	token?: string;
	currencyText: string;
}

export const getUnbGuildConfig = async (guildId: string) => {
	const data = (await unbDb.get(guildId)) as UnbConfig | undefined;
	return data;
};

export const handleUnbConfigCommand = async (
	interaction: ChatInputCommandInteraction,
) => {
	const token = interaction.options.getString("token", false);
	const currencyText = interaction.options.getString("currency", true);

	await unbDb.set(interaction.guildId!, {
		token: token ? token : undefined,
		currencyText,
	} satisfies UnbConfig);
	console.log(`Updated UnbelievaBoat for ${interaction.guildId} guild.`);
	interaction.reply({
		ephemeral: true,
		content: "Configurarea a fost salvată.",
	});
};
