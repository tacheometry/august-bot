import * as dotenv from "dotenv";
import { REST, Routes, SlashCommandBuilder, ChannelType } from "discord.js";
dotenv.config();

const COMMAND_DEFINITIONS = [
	new SlashCommandBuilder()
		.setName("pariu")
		.setDescription("Începe un pariu.")
		.addChannelOption((o) =>
			o
				.setName("canal")
				.setRequired(true)
				.setDescription("Canalul pariului")
				.addChannelTypes(ChannelType.GuildText),
		)
		.setDefaultMemberPermissions(0)
		.setDMPermission(false),
	new SlashCommandBuilder()
		.setName("info")
		.setDescription("Informații despre un subiect, după comunitate.")
		.setDMPermission(false)
		.addSubcommand((c) =>
			c
				.setName("despre")
				.setDescription(
					"Informații despre un subiect, după comunitate.",
				)
				.addStringOption((o) =>
					o
						.setName("subiect")
						.setRequired(false)
						.setDescription("Subiectul despre care iei informația.")
						.setAutocomplete(true)
						.setMaxLength(100),
				),
		)
		.addSubcommand((c) =>
			c
				.setName("edit")
				.setDescription("Adaugă/editează informații.")
				.addStringOption((o) =>
					o
						.setName("subiect")
						.setRequired(true)
						.setDescription(
							"Subiectul despre care vrei să adaugi o informație.",
						)
						.setMaxLength(100),
				)
				.addStringOption((o) =>
					o
						.setName("info")
						.setRequired(true)
						.setDescription(
							"Informația despre subiect. Scrie REMOVE pentru a șterge.",
						)
						.setMaxLength(1900),
				),
		)
		.addSubcommand((c) =>
			c
				.setName("list")
				.setDescription("Vezi toate subiectele.")
				.addBooleanOption((o) =>
					o
						.setName("auto-reply")
						.setRequired(false)
						.setDescription(
							"Dacă trebuie să fie incluse numai subiectele cu auto-reply.",
						),
				)
				.addIntegerOption((o) =>
					o
						.setName("pagina")
						.setRequired(false)
						.setDescription("Numărul paginii din listă.")
						.setMinValue(1),
				),
		),
	new SlashCommandBuilder()
		.setName("auto-reply")
		.setDescription(
			"Activează/dezactivează auto-reply pentru un anumit subiect.",
		)
		.setDMPermission(false)
		.setDefaultMemberPermissions(0)
		.addStringOption((o) =>
			o
				.setName("subiect")
				.setDescription(
					"Subiectul pentru care activezi/dezactivezi auto-reply.",
				)
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addBooleanOption((o) =>
			o.setName("on").setDescription("Pornit/oprit").setRequired(true),
		),
];

const rest = new REST().setToken(process.env.DISCORD_TOKEN as string);

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
