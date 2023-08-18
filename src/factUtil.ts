import {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	InteractionReplyOptions,
	Message,
} from "discord.js";
import { DateTime } from "luxon";
import Keyv from "keyv";
import * as dotenv from "dotenv";
dotenv.config();

export const factDb = new Keyv(process.env.DB_URL, {
	namespace: "facts",
});
factDb.on("error", (err) => console.log("DB error:", err));
export const factSubjectsCache = new Map<string, string[]>();
export const factContentCache = new Map<string, Map<string, string>>();

export interface FactInfo {
	authorId: string;
	subject: string;
	body: string;
	editedAt: string;
	autoReply?: true;
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

const refreshFactContentCache = async (
	guildId: string,
	facts: Record<string, FactInfo | undefined>,
) => {
	const cacheValue = new Map<string, string>();
	Object.entries(facts).forEach(([k, v]) => {
		if (v && v.autoReply) cacheValue.set(k, v.body);
	});
	return cacheValue;
};

export const respondToSubjectAutocomplete = async (
	interaction: AutocompleteInteraction,
) => {
	const guildId = interaction.guildId!;

	let factKeys = factSubjectsCache.get(guildId);
	if (!factKeys) {
		const guildFactData = (await factDb.get(guildId)) ?? {};
		factKeys = Object.keys(guildFactData);
		factSubjectsCache.set(guildId, factKeys);
	}

	const response = factKeys
		.filter((k) =>
			k.includes(interaction.options.getFocused().toLowerCase()),
		)
		.map((k) => ({ name: k, value: k }))
		.slice(0, 25);

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
				factSubjectsCache.set(
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
			factSubjectsCache.set(
				interaction.guildId!,
				Object.keys(guildFacts),
			);
			await interaction.reply(generateFactMessage(factInfo));

			break;
		}
	}
};

export const handleAutoReplyCommand = async (
	interaction: ChatInputCommandInteraction,
) => {
	const subject = interaction.options
		.getString("subiect", true)
		.toLowerCase();
	const enabled = interaction.options.getBoolean("on", true);

	const allFacts = await getGuildFacts(interaction.guildId!);
	const fact = allFacts[subject];

	if (!fact) {
		await interaction.reply({
			ephemeral: true,
			content: "Nu am putut găsi acest subiect.",
		});
		return;
	}

	if (enabled) fact.autoReply = true;
	else delete fact.autoReply;

	await factDb.set(interaction.guildId!, allFacts);
	await interaction.reply(
		`Auto-reply ${
			enabled ? "pornit" : "oprit"
		} pentru **${fact.subject.toUpperCase()}**.`,
	);
	await refreshFactContentCache(interaction.guildId!, allFacts);
};

export const handleMessageCreation = async (message: Message) => {
	const contentMapping =
		factContentCache.get(message.guildId!) ??
		(await refreshFactContentCache(
			message.guildId!,
			await getGuildFacts(message.guildId!),
		));

	const body = contentMapping.get(message.content.toLowerCase());
	if (body)
		message.reply({
			allowedMentions: {
				parse: [],
				repliedUser: false,
			},
			content: body,
		});
};
