import {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	InteractionReplyOptions,
} from "discord.js";
import { DateTime } from "luxon";
import Keyv from "keyv";
import * as dotenv from "dotenv";
dotenv.config();

export const factDb = new Keyv(process.env.DB_URL, {
	namespace: "facts",
});
factDb.on("error", (err) => console.log("DB error:", err));
export const factSubjectCache = new Map<string, string[]>();

export interface FactInfo {
	authorId: string;
	subject: string;
	body: string;
	editedAt: string;
}

export const generateFactMessage = (
	info: FactInfo,
): InteractionReplyOptions => {
	return {
		content: `**${info.subject.toUpperCase()}** *(adăugat de <@${
			info.authorId
		}>)*\n\n${info.body}`,
		allowedMentions: {
			parse: [],
		},
	};
};

export const getGuildFacts = async (
	guildId: string,
): Promise<Record<string, FactInfo | undefined>> => {
	return (await factDb.get(guildId)) ?? {};
};

export const respondToSubjectAutocomplete = async (
	interaction: AutocompleteInteraction,
) => {
	const guildId = interaction.guildId!;

	let factKeys = factSubjectCache.get(guildId);
	if (!factKeys) {
		const guildFactData = (await factDb.get(guildId)) ?? {};
		factKeys = Object.keys(guildFactData);
		factSubjectCache.set(guildId, factKeys);
	}

	const response = factKeys
		.filter((k) =>
			k.startsWith(interaction.options.getFocused().toLowerCase()),
		)
		.map((k) => ({ name: k, value: k }));

	interaction.respond(response);
};

export const handleInfoCommand = async (
	interaction: ChatInputCommandInteraction,
) => {
	const guildFacts = await getGuildFacts(interaction.guildId!);
	const factKeys = Object.keys(guildFacts);

	switch (interaction.options.getSubcommand()) {
		case "despre": {
			let subject = interaction.options.getString("subiect", false);
			// Pick at random
			if (!subject)
				subject = factKeys[Math.floor(Math.random() * factKeys.length)];
			const factInfo = guildFacts[subject];
			if (!factInfo) {
				interaction.reply({
					ephemeral: true,
					content: `Nu există informații pentru acest subiect. Poți să adaugi folosind comanda </info edit:${process.env.INFO_COMMAND_ID}>.`,
				});
				return;
			}

			await interaction.reply(generateFactMessage(factInfo));

			break;
		}
		case "edit": {
			const subject = interaction.options
				.getString("subiect", true)
				.toLowerCase();
			const body = interaction.options.getString("info", true);
			let factInfo = guildFacts[subject];

			if (body.length > 1900 || subject.length > 100) {
				interaction.reply({
					ephemeral: true,
					content: "Textul este prea lung.",
				});
				return;
			}

			if (
				factInfo &&
				interaction.user.id !== factInfo.authorId &&
				!interaction.memberPermissions!.has("ManageMessages", true)
			) {
				interaction.reply({
					ephemeral: true,
					content: "Nu poți edita această informație.",
				});
				return;
			}

			if (body === "REMOVE") {
				if (!factInfo) {
					await interaction.reply({
						ephemeral: true,
						content: "Nu poți șterge această informație.",
					});
					return;
				}

				delete guildFacts[subject];
				await factDb.set(interaction.guildId!, guildFacts);
				console.log(
					`Fact "${subject}" deleted by ${interaction.user.id}`,
				);
				await interaction.reply({
					ephemeral: true,
					content: `Informația adăugată de <@${factInfo.authorId}> a fost ștearsă.`,
					allowedMentions: {
						parse: [],
					},
				});
				factSubjectCache.set(
					interaction.guildId!,
					Object.keys(guildFacts),
				);
				return;
			}

			factInfo = {
				authorId: interaction.user.id,
				editedAt: DateTime.now().toISO()!,
				subject,
				body,
			};
			guildFacts[subject] = factInfo;
			await factDb.set(interaction.guildId!, guildFacts);
			console.log(
				`Fact "${subject}" edited by ${interaction.user.id}: "${body}"`,
			);
			factSubjectCache.set(interaction.guildId!, Object.keys(guildFacts));
			await interaction.reply(generateFactMessage(factInfo));

			break;
		}
	}
};
