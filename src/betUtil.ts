import {
	APIActionRowComponent,
	APITextInputComponent,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	CacheType,
	ChatInputCommandInteraction,
	Client,
	EmbedBuilder,
	MessageCreateOptions,
	MessageEditOptions,
	ModalBuilder,
	TextChannel,
	TextInputBuilder,
	TextInputStyle,
} from "discord.js";
import { DateTime } from "luxon";
import Keyv from "keyv";
import * as dotenv from "dotenv";
import { getUnbGuildConfig } from "./unbUtil";
import { Client as UnbClient } from "unb-api";
dotenv.config();

export interface BetInfo {
	betId: string;
	titleText: string;
	descriptionText: string;
	rewardText: string;
	currencyReward?: number;
	resultTime: string;
	muteHours: number;
	channelId: string;
	messageId: string;
	participants: Record<string, string>;
	hostName: string;
	hostPicture: string;
	pingRoleId?: string;
	winningTeam?: string;
}

export interface GuildBetSchedule {
	postAtHour: number;
	resultHour: number;
	betInfo: Omit<
		BetInfo,
		"betId" | "resultTime" | "messageId" | "participants"
	>;
}
export interface GuildBetConfigInfo {
	pingRoleId?: string;
	schedule?: GuildBetSchedule;
}

export enum TEAM_NAME {
	TEAM_1 = "TEAM_1",
	TEAM_2 = "TEAM_2",
}
export const TEAM_EMOJI: Record<TEAM_NAME, string> = {
	[TEAM_NAME.TEAM_1]: "⬛",
	[TEAM_NAME.TEAM_2]: "⬜",
};
export const TEAM_DISPLAY_NAME: Record<TEAM_NAME, string> = {
	[TEAM_NAME.TEAM_1]: "neagră",
	[TEAM_NAME.TEAM_2]: "albă",
};

export const betDb = new Keyv(process.env.DB_URL, {
	namespace: "bets",
});
betDb.on("error", (err) => console.log("DB error:", err));
export const betConfigDb = new Keyv(process.env.DB_URL, {
	namespace: "bet_config",
});
betConfigDb.on("error", (err) => console.log("DB error:", err));
const timeoutsForBets = new Map<string, NodeJS.Timeout>();

const generateBetMessage = (
	info: Omit<BetInfo, "messageId" | "channelId">,
): MessageCreateOptions & MessageEditOptions => {
	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`enter-team|${TEAM_NAME.TEAM_1}|${info.betId}`)
			.setStyle(ButtonStyle.Primary)
			.setEmoji(TEAM_EMOJI[TEAM_NAME.TEAM_1])
			.setLabel(`Echipa ${TEAM_DISPLAY_NAME[TEAM_NAME.TEAM_1]}`),
		new ButtonBuilder()
			.setCustomId(`enter-team|${TEAM_NAME.TEAM_2}|${info.betId}`)
			.setStyle(ButtonStyle.Primary)
			.setEmoji(TEAM_EMOJI[TEAM_NAME.TEAM_2])
			.setLabel(`Echipa ${TEAM_DISPLAY_NAME[TEAM_NAME.TEAM_2]}`),
	);

	const finishedRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId("finished")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(true)
			.setLabel("Pariu terminat")
			.setEmoji("✅"),
	);

	const participantIds = Object.keys(info.participants);
	const participantsExtra =
		participantIds.length >= 10 ? ` (${participantIds.length})` : "";

	return {
		content: info.pingRoleId ? `<@&${info.pingRoleId}>` : undefined,
		allowedMentions: {
			roles: info.pingRoleId ? [info.pingRoleId] : [],
		},
		embeds: [
			new EmbedBuilder()
				.setTitle(info.titleText)
				.setDescription(
					info.descriptionText +
						"\n\nAlegeți echipa apăsând unul dintre butoanele de mai jos pentru a participa.",
				)
				.addFields(
					{
						name: "Câștigătorii primesc",
						value: info.rewardText,
					},
					{
						name: "Pierzătorii primesc",
						value: `Timeout timp de **${info.muteHours}h**!`,
					},
					info.winningTeam
						? {
								name: "Rezultat",
								value:
									participantIds.length > 0
										? `**${
												// @ts-ignore
												TEAM_EMOJI[info.winningTeam]
										  } Echipa ${
												// @ts-ignore
												TEAM_DISPLAY_NAME[
													info.winningTeam
												]
										  } a câștigat.**`
										: "Nu au fost destui participanți pentru a termina acest pariu.",
						  }
						: {
								name: "Rezultatele sunt anunțate",
								value: `<t:${DateTime.fromISO(
									info.resultTime,
								).toSeconds()}:R>`,
						  },
					{
						name: "Participanți" + participantsExtra,
						value:
							participantIds.length > 0
								? participantIds.length > 43
									? participantIds
											.slice(0, 43)
											.map((k) => `<@${k}>`)
											.join(", ") +
									  `, și alți ${participantIds.length - 43}`
									: participantIds
											.map((k) => `<@${k}>`)
											.join(", ")
								: "*nimeni*",
					},
				)
				.setColor(
					info.winningTeam
						? info.winningTeam === TEAM_NAME.TEAM_1
							? "DarkButNotBlack"
							: "White"
						: "Gold",
				)
				.setFooter({
					text: `Găzduit de ${info.hostName} | ${info.betId}`,
					iconURL: info.hostPicture,
				}),
		],
		// @ts-ignore
		components: info.winningTeam ? [finishedRow] : [row],
	};
};

