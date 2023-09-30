import {
	ActionRowBuilder,
	AutocompleteInteraction,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ChatInputCommandInteraction,
	EmbedBuilder,
	InteractionReplyOptions,
	InteractionUpdateOptions,
	Message,
} from "discord.js";
import { DateTime } from "luxon";
import Keyv from "keyv";
import * as dotenv from "dotenv";

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

export type GuildFacts = Record<string, FactInfo | undefined>;

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

export const getGuildFacts = async (guildId: string): Promise<GuildFacts> => {
	return (await factDb.get(guildId)) ?? {};
};

const generateContentCache = (facts: GuildFacts) => {
	const cacheValue = new Map<string, string>();
	Object.entries(facts).forEach(([k, v]) => {
		if (v && v.autoReply) cacheValue.set(k, v.body);
	});
	return cacheValue;
};

const updateContentCache = async (guildId: string) => {
	const facts = await getGuildFacts(guildId!);
	const cache = generateContentCache(facts);
	factContentCache.set(guildId, cache);
	console.log("Cache updated");
	return cache;
};

const getContentCache = async (guildId: string) => {
	return factContentCache.get(guildId) ?? (await updateContentCache(guildId));
};

const serializeSubject = (subject: string) => {
	return subject.toLowerCase();
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
			k.includes(serializeSubject(interaction.options.getFocused())),
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
			const subject = serializeSubject(
				interaction.options.getString("subiect", true),
			);
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
		case "list": {
			const pageNumber =
				(interaction.options.getInteger("pagina", false) ?? 1) - 1;
			const autoReplyOnly =
				interaction.options.getBoolean("auto-reply", false) ?? false;
			interaction.reply(
				generateFactListMessage(
					await getGuildFacts(interaction.guildId!),
					pageNumber,
					autoReplyOnly,
				),
			);
		}
	}
};

export const handleAutoReplyCommand = async (
	interaction: ChatInputCommandInteraction,
) => {
	const subject = serializeSubject(
		interaction.options.getString("subiect", true),
	);
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
	await generateContentCache(allFacts);
};

const FACT_LIST_PAGE_SIZE = 15;
const generateFactListMessage = (
	facts: GuildFacts,
	pageNumber: number,
	autoReplyOnly: boolean,
): InteractionReplyOptions & InteractionUpdateOptions => {
	let factList = Object.values(facts).filter(
		(f) => f !== undefined,
	) as FactInfo[];
	if (autoReplyOnly) factList = factList.filter((f) => f.autoReply);

	const maxPageNumber = Math.ceil(factList.length / FACT_LIST_PAGE_SIZE) - 1;
	pageNumber = Math.min(pageNumber, maxPageNumber);
	pageNumber = Math.max(pageNumber, 0);
	const pageContent = factList.slice(
		pageNumber * FACT_LIST_PAGE_SIZE,
		(pageNumber + 1) * FACT_LIST_PAGE_SIZE,
	);

	const navigationRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setEmoji("⬅")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(pageNumber === 0)
			.setCustomId(
				`info-list-navigation|${pageNumber - 1}|${autoReplyOnly}`,
			),
		new ButtonBuilder()
			.setEmoji("➡")
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(pageNumber === maxPageNumber)
			.setCustomId(
				`info-list-navigation|${pageNumber + 1}|${autoReplyOnly}`,
			),
	);

	const embed = new EmbedBuilder()
		.setTitle(`Pagina ${pageNumber + 1}/${maxPageNumber + 1}`)
		.setColor("Gold")
		.setDescription(
			pageContent
				.map(
					(f, i) =>
						`${i + 1 + pageNumber * FACT_LIST_PAGE_SIZE}. **${
							f.subject
						}** ${f.autoReply ? "`(R)`" : ""}`,
				)
				.join("\n"),
		);
	const hasAutoReply = pageContent.find((f) => f.autoReply) !== undefined;
	if (hasAutoReply) embed.setFooter({ text: "(R): Auto-reply pornit" });

	return {
		content: `Mai multe informații despre un subiect: </info despre:${process.env.INFO_COMMAND_ID}>.`,
		embeds: [embed],
		// @ts-ignore
		components: maxPageNumber !== 0 ? [navigationRow] : [],
	};
};

export const handleInfoListButtonInteraction = async (
	interaction: ButtonInteraction,
) => {
	const [idFirst, idMiddle, idLast] = interaction.customId.split("|");
	const pageNumber = parseInt(idMiddle);
	const autoReplyOnly = idLast === "true";

	interaction.update(
		generateFactListMessage(
			await getGuildFacts(interaction.guildId!),
			pageNumber,
			autoReplyOnly,
		),
	);
};

export const handleMessageCreation = async (message: Message) => {
	if (!factContentCache.has(message.guildId!)) console.log("No cache");
	const contentMapping = await getContentCache(message.guildId!);
	const body = contentMapping.get(serializeSubject(message.content));
	if (body)
		message.reply({
			allowedMentions: {
				parse: [],
				repliedUser: false,
			},
			content: body,
		});
};
