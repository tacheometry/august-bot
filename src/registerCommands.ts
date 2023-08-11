import * as dotenv from "dotenv";
import { REST, Routes, SlashCommandBuilder, ChannelType } from "discord.js";
dotenv.config();

const COMMAND_DEFINITIONS = [
	new SlashCommandBuilder()
		.setName("pariu")
		.setDescription("Începe un pariu.")
		.addChannelOption((o) => o.setName("canal").setRequired(true).setDescription("Canalul pariului").addChannelTypes(ChannelType.GuildText))
		.setDefaultMemberPermissions(0)
		.setDMPermission(false)
];

const rest = new REST().setToken(
	process.env.DISCORD_TOKEN as string
);

const jsonCommands = COMMAND_DEFINITIONS.map((v) => v.toJSON());

console.log("Deploying...");
// rest.put(
// 	Routes.applicationGuildCommands(
// 		process.env.APP_ID as string,
// 		process.env.TEST_GUILD as string
// 	),
// 	{
// 		body: [],
// 	}
// );
rest.put(Routes.applicationCommands(process.env.APP_ID as string), {
	body: jsonCommands,
});