export const startBet = async (
	channel: TextChannel,
	info: Omit<BetInfo, "messageId" | "channelId">,
): Promise<BetInfo> => {
	console.log(`Starting ${info.betId}`);

	const message = await channel.send(generateBetMessage(info));

	const filledInfo: BetInfo = {
		...info,
		channelId: message.channelId,
		messageId: message.id,
	};

	await betDb.set(info.betId, filledInfo);

	refreshBetTimeout(
		channel.client,
		info.betId,
		DateTime.fromISO(info.resultTime),
	);

	return filledInfo;
};

export const updateBetMessage = async (
	client: Client,
	betInfo: BetInfo,
	skipEqualsCheck = true,
) => {
	const messagePromise = (
		(await client.channels.fetch(betInfo.channelId)) as
			| TextChannel
			| undefined
	)?.messages.fetch(betInfo.messageId);
	if (!messagePromise) return;
	const message = await messagePromise;
	if (!message) return;

	const upToDateMessage = generateBetMessage(betInfo);
	if (!skipEqualsCheck) {
		if (
			message.content !== upToDateMessage.content ||
			!message.embeds?.[0] ||
			// @ts-ignore
			!message.embeds[0].equals(upToDateMessage.embeds[0])
		) {
			console.log(`Skipped updating bet message ${betInfo.betId}`);
			return;
		}
	}

	await message.edit(upToDateMessage);
};

const endBet = async (client: Client, betInfo: BetInfo) => {
	if (betInfo.winningTeam) return;
	console.log(`Ending ${betInfo.betId}`);
	const winningTeam =
		Math.random() < 0.5 ? TEAM_NAME.TEAM_1 : TEAM_NAME.TEAM_2;
	betInfo.winningTeam = winningTeam;
	const losingTeam =
		winningTeam === TEAM_NAME.TEAM_1 ? TEAM_NAME.TEAM_2 : TEAM_NAME.TEAM_1;

	await betDb.set(betInfo.betId, betInfo);

	const channel = (await client.channels.fetch(betInfo.channelId)) as
		| TextChannel
		| undefined;
	if (!channel) return;
	const messagePromise = channel.messages.fetch(betInfo.messageId);
	if (!messagePromise) return;
	const message = await messagePromise;
	if (!message) return;

	await updateBetMessage(client, betInfo, true);

	const winners: string[] = [];
	const losers: string[] = [];
	Object.entries(betInfo.participants).forEach(([k, v]) => {
		if (v === betInfo.winningTeam) winners.push(k);
		else losers.push(k);
	});

	if (Object.keys(betInfo.participants).length === 0) return;

	const winnerSubText =
		winners.length > 0
			? `Felicitări membrilor:\n${winners
					.map((id) => `* <@${id}>`)
					.join(";\n")}.\n\nVeți primi recompensele în scurt timp.`
			: "Dar nu are niciun membru...";
	const loserSubText =
		losers.length > 0
			? `Membrii următori iau timeout ${betInfo.muteHours} ore: ${losers
					.map((id) => `<@${id}>`)
					.join(", ")}.`
			: "Dar nu are niciun membru...";

	await message.reply({
		// @ts-ignore
		content: `## ${TEAM_EMOJI[winningTeam]} Echipa ${TEAM_DISPLAY_NAME[winningTeam]} câștigă!\n\n${winnerSubText}`,
	});

	await channel.send({
		// @ts-ignore
		content: `### Echipa ${TEAM_DISPLAY_NAME[losingTeam]} a pierdut...\n\n${loserSubText}\n\nVă mulțumim pentru participare! Mult noroc la următorul pariu!`,
	});

	const timeoutShouldEndAt = DateTime.fromISO(betInfo.resultTime)
		.plus({ hours: betInfo.muteHours })
		.toMillis();

	for (const loserPromise of losers.map((id) =>
		channel.guild.members.fetch({
			user: id,
		}),
	)) {
		await loserPromise
			.then((l) =>
				l
					.timeout(
						timeoutShouldEndAt - Date.now(),
						"A pierdut un pariu.",
					)
					.catch(() =>
						console.log(`Couldn't time out ${l.displayName}`),
					),
			)
			.catch(() => console.log("Couldn't fetch member"));
	}

	if (!betInfo.currencyReward) return;
	const unbData = await getUnbGuildConfig(channel.guildId);
	if (!unbData || !unbData.token) return;
	const unbClient = new UnbClient(unbData.token);

	winners.forEach((winnerId) =>
		unbClient
			.editUserBalance(
				channel.guildId,
				winnerId,
				{
					bank: betInfo.currencyReward,
				},
				`${betInfo.betId} | ${betInfo.titleText}`,
			)
			.catch((reason) =>
				console.warn(
					`Couldn't award user ${winnerId} through UnbelievaBoat: ${reason}`,
				),
			),
	);
};

