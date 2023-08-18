import * as dotenv from "dotenv";
import {
	Client,
	GatewayIntentBits,
	Events,
	ActivityType,
	ChatInputCommandInteraction,
	TextChannel,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	APIActionRowComponent,
	APITextInputComponent,
	EmbedBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageCreateOptions,
	MessageEditOptions,
} from "discord.js";
import { DateTime } from "luxon";
import Keyv from "keyv";
dotenv.config();

const betDb = new Keyv(process.env.DB_URL, {
	namespace: "bets",
});
betDb.on("error", (err) => console.log("DB error:", err));

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

interface BetInfo {
	betId: string;
	titleText: string;
	descriptionText: string;
	rewardText: string;
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

enum TEAM_NAME {
	TEAM_1 = "TEAM_1",
	TEAM_2 = "TEAM_2",
}
const TEAM_EMOJI: Record<TEAM_NAME, string> = {
	[TEAM_NAME.TEAM_1]: "⬛",
	[TEAM_NAME.TEAM_2]: "⬜",
};

const TEAM_DISPLAY_NAME: Record<TEAM_NAME, string> = {
	[TEAM_NAME.TEAM_1]: "neagră",
	[TEAM_NAME.TEAM_2]: "albă",
};

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
								? participantIds
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

const startBet = async (
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

	refreshBetTimeout(info.betId, DateTime.fromISO(info.resultTime));

	return filledInfo;
};

const updateBetMessage = async (betInfo: BetInfo, skipEqualsCheck = true) => {
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

const endBet = async (betInfo: BetInfo) => {
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

	await updateBetMessage(betInfo, true);

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
};

const refreshBetTimeout = (betId: string, endAt: DateTime) => {
	if (timeoutsForBets.has(betId)) {
		clearTimeout(timeoutsForBets.get(betId));
		timeoutsForBets.delete(betId);
	}

	const timeout = setTimeout(async () => {
		const betInfo = await betDb.get(betId);
		await endBet(betInfo);
	}, endAt.diffNow().toMillis());

	timeoutsForBets.set(betId, timeout);
};

client.once(Events.ClientReady, async (c) => {
	console.log(`Logged in as ${c.user.tag}`);

	c.user.setActivity({
		name: "pariuri",
		type: ActivityType.Playing,
	});

	for await (let [betId, v] of betDb.iterator()) {
		const betInfo = v as BetInfo;

		if (!betInfo.winningTeam)
			refreshBetTimeout(betId, DateTime.fromISO(betInfo.resultTime));
	}
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (interaction.isCommand()) {
		interaction = interaction as ChatInputCommandInteraction;

		switch (interaction.commandName) {
			case "pariu": {
				const postChannel = interaction.options.getChannel(
					"canal",
					true,
				) as TextChannel;

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
								new ActionRowBuilder().addComponents(
									textBuilder,
								) as
									| ActionRowBuilder<TextInputBuilder>
									| APIActionRowComponent<APITextInputComponent>,
						),
					);

					await interaction.showModal(modal);
				}
				interaction = await interaction.awaitModalSubmit({
					filter: (i) => i.customId === betId,
					time: 5 * 60 * 1000,
				});

				if (!interaction.isModalSubmit()) return;
				const titleText = interaction.fields.getTextInputValue("title");
				const descriptionText =
					interaction.fields.getTextInputValue("description");
				const rewardText =
					interaction.fields.getTextInputValue("reward");
				const resultAnnouncementTimeText =
					interaction.fields.getTextInputValue("resultTime");
				const muteDurationText =
					interaction.fields.getTextInputValue("muteDuration");

				await interaction.deferReply({
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
					interaction.editReply({
						content: `Timpul anunțării rezultatelor este greșit (\`${resultAnnouncementTime.invalidExplanation}\`).`,
					});
					return;
				}

				if (
					resultAnnouncementTime.diffNow().as("days") > 10 ||
					resultAnnouncementTime < DateTime.now()
				) {
					interaction.editReply({
						content: `Timpul anunțării rezultatelor este greșit, probabil (<t:${resultAnnouncementTime.toSeconds()}:F>).`,
					});
					return;
				}

				const betInfo = await startBet(postChannel, {
					betId,
					titleText,
					descriptionText,
					rewardText,
					muteHours: muteDurationHours,
					resultTime: resultAnnouncementTime.toISO()!,
					hostName: interaction.user.displayName,
					hostPicture:
						interaction.user.avatarURL({
							forceStatic: true,
							size: 128,
						}) ?? interaction.user.defaultAvatarURL,
					participants: {},
				});

				await interaction.editReply({
					content: `Pariu creat: https://discord.com/channels/${interaction.guildId}/${betInfo.channelId}/${betInfo.messageId}`,
				});

				break;
			}
		}
	}
	if (interaction.isButton()) {
		const [idFirst, idMiddle, idLast] = interaction.customId.split("|");

		if (idFirst === "enter-team") {
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

			updateBetMessage(betInfo, true);
		}
	}
});

client.login(process.env.DISCORD_TOKEN);
