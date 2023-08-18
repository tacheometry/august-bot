import * as dotenv from "dotenv";
import { Client, GatewayIntentBits, Events, ActivityType } from "discord.js";
import {
	refreshAllBetTimeouts,
	handleButtonInteraction,
	handleCreateBetCommand,
} from "./betUtil";
import {
	handleAutoReplyCommand,
	handleInfoCommand,
	handleMessageCreation,
	respondToSubjectAutocomplete,
} from "./factUtil";
dotenv.config();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

client.once(Events.ClientReady, async (c) => {
	console.log(`Logged in as ${c.user.tag}`);

	c.user.setActivity({
		name: "pariuri",
		type: ActivityType.Playing,
	});

	await refreshAllBetTimeouts(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	switch (interaction.commandName) {
		case "pariu": {
			handleCreateBetCommand(interaction);
			break;
		}
		case "info": {
			handleInfoCommand(interaction);
			break;
		}
		case "auto-reply": {
			handleAutoReplyCommand(interaction);
			break;
		}
	}
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isButton()) return;
	if (!interaction.customId.startsWith("enter-team")) return;

	await handleButtonInteraction(interaction);
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isAutocomplete()) return;
	if (
		interaction.commandName !== "info" &&
		interaction.commandName !== "auto-reply"
	)
		return;

	await respondToSubjectAutocomplete(interaction);
});

client.on(Events.MessageCreate, async (message) => {
	await handleMessageCreation(message);
});

client.login(process.env.DISCORD_TOKEN);