const refreshBetTimeout = (client: Client, betId: string, endAt: DateTime) => {
	if (timeoutsForBets.has(betId)) {
		clearTimeout(timeoutsForBets.get(betId));
		timeoutsForBets.delete(betId);
	}

	const timeout = setTimeout(async () => {
		const betInfo = await betDb.get(betId);
		await endBet(client, betInfo);
	}, endAt.diffNow().toMillis());

	timeoutsForBets.set(betId, timeout);
};

export const refreshAllBetTimeouts = async (client: Client) => {
	for await (let [betId, v] of betDb.iterator()) {
		const betInfo = v as BetInfo;

		if (!betInfo.winningTeam)
			refreshBetTimeout(
				client,
				betId,
				DateTime.fromISO(betInfo.resultTime),
			);
	}
};

export const handleBetButtonInteraction = async (
	interaction: ButtonInteraction,
) => {
	const [idFirst, idMiddle, idLast] = interaction.customId.split("|");

	const teamName = idMiddle;
	const betId = idLast;

	const betInfo = (await betDb.get(betId)) as BetInfo | undefined;

	if (
		!betInfo ||
		DateTime.fromISO(betInfo.resultTime)! < DateTime.now() ||
		betInfo.winningTeam
	) {
		interaction.reply({
			ephemeral: true,
			content: "Acest pariu nu mai este valabil.",
		});
		return;
	}

	const userId = interaction.user.id;
	let replyMessage;
	if (betInfo.participants[userId] === teamName) {
		delete betInfo.participants[userId];
		replyMessage = "Ai ieșit din pariu.";
	} else {
		betInfo.participants[userId] = teamName;
		// @ts-ignore
		replyMessage = `Te-ai înscris în pariu cu echipa ${TEAM_DISPLAY_NAME[teamName]}. Noroc!`;
	}

	await betDb.set(betId, betInfo);

	interaction.reply({
		ephemeral: true,
		content: replyMessage,
	});

	updateBetMessage(interaction.client, betInfo, true);
};

