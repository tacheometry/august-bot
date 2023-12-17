import * as dotenv from "dotenv";
import {
	REST,
	Routes,
	SlashCommandBuilder,
	ChannelType,
	ContextMenuCommandBuilder,
	ApplicationCommandType,
} from "discord.js";
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
		.addUserOption((o) =>
			o
				.setName("host")
				.setRequired(false)
				.setDescription("Gazda pariului"),
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
	new SlashCommandBuilder()
		.setName("config")
		.setDescription("Configurează botul.")
		.setDMPermission(false)
		.setDefaultMemberPermissions(0)
		.addSubcommand((c) =>
			c
				.setName("unbelievaboat")
				.setDescription("Configurează UnbelievaBoat")
				.addStringOption((o) =>
					o
						.setName("currency")
						.setDescription("Textul pentru monedă.")
						.setRequired(true),
				)
				.addStringOption((o) =>
					o.setName("token").setDescription("UnblievaBoat token."),
				),
		)
		.addSubcommand((c) =>
			c
				.setName("ping-role")
				.setDescription(
					"Configurează rolul care va fi menționat la pariuri",
				)
				.addRoleOption((o) =>
					o
						.setName("role")
						.setDescription("Rolul respectiv")
						.setRequired(true),
				),
		)
		.addSubcommand((c) =>
			c
				.setName("schedule")
				.setDescription("Programează un pariu zilnic")
				.addStringOption((o) =>
					o
						.setName("post-time")
						.setDescription("Ora la care se postează pariul")
						.setMaxLength(5)
						.setRequired(true),
				)
				.addStringOption((o) =>
					o
						.setName("result-time")
						.setDescription("Ora la care se încheie pariul")
						.setMaxLength(5)
						.setRequired(true),
				)
				.addChannelOption((o) =>
					o
						.setName("channel")
						.setRequired(true)
						.setDescription("Canalul pariului")
						.addChannelTypes(ChannelType.GuildText),
				)
				.addStringOption((o) =>
					o
						.setName("reward")
						.setDescription("Recompensa pariului")
						.setRequired(true),
				)
				.addNumberOption((o) =>
					o
						.setName("timeout-hours")
						.setDescription("Timeout pentru pierzători")
						.setMinValue(0)
						.setRequired(true),
				),
		)
		.addSubcommand((c) =>
			c
				.setName("schedule-delete")
				.setDescription("Oprește pariul automat zilnic"),
		),
	new ContextMenuCommandBuilder()
		.setName("Adaugă info")
		.setType(ApplicationCommandType.Message),
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