export const handleCreateBetCommand = async (
	interaction: ChatInputCommandInteraction<CacheType>,
) => {
	const postChannel = interaction.options.getChannel(
		"canal",
		true,
	) as TextChannel;
	const betHost =
		interaction.options.getUser("host", false) ?? interaction.user;

	const betId = `pariu-${interaction.id}`;

	{
		const modal = new ModalBuilder()
			.setCustomId(betId)
			.setTitle("Creare pariu");

		const titleInput = new TextInputBuilder()
			.setCustomId("title")
			.setLabel("Titlu")
			.setStyle(TextInputStyle.Short)
			.setValue("Pariu");

		const descriptionInput = new TextInputBuilder()
			.setCustomId("description")
			.setLabel("Descriere")
			.setStyle(TextInputStyle.Paragraph);

		const rewardDescriptionInput = new TextInputBuilder()
			.setCustomId("reward")
			.setLabel("Descriere recompensă")
			.setPlaceholder("!500 pentru recompensă UnbelievaBoat")
			.setStyle(TextInputStyle.Paragraph);

		const resultAnnouncementTimeInput = new TextInputBuilder()
			.setCustomId("resultTime")
			.setLabel("Timpul anunțării rezultatelor")
			.setStyle(TextInputStyle.Short);

		const muteDurationInput = new TextInputBuilder()
			.setCustomId("muteDuration")
			.setLabel("Durata de timeout (ore)")
			.setStyle(TextInputStyle.Short)
			.setValue("12");

		modal.addComponents(
			...[
				titleInput,
				descriptionInput,
				rewardDescriptionInput,
				resultAnnouncementTimeInput,
				muteDurationInput,
			].map(
				(textBuilder) =>
					new ActionRowBuilder().addComponents(textBuilder) as
						| ActionRowBuilder<TextInputBuilder>
						| APIActionRowComponent<APITextInputComponent>,
			),
		);

		await interaction.showModal(modal);
	}
	const modalInteraction = await interaction.awaitModalSubmit({
		filter: (i) => i.customId === betId,
		time: 5 * 60 * 1000,
	});

	if (!modalInteraction.isModalSubmit()) return;
	const titleText = modalInteraction.fields.getTextInputValue("title");
	const descriptionText =
		modalInteraction.fields.getTextInputValue("description");
	let rewardText = modalInteraction.fields.getTextInputValue("reward");
	const resultAnnouncementTimeText =
		modalInteraction.fields.getTextInputValue("resultTime");
	const muteDurationText =
		modalInteraction.fields.getTextInputValue("muteDuration");

	await modalInteraction.deferReply({
		ephemeral: true,
	});

	const muteDurationHours =
		Math.floor(parseFloat(muteDurationText) * 10) / 10;

	const resultAnnouncementTime = DateTime.fromISO(
		resultAnnouncementTimeText,
		{
			locale: "ro-RO",
			zone: "Europe/Bucharest",
		},
	);

	if (resultAnnouncementTime.invalidReason) {
		modalInteraction.editReply({
			content: `Timpul anunțării rezultatelor este greșit (\`${resultAnnouncementTime.invalidExplanation}\`).`,
		});
		return;
	}

	if (
		resultAnnouncementTime.diffNow().as("days") > 10 ||
		resultAnnouncementTime < DateTime.now()
	) {
		modalInteraction.editReply({
			content: `Timpul anunțării rezultatelor este greșit, probabil (<t:${resultAnnouncementTime.toSeconds()}:F>).`,
		});
		return;
	}

	let currencyAmount = undefined;
	if (rewardText.startsWith("!")) {
		currencyAmount = parseInt(rewardText.substring(1));
		if (currencyAmount !== currencyAmount) currencyAmount = undefined;
	}
	if (currencyAmount) {
		const unbData = await getUnbGuildConfig(interaction.guildId!);
		rewardText = `${currencyAmount} ${
			unbData?.currencyText ?? "bani UnbelievaBoat"
		}`;
	}

	const configData = (await betConfigDb.get(interaction.guildId!)) as
		| GuildBetConfigInfo
		| undefined;

	const betInfo = await startBet(postChannel, {
		betId,
		titleText,
		descriptionText,
		rewardText,
		currencyReward: currencyAmount,
		muteHours: muteDurationHours,
		resultTime: resultAnnouncementTime.toISO()!,
		hostName: betHost.displayName,
		hostPicture:
			betHost.avatarURL({
				forceStatic: true,
				size: 128,
			}) ?? betHost.defaultAvatarURL,
		participants: {},
		pingRoleId: configData?.pingRoleId,
	});

	await modalInteraction.editReply({
		content: `Pariu creat: https://discord.com/channels/${interaction.guildId}/${betInfo.channelId}/${betInfo.messageId}`,
	});
};

export const handleConfigPingRoleCommand = async (
	interaction: ChatInputCommandInteraction<CacheType>,
) => {
	const role = interaction.options.getRole("role", true);
	let newConfig = (await betConfigDb.get(interaction.guildId!)) as
		| GuildBetConfigInfo
		| undefined;
	newConfig ??= {};
	newConfig.pingRoleId = role.id;

	await betConfigDb.set(interaction.guildId!, newConfig);

	interaction.reply({
		content: `<@&${role.id}> va fi notificat la pariuri.`,
		options: {
			allowedMentions: {
				parse: [],
			},
		},
	});
};
